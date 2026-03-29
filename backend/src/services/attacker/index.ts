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
import { PAYLOAD_LIBRARY, resolvePayloads, SUPPORTED_VULN_CLASSES } from './payloads';
import type { PayloadSpec } from './payloads';

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

/**
 * What the LLM returns: endpoint → vuln class mapping only.
 * No payloads, no vuln_condition — those come from the static library.
 */
interface AttackMapping {
  endpoint: string;
  test_path: string;
  method: string;
  test_name: string;
  vuln_class: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  description: string;
  fix_suggestion: string;
  cwe_id: string;
  owasp_category: string;
}

/** Fully hydrated attack vector ready for execution. */
interface AttackVector {
  endpoint: string;
  test_path: string;
  method: string;
  test_name: string;
  vuln_class: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  description: string;
  payloads: PayloadSpec[];
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

// ─── Bootstrap auth ───────────────────────────────────────────────────────────

/**
 * Flexible bootstrap state. Special keys:
 * - `_authHeader`:      user A's full Authorization header value ("Bearer eyJ...")
 * - `_userBAuthHeader`: user B's Authorization header value (for IDOR cross-user tests)
 * All other keys: flattened response fields from register/login calls.
 */
type BootstrapState = Record<string, string>;

/** Ask the LLM to generate a valid request body for a given endpoint. */
async function generateTestBody(ep: AgentEndpoint): Promise<Record<string, unknown>> {
  if (ep.body_fields.length === 0) return {};
  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: `Generate a valid JSON request body for a ${ep.method} ${ep.path} endpoint.\nRequired fields: ${ep.body_fields.join(', ')}\nReturn ONLY a valid JSON object with those fields and realistic test values. No explanation.`,
      }],
    });
    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '{}';
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    // fall through to empty
  }
  return {};
}

/** Append a suffix to identifier-like fields to ensure unique credentials across test users. */
function makeUnique(body: Record<string, unknown>, suffix: string): Record<string, unknown> {
  const out = { ...body };
  for (const [k, v] of Object.entries(out)) {
    if (typeof v === 'string') {
      if (/email/i.test(k)) {
        const atIdx = v.indexOf('@');
        out[k] = atIdx > 0
          ? v.slice(0, atIdx) + '+' + suffix + v.slice(atIdx)
          : v + suffix + '@test.com';
      } else if (/^(username|user|name|login|handle)$/i.test(k)) {
        out[k] = v + '_' + suffix;
      }
    }
  }
  return out;
}

/** Flatten a JSON object into key=value pairs for state capture (depth 2, strings/numbers only). */
function flattenResponse(obj: unknown, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return out;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      out[key] = String(v);
    } else if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      Object.assign(out, flattenResponse(v, key));
    }
  }
  return out;
}

/** Find an auth header value by scanning flattened state keys for common token field names. */
function resolveAuthHeader(flat: Record<string, string>): string | null {
  const TOKEN_PATTERNS = [
    /token$/i, /^token/i, /accessToken/i, /access_token/i,
    /^jwt/i, /authToken/i, /auth_token/i, /bearerToken/i, /bearer_token/i, /idToken/i, /id_token/i,
  ];
  for (const [k, v] of Object.entries(flat)) {
    if (TOKEN_PATTERNS.some((re) => re.test(k)) && v.length > 8) {
      return v.startsWith('Bearer ') ? v : `Bearer ${v}`;
    }
  }
  return null;
}

/** Register + login one test user. Returns { authHeader, flat } or null on failure. */
async function bootstrapOneUser(
  registerEp: AgentEndpoint | undefined,
  loginEp: AgentEndpoint | undefined,
  targetBaseUrl: string,
  scanId: string,
  suffix: string,
): Promise<{ authHeader: string; flat: Record<string, string> } | null> {
  let flat: Record<string, string> = {};

  if (registerEp) {
    const rawBody = await generateTestBody(registerEp);
    const body = makeUnique(rawBody, suffix);
    try {
      const res = await fetch(targetBaseUrl + substituteParams(registerEp.path), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      });
      const text = await res.text();
      await emitEvent(scanId, 'info', `Bootstrap register [${suffix}] → ${res.status}`);
      try { Object.assign(flat, flattenResponse(JSON.parse(text))); } catch { /* not JSON */ }
    } catch (err) {
      await emitEvent(scanId, 'info', `Bootstrap register [${suffix}] failed: ${(err as Error).message}`);
    }
  }

  if (loginEp) {
    const rawBody = await generateTestBody(loginEp);
    const body = makeUnique(rawBody, suffix);
    try {
      const res = await fetch(targetBaseUrl + substituteParams(loginEp.path), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      });
      const text = await res.text();
      await emitEvent(scanId, 'info', `Bootstrap login [${suffix}] → ${res.status}`);
      try {
        const loginFlat = flattenResponse(JSON.parse(text));
        Object.assign(flat, loginFlat);
      } catch { /* not JSON */ }
    } catch (err) {
      await emitEvent(scanId, 'info', `Bootstrap login [${suffix}] failed: ${(err as Error).message}`);
    }
  }

  const authHeader = resolveAuthHeader(flat);
  if (!authHeader) return null;
  return { authHeader, flat };
}

