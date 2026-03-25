import { promises as fs } from 'fs';
import path from 'path';
import type { Endpoint, HttpMethod, RiskHint } from './types';

/**
 * Each pattern captures:
 *   [1] method (or undefined for decorator-style)
 *   [2] path string
 */
const ROUTE_PATTERNS: { name: string; re: RegExp; methodGroup: number; pathGroup: number }[] = [
  // Express / Fastify / Hono: app.get('/path', ...) or router.post('/path', ...)
  {
    name: 'express',
    re: /(?:app|router|server|fastify|hono)\s*\.\s*(get|post|put|patch|delete|head|options|all)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
    methodGroup: 1,
    pathGroup: 2,
  },
  // Express route(): app.route('/path').get(...).post(...)
  {
    name: 'express_route',
    re: /(?:app|router)\s*\.\s*route\s*\(\s*['"`]([^'"`]+)['"`]\s*\)\s*\.\s*(get|post|put|patch|delete)/gi,
    methodGroup: 2,
    pathGroup: 1,
  },
  // FastAPI / Flask Python decorators: @app.get("/path") @router.post("/path")
  {
    name: 'fastapi',
    re: /@(?:app|router|blueprint)\s*\.\s*(get|post|put|patch|delete|head|options)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
    methodGroup: 1,
    pathGroup: 2,
  },
  // NestJS decorators: @Get('/path') @Post('/path')
  {
    name: 'nestjs',
    re: /@(Get|Post|Put|Patch|Delete|Head|Options)\s*\(\s*['"`]([^'"`]*)['"`]\s*\)/gi,
    methodGroup: 1,
    pathGroup: 2,
  },
  // NestJS @Controller prefix (no method — adds context to sibling decorators)
  // handled separately in extractNestJsController
];

// ─── Risk hint detectors ───────────────────────────────────────────────────────

interface RiskPattern {
  hint: RiskHint;
  re: RegExp;
}

const RISK_PATTERNS: RiskPattern[] = [
  { hint: 'raw_sql',            re: /(?:query|execute|raw)\s*\(\s*[`'"]\s*(?:SELECT|INSERT|UPDATE|DELETE|DROP)/i },
  { hint: 'raw_sql',            re: /\$\{.*(?:req\.(?:body|query|params)|request\.(?:body|query|params)).*\}.*(?:SELECT|INSERT|UPDATE|DELETE)/i },
  { hint: 'eval_usage',         re: /\beval\s*\(|new\s+Function\s*\(/ },
  { hint: 'query_in_db',        re: /(?:find|query|where|exec)\s*\(.*req\.(?:query|params|body)/ },
  { hint: 'file_path_concat',   re: /(?:readFile|writeFile|createReadStream|join|resolve)\s*\(.*req\.(?:query|params|body)/ },
  { hint: 'shell_exec',         re: /(?:exec|execSync|spawn|spawnSync)\s*\(.*req\.(?:query|params|body)/ },
  { hint: 'mass_assignment',    re: /(?:create|update|save|insert)\s*\(\s*(?:\.\.\.|Object\.assign\s*\(\s*\{\s*\})\s*,?\s*req\.body/ },
  { hint: 'missing_validation', re: /req\.body\b(?![\s\S]{0,200}(?:validate|schema|z\.|joi\.|yup\.|check\())/s },
];

// Auth middleware keywords — if a route handler line contains these before the controller fn it's protected
const AUTH_MIDDLEWARE_NAMES = [
  'requireAuth', 'authenticate', 'verifyToken', 'isAuthenticated',
  'authMiddleware', 'jwtAuth', 'passport', 'ensureLoggedIn',
  'checkAuth', 'auth', 'protect', 'loginRequired', 'get_current_user',
  'Depends(get_current_user', 'Depends(oauth2_scheme',
];

// ─── File walker ───────────────────────────────────────────────────────────────

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.py']);
const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '__pycache__', '.next', '.vite']);

export async function walkSourceFiles(dir: string): Promise<string[]> {
  const results: string[] = [];

  async function recurse(current: string) {
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await recurse(full);
      } else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        results.push(full);
      }
    }
  }

  await recurse(dir);
  return results;
}

// ─── Route extraction ──────────────────────────────────────────────────────────

export async function extractRoutesFromFile(filePath: string): Promise<Endpoint[]> {
  let source: string;
  try {
    source = await fs.readFile(filePath, 'utf-8');
  } catch {
    return [];
  }

  const endpoints: Endpoint[] = [];

  for (const pattern of ROUTE_PATTERNS) {
    const re = new RegExp(pattern.re.source, pattern.re.flags);
    let match: RegExpExecArray | null;

    while ((match = re.exec(source)) !== null) {
      const rawMethod = match[pattern.methodGroup]?.toLowerCase() ?? 'get';
      const rawPath = match[pattern.pathGroup] ?? '/';

      const method = normaliseMethod(rawMethod);
      const normPath = normalisePath(rawPath);

      const lineNo = getLineNumber(source, match.index);
      const handlerSource = extractHandlerSource(source, match.index);
      const riskHints = detectRiskHints(handlerSource, normPath, method);
      const authMiddleware = detectAuthMiddleware(source, match.index);

      endpoints.push({
        method,
        path: normPath,
        file: filePath,
        line: lineNo,
        riskHints,
        authMiddleware,
        handlerSource: handlerSource.slice(0, 500),
      });
    }
  }

  return deduplicateEndpoints(endpoints);
}

// ─── Risk detection ────────────────────────────────────────────────────────────

function detectRiskHints(handlerSource: string, routePath: string, method: HttpMethod): RiskHint[] {
  const hints = new Set<RiskHint>();

  for (const { hint, re } of RISK_PATTERNS) {
    if (re.test(handlerSource)) hints.add(hint);
  }

  // Admin route detection
  if (/\/admin|\/internal|\/debug|\/superuser|\/backdoor/i.test(routePath)) {
    hints.add('admin_route');
  }

  // IDOR candidate: resource path with :id / {id} param
  if (/\/:[a-zA-Z]*[Ii][Dd]\b|\{[a-zA-Z]*[Ii][Dd]\}/.test(routePath)) {
    // Only flag if no obvious ownership check in handler
    if (!/(?:userId|owner|createdBy|req\.user\.id)/.test(handlerSource)) {
      hints.add('idor_candidate');
    }
  }

  return [...hints];
}

function detectAuthMiddleware(source: string, matchIndex: number): string[] {
  // Look at the 300 chars before the route definition for middleware references
  const context = source.slice(Math.max(0, matchIndex - 300), matchIndex + 200);
  const found: string[] = [];
  for (const name of AUTH_MIDDLEWARE_NAMES) {
    if (context.includes(name)) found.push(name);
  }
  return found;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function normaliseMethod(raw: string): HttpMethod {
  const m = raw.toUpperCase();
  if (m === 'ALL') return 'ANY';
  return m as HttpMethod;
}

function normalisePath(raw: string): string {
  // Normalise FastAPI {param} style to Express :param style
  let p = raw.replace(/\{([^}]+)\}/g, ':$1');
  // Ensure leading slash
  if (!p.startsWith('/')) p = '/' + p;
  return p;
}

function getLineNumber(source: string, index: number): number {
  return source.slice(0, index).split('\n').length;
}

/**
 * Extract roughly the handler function body starting from the route definition.
 * Stops at the first balanced closing brace or after 2000 chars.
 */
function extractHandlerSource(source: string, matchIndex: number): string {
  const snippet = source.slice(matchIndex, matchIndex + 2000);
  let depth = 0;
  let started = false;
  for (let i = 0; i < snippet.length; i++) {
    if (snippet[i] === '{') { depth++; started = true; }
    else if (snippet[i] === '}') {
      depth--;
      if (started && depth === 0) return snippet.slice(0, i + 1);
    }
  }
  return snippet;
}

function deduplicateEndpoints(endpoints: Endpoint[]): Endpoint[] {
  const seen = new Set<string>();
  return endpoints.filter((e) => {
    const key = `${e.method}:${e.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Post-process: flag unprotected writes ─────────────────────────────────────

export function annotateUnprotectedWrites(endpoints: Endpoint[]): Endpoint[] {
  return endpoints.map((e) => {
    const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(e.method);
    const noAuth = e.authMiddleware.length === 0;

    if (isWrite && noAuth && !e.riskHints.includes('unprotected_write')) {
      return { ...e, riskHints: [...e.riskHints, 'unprotected_write'] };
    }
    return e;
  });
}
