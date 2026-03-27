import Anthropic from '@anthropic-ai/sdk';
import { spawn } from 'child_process';
import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { findings, scans, scanRequests } from '../../db/schema';
import { emitEvent } from '../../lib/events';
import type { AgentEndpoint } from '../static-analysis';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AttackerOptions {
  scanId: string;
  targetBaseUrl: string;
  attackProfile: 'Quick' | 'Standard' | 'Aggressive';
  knownEndpoints: AgentEndpoint[];
}

export interface AttackerResult {
  findingsCount: number;
  requestsFired: number;
}

interface AttackVector {
  endpoint: string;
  test_path: string;
  method: string;
  test_name: string;
  vuln_class: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  description: string;
  payloads: Array<{
    headers?: Record<string, string>;
    body?: string;
    query?: string;
    auth?: 'none' | 'bearer';
  }>;
  vuln_condition: string;
  fix_suggestion: string;
  cwe_id: string;
  owasp_category: string;
}

interface AttackResult {
  test_name: string;
  vuln_class: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  endpoint: string;
  method: string;
  vulnerable: boolean;
  evidence: string;
  request: { method: string; url: string; headers: Record<string, string>; body: string | null };
  response: { status: number; body: string };
  fix_suggestion: string;
  cwe_id: string;
  owasp_category: string;
}

// ─── Step 1: Generate attack plan ────────────────────────────────────────────

/** Replace Express/FastAPI path params with safe test values so the script can call real URLs. */
function substituteParams(path: string): string {
  return path.replace(/:([a-zA-Z_]+)/g, (_match, name: string) => {
    const lower = name.toLowerCase();
    if (/\buser/.test(lower)) return '1';
    if (/\bpost/.test(lower)) return '1';
    if (/\bchannel/.test(lower)) return '1';
    if (/\bmessage/.test(lower)) return '1';
    if (/\bcomment/.test(lower)) return '1';
    if (/\bid$/.test(lower)) return '1';
    return 'test';
  });
}

const BATCH_SIZE: Record<'Quick' | 'Standard' | 'Aggressive', number> = {
  Quick: 20,
  Standard: 10,
  Aggressive: 8,
};

const ATTACK_PLAN_SYSTEM = `You are an expert API penetration tester. Given a list of API endpoints with risk hints extracted from their source code, generate a targeted attack plan.

Output ONLY a valid JSON array of attack vectors. Each element must match this shape exactly:
{
  "endpoint": "/path/template",
  "test_path": "/path/with/real/values",
  "method": "GET|POST|PUT|PATCH|DELETE",
  "test_name": "short_snake_case_name",
  "vuln_class": "sql_injection|auth_bypass|idor|broken_access_control|xss|ssrf|path_traversal|mass_assignment|csrf|rate_limiting",
  "severity": "critical|high|medium|low|info",
  "description": "what this test checks",
  "payloads": [{ "headers": {}, "body": "string or null", "query": "?param=value or null", "auth": "none|bearer" }],
  "vuln_condition": "JS expression using 'status' (number) and 'body' (string) — e.g. status === 200 && body.includes('token')",
  "fix_suggestion": "brief remediation advice",
  "cwe_id": "CWE-NNN",
  "owasp_category": "API N:2023 Category Name"
}

CRITICAL: "test_path" must have all :param placeholders replaced with real test values (e.g. /users/:id → /users/1).
No markdown, no explanation — only the JSON array.`;

function parseVectors(text: string): AttackVector[] {
  const t = text.trim();
  try {
    return JSON.parse(t) as AttackVector[];
  } catch {
    try {
      const match = t.match(/\[[\s\S]*\]/);
      if (match) return JSON.parse(match[0]) as AttackVector[];
    } catch {
      // truncated or malformed
    }
    console.warn('[attacker] parseVectors failed, raw response preview:', t.slice(0, 300));
    return [];
  }
}

