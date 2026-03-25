import Anthropic from '@anthropic-ai/sdk';
import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { findings, scans } from '../../db/schema';
import { emitEvent } from '../../lib/events';
import { AGENT_TOOLS, type HttpRequestInput, type SetAuthInput, type RecordFindingInput } from './tools';
import { buildSystemPrompt, buildInitialMessage } from './prompt';
import type { AgentEndpoint } from '../static-analysis';

const WALL_CLOCK_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const MAX_TOKENS_PER_TURN = 4096;
const RESPONSE_BODY_LIMIT = 2000; // chars — keep context window manageable

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface AgentRunOptions {
  scanId: string;
  targetBaseUrl: string;
  attackProfile: 'Quick' | 'Standard' | 'Aggressive';
  knownEndpoints?: AgentEndpoint[];
}

export interface AgentRunResult {
  findingsCount: number;
  requestsFired: number;
  stoppedReason: 'end_turn' | 'timeout' | 'error';
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function runAgent(options: AgentRunOptions): Promise<AgentRunResult> {
  const { scanId, targetBaseUrl, attackProfile, knownEndpoints = [] } = options;

  await emitEvent(scanId, 'info', `AI agent initialised · profile: ${attackProfile}`);

  const state = {
    authToken: null as string | null,
    findingsCount: 0,
    requestsFired: 0,
    deadline: Date.now() + WALL_CLOCK_TIMEOUT_MS,
  };

  const systemPrompt = buildSystemPrompt({ targetBaseUrl, attackProfile, knownEndpoints });
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: buildInitialMessage({ targetBaseUrl, attackProfile, knownEndpoints }) },
  ];

  let stoppedReason: AgentRunResult['stoppedReason'] = 'end_turn';

  // ── ReAct loop ──────────────────────────────────────────────────────────────
  while (true) {
    if (Date.now() > state.deadline) {
      await emitEvent(scanId, 'info', 'Agent timeout reached — stopping');
      stoppedReason = 'timeout';
      break;
    }

    const response = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: MAX_TOKENS_PER_TURN,
      system: systemPrompt,
      tools: AGENT_TOOLS,
      messages,
    });

    // Emit any text/thinking blocks the agent produced
    for (const block of response.content) {
      if (block.type === 'text' && block.text.trim()) {
        await emitEvent(scanId, 'info', `[agent] ${block.text.trim().slice(0, 300)}`);
      }
    }

    // Add assistant turn to history
    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'end_turn') {
      await emitEvent(scanId, 'success', 'Agent finished');
      break;
    }

    if (response.stop_reason !== 'tool_use') {
      stoppedReason = 'error';
      break;
    }

    // ── Execute each tool call ───────────────────────────────────────────────
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;

      const result = await executeTool(block.name, block.input as Record<string, unknown>, {
        scanId,
        targetBaseUrl,
        knownEndpoints,
        state,
      });

      await emitEvent(
        scanId,
        'info',
        `[tool] ${block.name}(${summariseInput(block.input as Record<string, unknown>)}) → ${summariseResult(result)}`,
      );

      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(result),
      });
    }

    messages.push({ role: 'user', content: toolResults });
  }

  // Update scan counters
  await db
    .update(scans)
    .set({
      requestsFired: state.requestsFired,
      critical: await countBySeverity(scanId, 'critical'),
      high: await countBySeverity(scanId, 'high'),
      medium: await countBySeverity(scanId, 'medium'),
      low: await countBySeverity(scanId, 'low'),
      info: await countBySeverity(scanId, 'info'),
    })
    .where(eq(scans.id, scanId));

  return { findingsCount: state.findingsCount, requestsFired: state.requestsFired, stoppedReason };
}

// ─── Tool executor ────────────────────────────────────────────────────────────

