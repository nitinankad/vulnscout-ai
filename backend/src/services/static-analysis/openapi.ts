import { promises as fs } from 'fs';
import path from 'path';
import yaml from 'yaml';
import type { Endpoint, HttpMethod, RiskHint } from './types';

interface OpenApiDoc {
  openapi?: string;
  swagger?: string;
  paths?: Record<string, Record<string, OpenApiOperation>>;
  components?: { securitySchemes?: Record<string, unknown> };
}

interface OpenApiOperation {
  operationId?: string;
  summary?: string;
  security?: unknown[];
  parameters?: Array<{ in: string; name: string; required?: boolean }>;
  requestBody?: unknown;
  'x-internal'?: boolean;
}

const OPENAPI_FILENAMES = [
  'openapi.json', 'openapi.yaml', 'openapi.yml',
  'swagger.json', 'swagger.yaml', 'swagger.yml',
  'api-spec.json', 'api-spec.yaml',
  'api.json', 'api.yaml',
];

const OPENAPI_DIRS = ['', 'docs', 'spec', 'api', '.'];

/**
 * Searches common locations for an OpenAPI/Swagger spec and parses it.
 * Returns null if none found.
 */
export async function findAndParseOpenApi(repoDir: string): Promise<Endpoint[] | null> {
  for (const dir of OPENAPI_DIRS) {
    for (const filename of OPENAPI_FILENAMES) {
      const candidate = path.join(repoDir, dir, filename);
      try {
        const raw = await fs.readFile(candidate, 'utf-8');
        const doc = parseDoc(raw, filename);
        if (isOpenApiDoc(doc)) {
          return convertOpenApiToEndpoints(doc, candidate);
        }
      } catch {
        // file not found or parse error — try next
      }
    }
  }
  return null;
}

function parseDoc(raw: string, filename: string): unknown {
  if (filename.endsWith('.json')) return JSON.parse(raw);
  return yaml.parse(raw);
}

function isOpenApiDoc(doc: unknown): doc is OpenApiDoc {
  if (typeof doc !== 'object' || doc === null) return false;
  const d = doc as Record<string, unknown>;
  return (
    (typeof d['openapi'] === 'string' || typeof d['swagger'] === 'string') &&
    typeof d['paths'] === 'object'
  );
}

function convertOpenApiToEndpoints(doc: OpenApiDoc, specFile: string): Endpoint[] {
  const endpoints: Endpoint[] = [];
  const paths = doc.paths ?? {};
  const hasGlobalSecurity = hasGlobalSecurityScheme(doc);

  let lineNo = 1; // OpenAPI specs don't give us line numbers easily

  for (const [routePath, methods] of Object.entries(paths)) {
    for (const [rawMethod, operation] of Object.entries(methods)) {
      const method = rawMethod.toUpperCase() as HttpMethod;
      if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(method)) continue;

      const riskHints = detectOpenApiRisks(routePath, method, operation, hasGlobalSecurity);

      // Extract parameter names from OpenAPI spec
      const op = operation as Record<string, unknown>;
      const params = (op['parameters'] as Array<Record<string, unknown>> | undefined) ?? [];
      const bodySchema = (op['requestBody'] as Record<string, unknown> | undefined);
      const bodyContent = bodySchema?.['content'] as Record<string, unknown> | undefined;
      const jsonSchema = (bodyContent?.['application/json'] as Record<string, unknown> | undefined);
      const schemaProps = ((jsonSchema?.['schema'] as Record<string, unknown> | undefined)?.['properties'] as Record<string, unknown> | undefined);
      const bodyFields = schemaProps ? Object.keys(schemaProps) : [];
      const queryParams = params
        .filter((p) => p['in'] === 'query')
        .map((p) => String(p['name'] ?? ''))
        .filter(Boolean);

      endpoints.push({
        method,
        path: normaliseOpenApiPath(routePath),
        file: specFile,
        line: lineNo++,
        riskHints,
        authMiddleware: operation.security
          ? ['openapi_security_defined']
          : hasGlobalSecurity
            ? ['global_security_scheme']
            : [],
        handlerSource: operation.summary ?? operation.operationId ?? '',
        bodyFields,
        queryParams,
      });
    }
  }

  return endpoints;
}

function detectOpenApiRisks(
  routePath: string,
  method: HttpMethod,
  operation: OpenApiOperation,
  hasGlobalSecurity: boolean,
): RiskHint[] {
  const hints = new Set<RiskHint>();

  // No security defined anywhere
  const routeHasSecurity = (operation.security && operation.security.length > 0);
  const noAuth = !routeHasSecurity && !hasGlobalSecurity;

  if (noAuth) hints.add('no_auth');

  // Admin / internal route
  if (/\/admin|\/internal|\/debug|\/superuser/i.test(routePath)) hints.add('admin_route');

  // IDOR candidate: path param named *id
  if (/\{[a-zA-Z]*[Ii][Dd]\}/.test(routePath)) hints.add('idor_candidate');

  // Unprotected write
  const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
  if (isWrite && noAuth) hints.add('unprotected_write');

  // x-internal flag
  if (operation['x-internal']) hints.add('admin_route');

  return [...hints];
}

function hasGlobalSecurityScheme(doc: OpenApiDoc): boolean {
  return (
    Object.keys(doc.components?.securitySchemes ?? {}).length > 0
  );
}

/** Convert OpenAPI {param} style to Express :param style */
function normaliseOpenApiPath(p: string): string {
  return p.replace(/\{([^}]+)\}/g, ':$1');
}