async function bootstrapAuth(
  endpoints: AgentEndpoint[],
  targetBaseUrl: string,
  scanId: string,
): Promise<BootstrapState> {
  const state: BootstrapState = {};

  const registerEp = endpoints.find((e) => e.method === 'POST' && /register|signup|sign_up/i.test(e.path));
  const loginEp = endpoints.find((e) => e.method === 'POST' && /login|signin|sign_in|auth\/token|oauth\/token/i.test(e.path));

  if (!registerEp && !loginEp) {
    await emitEvent(scanId, 'info', 'Bootstrap: no register/login endpoints found — skipping auth bootstrap');
    return state;
  }

  const suffixA = Math.random().toString(36).slice(2, 8);
  const suffixB = Math.random().toString(36).slice(2, 8);

  // User A — primary auth user
  await emitEvent(scanId, 'info', 'Bootstrap: creating test user A…');
  const userA = await bootstrapOneUser(registerEp, loginEp, targetBaseUrl, scanId, suffixA);
  if (userA) {
    state['_authHeader'] = userA.authHeader;
    Object.assign(state, userA.flat);
    await emitEvent(scanId, 'success', 'Bootstrap user A: token captured');
  } else {
    await emitEvent(scanId, 'info', 'Bootstrap user A: no token captured — unauthenticated tests only');
  }

  // User B — second account for IDOR cross-user tests
  await emitEvent(scanId, 'info', 'Bootstrap: creating test user B (IDOR)…');
  const userB = await bootstrapOneUser(registerEp, loginEp, targetBaseUrl, scanId, suffixB);
  if (userB) {
    state['_userBAuthHeader'] = userB.authHeader;
    await emitEvent(scanId, 'success', 'Bootstrap user B: token captured');
  } else {
    await emitEvent(scanId, 'info', 'Bootstrap user B: no token — IDOR cross-user tests skipped');
  }

  const capturedKeys = Object.keys(state).filter((k) => !k.startsWith('_'));
  if (capturedKeys.length > 0) {
    await emitEvent(scanId, 'info', `Bootstrap captured: ${capturedKeys.slice(0, 10).join(', ')}`);
  }

  return state;
}

// ─── Step 1: Generate attack mappings ────────────────────────────────────────

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

const ATTACK_PLAN_SYSTEM = `You are an expert API penetration tester. Given a list of API endpoints with risk hints extracted from their source code, generate a targeted attack mapping.

Output ONLY a valid JSON array. Each element must match this shape exactly:
{
  "endpoint": "/path/template",
  "test_path": "/path/with/real/values",
  "method": "GET|POST|PUT|PATCH|DELETE",
  "test_name": "short_snake_case_name",
  "vuln_class": "one value from the supported list below",
  "severity": "critical|high|medium|low|info",
  "description": "what this test checks",
  "fix_suggestion": "brief remediation advice",
  "cwe_id": "CWE-NNN",
  "owasp_category": "API N:2023 Category Name"
}

Supported vuln_class values (use ONLY these): ${SUPPORTED_VULN_CLASSES}
Do NOT include "payloads" or "vuln_condition" fields — those are provided by the static payload library.

CRITICAL: "test_path" must have all :param placeholders replaced with real test values (e.g. /users/:id → /users/1).
No markdown, no explanation — only the JSON array.`;

function parseMappings(text: string): AttackMapping[] {
  const t = text.trim();
  try {
    return JSON.parse(t) as AttackMapping[];
  } catch {
    try {
      const match = t.match(/\[[\s\S]*\]/);
      if (match) return JSON.parse(match[0]) as AttackMapping[];
    } catch {
      // truncated or malformed
    }
    console.warn('[attacker] parseMappings failed, raw response preview:', t.slice(0, 300));
    return [];
  }
}