interface ToolContext {
  scanId: string;
  targetBaseUrl: string;
  knownEndpoints: AgentEndpoint[];
  state: {
    authToken: string | null;
    findingsCount: number;
    requestsFired: number;
    deadline: number;
  };
}

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<unknown> {
  switch (name) {
    case 'http_request':
      return executeHttpRequest(input as unknown as HttpRequestInput, ctx);

    case 'set_auth': {
      const { token } = input as unknown as SetAuthInput;
      ctx.state.authToken = token;
      return { ok: true, message: 'Auth token stored' };
    }

    case 'get_endpoints':
      return { endpoints: ctx.knownEndpoints };

    case 'record_finding':
      return executeRecordFinding(input as unknown as RecordFindingInput, ctx);

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

async function executeHttpRequest(
  input: HttpRequestInput,
  ctx: ToolContext,
): Promise<unknown> {
  ctx.state.requestsFired++;

  const url = `${ctx.targetBaseUrl}${input.path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(input.headers ?? {}),
  };

  if (ctx.state.authToken && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${ctx.state.authToken}`;
  }

  const fetchOptions: RequestInit = {
    method: input.method,
    headers,
    signal: AbortSignal.timeout(10_000),
  };

  if (input.body && ['POST', 'PUT', 'PATCH'].includes(input.method)) {
    fetchOptions.body = input.body;
  }

  try {
    const res = await fetch(url, fetchOptions);
    const rawBody = await res.text();
    const body = rawBody.slice(0, RESPONSE_BODY_LIMIT);

    return {
      status: res.status,
      headers: Object.fromEntries(res.headers.entries()),
      body,
      truncated: rawBody.length > RESPONSE_BODY_LIMIT,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

async function executeRecordFinding(
  input: RecordFindingInput,
  ctx: ToolContext,
): Promise<unknown> {
  await db.insert(findings).values({
    scanId: ctx.scanId,
    severity: input.severity,
    vulnClass: input.vuln_class,
    title: input.title,
    endpoint: input.endpoint,
    method: input.method,
    description: input.description,
    proofRequest: {
      method: input.proof_request.method,
      url: `${ctx.targetBaseUrl}${input.proof_request.path}`,
      headers: input.proof_request.headers ?? {},
      body: input.proof_request.body,
    },
    proofResponse: {
      status: input.proof_response.status,
      body_excerpt: input.proof_response.body_excerpt,
    },
    curlCommand: buildCurlCommand(ctx.targetBaseUrl, input),
    fixSuggestion: input.fix_suggestion,
    cweId: input.cwe_id,
    owaspCategory: input.owasp_category,
  });

  ctx.state.findingsCount++;

  await emitEvent(
    ctx.scanId,
    input.severity === 'critical' || input.severity === 'high' ? input.severity : 'info',
    `[${input.severity.toUpperCase()}] ${input.title}`,
  );

  return { recorded: true, total_findings: ctx.state.findingsCount };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildCurlCommand(baseUrl: string, f: RecordFindingInput): string {
  const parts = [`curl -X ${f.proof_request.method} ${baseUrl}${f.proof_request.path}`];
  for (const [k, v] of Object.entries(f.proof_request.headers ?? {})) {
    parts.push(`  -H "${k}: ${v}"`);
  }
  if (f.proof_request.body) {
    parts.push(`  -d '${f.proof_request.body}'`);
  }
  return parts.join(' \\\n');
}

async function countBySeverity(
  scanId: string,
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info',
): Promise<number> {
  const rows = await db
    .select()
    .from(findings)
    .where(eq(findings.scanId, scanId));
  return rows.filter((r) => r.severity === severity).length;
}

function summariseInput(input: Record<string, unknown>): string {
  if (input.method && input.path) return `${input.method} ${input.path}`;
  if (input.token) return '***';
  if (input.title) return String(input.title).slice(0, 60);
  return JSON.stringify(input).slice(0, 80);
}

function summariseResult(result: unknown): string {
  if (typeof result === 'object' && result !== null) {
    const r = result as Record<string, unknown>;
    if (r.status) return `HTTP ${r.status}`;
    if (r.recorded) return `finding #${r.total_findings} recorded`;
    if (r.error) return `error: ${r.error}`;
  }
  return String(result).slice(0, 60);
}
