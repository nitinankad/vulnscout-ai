import { emitEvent } from '../../lib/events';
import { findAndParseOpenApi } from './openapi';
import { walkSourceFiles, extractRoutesFromFile, annotateUnprotectedWrites } from './routes';
import type { StaticAnalysisResult, Endpoint } from './types';

export type { StaticAnalysisResult, Endpoint };
export type { HttpMethod, RiskHint } from './types';

/**
 * Run static analysis on a cloned repository.
 *
 * Priority:
 *  1. If an OpenAPI/Swagger spec exists, use it — richer and more accurate.
 *  2. Otherwise, walk source files and extract routes via regex patterns.
 *
 * Returns a StaticAnalysisResult with all discovered endpoints annotated
 * with risk hints ready to feed into the AI agent's get_endpoints() tool.
 */
export async function analyseRepo(repoDir: string, scanId: string): Promise<StaticAnalysisResult> {
  await emitEvent(scanId, 'info', '── Static analysis: scanning attack surface');

  // ── 1. Try OpenAPI first ───────────────────────────────────────────────────
  const openApiEndpoints = await findAndParseOpenApi(repoDir);

  if (openApiEndpoints !== null) {
    await emitEvent(
      scanId,
      'success',
      `Static analysis: OpenAPI spec found · ${openApiEndpoints.length} endpoints`,
    );
    return {
      source: 'openapi',
      endpoints: openApiEndpoints,
      totalFiles: 0,
      analysedFiles: 0,
    };
  }

  // ── 2. Walk source files ───────────────────────────────────────────────────
  await emitEvent(scanId, 'info', 'Static analysis: no OpenAPI spec — scanning source files');

  const files = await walkSourceFiles(repoDir);
  await emitEvent(scanId, 'info', `Static analysis: found ${files.length} source files`);

  const allEndpoints: Endpoint[] = [];
  let analysedFiles = 0;

  for (const file of files) {
    const endpoints = await extractRoutesFromFile(file);
    if (endpoints.length > 0) {
      allEndpoints.push(...endpoints);
      analysedFiles++;
    }
  }

  const annotated = annotateUnprotectedWrites(allEndpoints);

  // Detect framework from the endpoints found
  const source = detectFramework(files, annotated);

  await emitEvent(
    scanId,
    'success',
    `Static analysis: ${annotated.length} endpoints · ${annotated.filter((e) => e.riskHints.length > 0).length} with risk hints`,
  );

  return {
    source,
    endpoints: annotated,
    totalFiles: files.length,
    analysedFiles,
  };
}

/**
 * Serialise endpoints into a compact list for the agent's get_endpoints() response.
 * Strips large handler source to keep the context window manageable.
 */
export function formatEndpointsForAgent(result: StaticAnalysisResult): AgentEndpoint[] {
  return result.endpoints.map((e) => ({
    method: e.method,
    path: e.path,
    risk_hints: e.riskHints,
    auth: e.authMiddleware.length > 0,
  }));
}

export interface AgentEndpoint {
  method: string;
  path: string;
  risk_hints: string[];
  auth: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function detectFramework(
  files: string[],
  endpoints: Endpoint[],
): StaticAnalysisResult['source'] {
  const pyFiles = files.filter((f) => f.endsWith('.py'));
  if (pyFiles.length > 0) return 'fastapi';

  // Check if any endpoint came from a file that looks like Express or Hono
  const sources = new Set(endpoints.map((e) => e.file));
  for (const f of sources) {
    if (f.endsWith('.ts') || f.endsWith('.js') || f.endsWith('.mjs')) {
      // Heuristic: if "fastify" or "hono" appear in file names
      if (f.toLowerCase().includes('fastify')) return 'fastify';
      if (f.toLowerCase().includes('hono')) return 'hono';
    }
  }

  if (endpoints.length > 0) return 'express';
  return 'unknown';
}