async function generateAttackPlan(
  endpoints: AgentEndpoint[],
  profile: 'Quick' | 'Standard' | 'Aggressive',
  scanId: string,
): Promise<AttackVector[]> {
  await emitEvent(scanId, 'info', `Generating attack plan for ${endpoints.length} endpoints…`);

  const profileInstruction =
    profile === 'Quick'
      ? 'Generate 1 high-impact attack vector per endpoint that has risk hints. Skip endpoints with no risk hints.'
      : profile === 'Standard'
      ? 'Cover OWASP API Top 10. Generate 1–2 vectors per endpoint, prioritise risky ones.'
      : 'Be thorough. Generate 2–3 vectors per endpoint covering all OWASP API Top 10 categories.';

  // Batch to stay within output token limits per call
  const batchSize = BATCH_SIZE[profile];
  const batches: AgentEndpoint[][] = [];
  for (let i = 0; i < endpoints.length; i += batchSize) {
    batches.push(endpoints.slice(i, i + batchSize));
  }

  await emitEvent(scanId, 'info', `Attack plan: ${batches.length} batches (concurrency: 3)…`);

  async function runBatch(batch: AgentEndpoint[], i: number): Promise<AttackVector[]> {
    const endpointList = batch
      .map((e) => {
        const testPath = substituteParams(e.path);
        const paramNote = testPath !== e.path ? ` (test as: ${testPath})` : '';
        return (
          `${e.method} ${e.path}${paramNote}` +
          (e.auth ? '' : ' [NO AUTH]') +
          (e.risk_hints.length ? ` [risks: ${e.risk_hints.join(', ')}]` : '')
        );
      })
      .join('\n');

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 8192,
      system: `${ATTACK_PLAN_SYSTEM}\n\n${profileInstruction}`,
      messages: [{ role: 'user', content: `API endpoints:\n${endpointList}` }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '[]';
    const vectors = parseVectors(text);
    if (vectors.length === 0) {
      await emitEvent(scanId, 'info', `Batch ${i + 1} returned 0 vectors (stop_reason: ${response.stop_reason})`);
    }
    return vectors;
  }

  // Run with capped concurrency (max 3 parallel Claude calls)
  const MAX_CONCURRENT = 3;
  const results: AttackVector[][] = [];
  for (let i = 0; i < batches.length; i += MAX_CONCURRENT) {
    const chunk = batches.slice(i, i + MAX_CONCURRENT);
    const chunkResults = await Promise.all(chunk.map((batch, j) => runBatch(batch, i + j)));
    results.push(...chunkResults);
  }

  const allVectors = results.flat();
  await emitEvent(scanId, 'success', `Attack plan ready · ${allVectors.length} vectors`);

  if (allVectors.length > 0) {
    const lines = allVectors.map((v) => `  ${v.method.padEnd(6)} ${v.test_path}  [${v.vuln_class}]`).join('\n');
    await emitEvent(scanId, 'info', `Targets:\n${lines}`);
  }

  return allVectors;
}

// ─── Step 2: Generate attack script ──────────────────────────────────────────

function buildAttackScript(vectorsPath: string, targetBaseUrl: string): string {
  // Fixed execution template — no LLM call needed, no token limit issues.
  // Vectors live in a JSON sidecar file; vuln_condition is eval'd via new Function.
  return `
import { readFileSync } from 'fs';

const BASE_URL = ${JSON.stringify(targetBaseUrl)};
const vectors = JSON.parse(readFileSync(${JSON.stringify(vectorsPath)}, 'utf8'));

for (const vector of vectors) {
  for (const payload of vector.payloads) {
    const headers = Object.assign({}, payload.headers ?? {});
    if (payload.auth === 'bearer') headers['Authorization'] = 'Bearer test-token';

    const url = BASE_URL + vector.test_path + (payload.query ?? '');
    let status = 0;
    let body = '';

    try {
      const res = await fetch(url, {
        method: vector.method,
        headers,
        body: payload.body ?? undefined,
        signal: AbortSignal.timeout(5000),
      });
      status = res.status;
      body = (await res.text()).slice(0, 1000);
    } catch (err) {
      body = err.message;
    }

    let vulnerable = false;
    try {
      vulnerable = !!new Function('status', 'body', 'return (' + vector.vuln_condition + ')')(status, body);
    } catch { }

    const result = {
      test_name: vector.test_name,
      vuln_class: vector.vuln_class,
      severity: vector.severity,
      title: vector.title ?? vector.test_name,
      endpoint: vector.endpoint,
      method: vector.method,
      vulnerable,
      evidence: vulnerable
        ? 'status=' + status + ' body=' + body.slice(0, 300)
        : 'status=' + status,
      request: { method: vector.method, url, headers, body: payload.body ?? null },
      response: { status, body: body.slice(0, 500) },
      fix_suggestion: vector.fix_suggestion,
      cwe_id: vector.cwe_id,
      owasp_category: vector.owasp_category,
    };

    process.stdout.write(JSON.stringify(result) + '\\n');
  }
}
`.trimStart();
}

// ─── Step 3: Execute the script (streaming NDJSON) ───────────────────────────

async function executeScript(
  vectors: AttackVector[],
  targetBaseUrl: string,
  scanId: string,
): Promise<AttackResult[]> {
  await emitEvent(scanId, 'info', `Executing ${vectors.length} attack vectors…`);

  const vectorsPath = join(tmpdir(), `vulnscout-${scanId}.json`);
  const scriptPath = join(tmpdir(), `vulnscout-${scanId}.mjs`);
  await writeFile(vectorsPath, JSON.stringify(vectors), 'utf8');
  await writeFile(scriptPath, buildAttackScript(vectorsPath, targetBaseUrl), 'utf8');

  return new Promise((resolve, reject) => {
    const results: AttackResult[] = [];
    let lineBuffer = '';

    const child = spawn('node', [scriptPath], {
      timeout: 3 * 60 * 1000,
    });

    child.stdout.on('data', (chunk: Buffer) => {
      lineBuffer += chunk.toString();
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const result: AttackResult = JSON.parse(trimmed);
          results.push(result);

          // Emit live — method + endpoint + status, flag vulnerabilities
          const prefix = `${result.method} ${result.endpoint} → ${result.response.status}`;
          if (result.vulnerable) {
            emitEvent(
              scanId,
              result.severity === 'critical' || result.severity === 'high' ? result.severity : 'medium',
              `${prefix}  ⚠ ${result.test_name}`,
            ).catch(() => {});
          } else {
            emitEvent(scanId, 'info', prefix).catch(() => {});
          }
        } catch {
          // not a JSON line — ignore
        }
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString().trim();
      console.warn(`[attacker] stderr: ${text}`);
      emitEvent(scanId, 'info', `[script] ${text.slice(0, 300)}`).catch(() => {});
    });

    child.on('close', async (code) => {
      await unlink(scriptPath).catch(() => {});
      await unlink(vectorsPath).catch(() => {});
      const vulnCount = results.filter((r) => r.vulnerable).length;
      await emitEvent(
        scanId,
        'success',
        `Script complete (exit ${code}) · ${results.length} tests · ${vulnCount} vulnerabilities found`,
      );
      resolve(results);
    });

    child.on('error', async (err) => {
      await unlink(scriptPath).catch(() => {});
      await unlink(vectorsPath).catch(() => {});
      reject(err);
    });
  });
}