async function generateAttackMappings(
  endpoints: AgentEndpoint[],
  profile: 'Quick' | 'Standard' | 'Aggressive',
  scanId: string,
): Promise<AttackMapping[]> {
  await emitEvent(scanId, 'info', `Generating attack mappings for ${endpoints.length} endpoints…`);

  const profileInstruction =
    profile === 'Quick'
      ? 'Generate 1 high-impact mapping per endpoint that has risk hints. Skip endpoints with no risk hints.'
      : profile === 'Standard'
      ? 'Cover OWASP API Top 10. Generate 1–2 mappings per endpoint, prioritise risky ones.'
      : 'Be thorough. Generate 2–3 mappings per endpoint covering all OWASP API Top 10 categories.';

  const batchSize = BATCH_SIZE[profile];
  const batches: AgentEndpoint[][] = [];
  for (let i = 0; i < endpoints.length; i += batchSize) {
    batches.push(endpoints.slice(i, i + batchSize));
  }

  await emitEvent(scanId, 'info', `Attack mappings: ${batches.length} batch(es) · concurrency 3`);

  async function runBatch(batch: AgentEndpoint[], i: number): Promise<AttackMapping[]> {
    const endpointList = batch
      .map((e) => {
        const testPath = substituteParams(e.path);
        const paramNote = testPath !== e.path ? ` (test as: ${testPath})` : '';
        let line = `${e.method} ${e.path}${paramNote}`;
        if (!e.auth) line += ' [NO AUTH]';
        if (e.risk_hints.length) line += ` [risks: ${e.risk_hints.join(', ')}]`;
        if (e.body_fields.length) line += ` [body fields: ${e.body_fields.join(', ')}]`;
        if (e.query_params.length) line += ` [query params: ${e.query_params.join(', ')}]`;
        return line;
      })
      .join('\n');

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 8192,
      system: `${ATTACK_PLAN_SYSTEM}\n\n${profileInstruction}`,
      messages: [{ role: 'user', content: `API endpoints:\n${endpointList}` }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '[]';
    const mappings = parseMappings(text);
    if (mappings.length === 0) {
      await emitEvent(scanId, 'info', `Batch ${i + 1} returned 0 mappings (stop_reason: ${response.stop_reason})`);
    }
    return mappings;
  }

  const MAX_CONCURRENT = 3;
  const results: AttackMapping[][] = [];
  for (let i = 0; i < batches.length; i += MAX_CONCURRENT) {
    const chunk = batches.slice(i, i + MAX_CONCURRENT);
    const chunkResults = await Promise.all(chunk.map((batch, j) => runBatch(batch, i + j)));
    results.push(...chunkResults);
  }

  const allMappings = results.flat();
  await emitEvent(scanId, 'success', `Attack mappings ready · ${allMappings.length} vectors`);
  return allMappings;
}

/**
 * Merge LLM attack mappings with the static payload library.
 * Unknown vuln_class values are dropped. Endpoint body/query context is used
 * to produce context-aware payloads for injection attacks.
 */
function hydrateVectors(
  mappings: AttackMapping[],
  endpointMap: Map<string, AgentEndpoint>,
): AttackVector[] {
  const vectors: AttackVector[] = [];

  for (const m of mappings) {
    const config = PAYLOAD_LIBRARY[m.vuln_class];
    if (!config) {
      console.warn(`[attacker] Unknown vuln_class "${m.vuln_class}" — skipping`);
      continue;
    }

    // Look up endpoint metadata for context-aware payload generation
    const ep =
      endpointMap.get(`${m.method}:${m.endpoint}`) ??
      endpointMap.get(`${m.method}:${m.test_path}`);
    const bodyFields = ep?.body_fields ?? [];
    const queryParams = ep?.query_params ?? [];

    vectors.push({
      ...m,
      payloads: resolvePayloads(config, bodyFields, queryParams),
      vuln_condition: config.vuln_condition,
    });
  }

  return vectors;
}

// ─── Step 2: Generate attack script ──────────────────────────────────────────

function buildAttackScript(vectorsPath: string, targetBaseUrl: string, statePath: string): string {
  return `
import { readFileSync } from 'fs';

const BASE_URL = ${JSON.stringify(targetBaseUrl)};
const vectors = JSON.parse(readFileSync(${JSON.stringify(vectorsPath)}, 'utf8'));
const state = JSON.parse(readFileSync(${JSON.stringify(statePath)}, 'utf8'));

for (const vector of vectors) {
  for (const payload of vector.payloads) {
    const headers = Object.assign({}, payload.headers ?? {});
    const hasContentType = Object.keys(headers).some((k) => k.toLowerCase() === 'content-type');
    if (payload.body != null && !hasContentType) {
      headers['Content-Type'] = 'application/json';
    }
    if (payload.auth === 'user_b' && state._userBAuthHeader) {
      headers['Authorization'] = state._userBAuthHeader;
    } else if (payload.auth === 'bearer' && state._authHeader) {
      headers['Authorization'] = state._authHeader;
    }

    const url = BASE_URL + vector.test_path + (payload.query ?? '');
    let status = 0;
    let body = '';
    let responseHeaders = {};

    try {
      const res = await fetch(url, {
        method: vector.method,
        headers,
        body: payload.body ?? undefined,
        signal: AbortSignal.timeout(5000),
      });
      status = res.status;
      body = (await res.text()).slice(0, 1000);
      responseHeaders = Object.fromEntries(
        [...res.headers.entries()].map(([k, v]) => [k.toLowerCase(), v])
      );
    } catch (err) {
      body = err.message;
    }

    let vulnerable = false;
    try {
      vulnerable = !!new Function('status', 'body', 'responseHeaders',
        'return (' + vector.vuln_condition + ')'
      )(status, body, responseHeaders);
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
  state: BootstrapState,
  scanId: string,
): Promise<AttackResult[]> {
  await emitEvent(scanId, 'info', `Executing ${vectors.length} attack vectors…`);

  const vectorsPath = join(tmpdir(), `vulnscout-${scanId}.json`);
  const statePath = join(tmpdir(), `vulnscout-${scanId}-state.json`);
  const scriptPath = join(tmpdir(), `vulnscout-${scanId}.mjs`);
  await writeFile(vectorsPath, JSON.stringify(vectors), 'utf8');
  await writeFile(statePath, JSON.stringify(state), 'utf8');
  await writeFile(scriptPath, buildAttackScript(vectorsPath, targetBaseUrl, statePath), 'utf8');

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
      await unlink(statePath).catch(() => {});
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
      await unlink(statePath).catch(() => {});
      reject(err);
    });
  });
}

// ─── Step 4: Record findings ──────────────────────────────────────────────────

async function recordFindings(
  results: AttackResult[],
  scanId: string,
): Promise<number> {
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

  // Build endpoint lookup map for context-aware payload hydration
  const endpointMap = new Map<string, AgentEndpoint>();
  for (const ep of knownEndpoints) {
    endpointMap.set(`${ep.method}:${ep.path}`, ep);
    endpointMap.set(`${ep.method}:${substituteParams(ep.path)}`, ep);
  }

  // 1. Bootstrap auth (register + login for user_a and user_b)
  const bootstrapState = await bootstrapAuth(knownEndpoints, targetBaseUrl, scanId);

  // 2. Generate attack mappings (LLM: endpoint → vuln class only)
  const mappings = await generateAttackMappings(knownEndpoints, attackProfile, scanId);
  if (!mappings.length) {
    await emitEvent(scanId, 'info', 'No attack mappings generated');
    return { findingsCount: 0, requestsFired: 0 };
  }

  // 3. Hydrate vectors with static payloads + vuln conditions
  const vectors = hydrateVectors(mappings, endpointMap);
  await emitEvent(scanId, 'info', `Hydrated ${vectors.length} vectors · ${mappings.length - vectors.length} unknown vuln classes dropped`);

  if (vectors.length > 0) {
    const lines = vectors.map((v) => `  ${v.method.padEnd(6)} ${v.test_path}  [${v.vuln_class}]`).join('\n');
    await emitEvent(scanId, 'info', `Targets:\n${lines}`);
  }

  // 4. Execute
  let results: AttackResult[] = [];
  try {
    results = await executeScript(vectors, targetBaseUrl, bootstrapState, scanId);
  } catch (err) {
    await emitEvent(scanId, 'error', `Script execution failed: ${(err as Error).message}`);
  }

  // 5. Record findings
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