// ─── Step 4: Record findings ──────────────────────────────────────────────────

async function recordFindings(
  results: AttackResult[],
  scanId: string,
): Promise<number> {
  // Save every request to the audit log
  for (const r of results) {
    await db.insert(scanRequests).values({
      scanId,
      testName: r.test_name,
      vulnClass: r.vuln_class,
      method: r.method,
      url: r.request.url,
      endpoint: r.endpoint,
      status: r.response.status,
      requestHeaders: (r.request.headers ?? {}) as Record<string, string>,
      requestBody: r.request.body ?? null,
      responseBody: r.response.body?.slice(0, 1000) ?? null,
      vulnerable: r.vulnerable ? 'true' : 'false',
    });
  }

  const vulnerable = results.filter((r) => r.vulnerable);

  for (const r of vulnerable) {
    await db.insert(findings).values({
      scanId,
      severity: r.severity,
      vulnClass: r.vuln_class,
      title: r.title,
      endpoint: r.endpoint,
      method: r.method,
      description: r.evidence,
      proofRequest: {
        method: r.request.method,
        url: r.request.url,
        headers: r.request.headers ?? {},
        body: r.request.body ?? undefined,
      },
      proofResponse: {
        status: r.response.status,
        body_excerpt: (r.response.body ?? '').slice(0, 500),
      },
      curlCommand: buildCurl(r),
      fixSuggestion: r.fix_suggestion,
      cweId: r.cwe_id,
      owaspCategory: r.owasp_category,
    });

    await emitEvent(
      scanId,
      r.severity === 'critical' || r.severity === 'high' ? r.severity : 'info',
      `[${r.severity.toUpperCase()}] ${r.title} · ${r.endpoint}`,
    );
  }

  return vulnerable.length;
}

function buildCurl(r: AttackResult): string {
  const parts = [`curl -X ${r.request.method} "${r.request.url}"`];
  for (const [k, v] of Object.entries(r.request.headers ?? {})) {
    parts.push(`  -H "${k}: ${v}"`);
  }
  if (r.request.body) {
    parts.push(`  -d '${r.request.body}'`);
  }
  return parts.join(' \\\n');
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function runAttacker(options: AttackerOptions): Promise<AttackerResult> {
  const { scanId, targetBaseUrl, attackProfile, knownEndpoints } = options;

  await emitEvent(
    scanId,
    'info',
    `Attacker ready · profile: ${attackProfile} · ${knownEndpoints.length} endpoints`,
  );

  // 1. Generate attack plan
  const vectors = await generateAttackPlan(knownEndpoints, attackProfile, scanId);
  if (!vectors.length) {
    await emitEvent(scanId, 'info', 'No attack vectors generated');
    return { findingsCount: 0, requestsFired: 0 };
  }

  // 2. Execute
  let results: AttackResult[] = [];
  try {
    results = await executeScript(vectors, targetBaseUrl, scanId);
  } catch (err) {
    await emitEvent(scanId, 'error', `Script execution failed: ${(err as Error).message}`);
  }

  // 4. Record findings
  const findingsCount = await recordFindings(results, scanId);

  // Update scan counters
  await db
    .update(scans)
    .set({
      requestsFired: results.length,
      critical: results.filter((r) => r.vulnerable && r.severity === 'critical').length,
      high: results.filter((r) => r.vulnerable && r.severity === 'high').length,
      medium: results.filter((r) => r.vulnerable && r.severity === 'medium').length,
      low: results.filter((r) => r.vulnerable && r.severity === 'low').length,
      info: results.filter((r) => r.vulnerable && r.severity === 'info').length,
    })
    .where(eq(scans.id, scanId));

  return { findingsCount, requestsFired: results.length };
}
