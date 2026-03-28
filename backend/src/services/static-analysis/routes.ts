import { promises as fs } from 'fs';
import path from 'path';
import type { Endpoint, HttpMethod, RiskHint } from './types';

// ─── Router prefix resolution ──────────────────────────────────────────────────

/**
 * Scans all source files for `app.use('/prefix', importedRouter)` patterns and
 * resolves the imported file path. Returns a map of absFilePath → mountPrefix.
 * Does two passes to handle one level of nested router mounting.
 */
export async function buildFilePrefixMap(files: string[]): Promise<Map<string, string>> {
  const prefixMap = new Map<string, string>();

  // app.use('/prefix', ...args) — capture the full argument list after the path string
  const USE_MOUNT_RE = /(?:app|router|server)\s*\.\s*use\s*\(\s*['"`]([^'"`]+)['"`]\s*,([\s\S]*?)\)/g;

  // import defaultExport from './path'
  const IMPORT_DEFAULT_RE = /import\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s+from\s+['"`]([^'"`]+)['"`]/g;
  // import { named } from './path'  or  import { named as alias } from './path'
  const IMPORT_NAMED_RE = /import\s+\{[^}]*\b(?:(\w+)\s+as\s+)?(\w+)\s*\}\s*from\s+['"`]([^'"`]+)['"`]/g;
  // const varName = require('./path')
  const REQUIRE_RE = /(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;

  async function buildImportMap(source: string): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    let m: RegExpExecArray | null;

    const defRe = new RegExp(IMPORT_DEFAULT_RE.source, IMPORT_DEFAULT_RE.flags);
    while ((m = defRe.exec(source)) !== null) map.set(m[1], m[2]);

    const namedRe = new RegExp(IMPORT_NAMED_RE.source, IMPORT_NAMED_RE.flags);
    while ((m = namedRe.exec(source)) !== null) {
      // m[1] is original name if aliased, m[2] is local name, m[3] is path
      map.set(m[2], m[3]);
    }

    const reqRe = new RegExp(REQUIRE_RE.source, REQUIRE_RE.flags);
    while ((m = reqRe.exec(source)) !== null) map.set(m[1], m[2]);

    return map;
  }

  /** Extract all bare identifiers from a comma-separated argument list (ignores calls like cors()) */
  function extractIdentifiers(argList: string): string[] {
    // Only grab bare identifiers — skip anything followed by ( (i.e. function calls)
    return [...argList.matchAll(/\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b(?!\s*\()/g)].map((m) => m[1]);
  }

  async function processFile(
    file: string,
    existingPrefixMap: Map<string, string>,
    ownPrefix: string,
  ): Promise<void> {
    let source: string;
    try { source = await fs.readFile(file, 'utf-8'); } catch { return; }

    const importMap = await buildImportMap(source);

    const useRe = new RegExp(USE_MOUNT_RE.source, USE_MOUNT_RE.flags);
    let m: RegExpExecArray | null;
    while ((m = useRe.exec(source)) !== null) {
      const mountPrefix = normalisePath(m[1]);
      const argList = m[2];
      const identifiers = extractIdentifiers(argList);

      for (const varName of identifiers) {
        const importSpec = importMap.get(varName);
        if (!importSpec) continue;

        const resolved = resolveImportPath(path.dirname(file), importSpec, files);
        if (!resolved || existingPrefixMap.has(resolved)) continue;

        const composed = ownPrefix
          ? normalisePath(ownPrefix.replace(/\/$/, '') + '/' + mountPrefix.replace(/^\//, ''))
          : mountPrefix;
        existingPrefixMap.set(resolved, composed);
      }
    }
  }

  // First pass: direct mounts from all files
  for (const file of files) {
    await processFile(file, prefixMap, '');
  }

  // Second pass: compose nested prefixes (file A at /api uses file B at /users → B gets /api/users)
  for (const file of [...prefixMap.keys()]) {
    const ownPrefix = prefixMap.get(file)!;
    await processFile(file, prefixMap, ownPrefix);
  }

  return prefixMap;
}

function resolveImportPath(fromDir: string, importSpec: string, knownFiles: string[]): string | null {
  if (!importSpec.startsWith('.')) return null; // skip node_modules

  const base = path.resolve(fromDir, importSpec);

  // Normalise to forward slashes for comparison since walkSourceFiles may use either
  const normalise = (p: string) => p.replace(/\\/g, '/');
  const normBase = normalise(base);
  const normKnown = knownFiles.map(normalise);

  for (const ext of ['', '.ts', '.js', '.mjs', '.cjs']) {
    const candidate = normBase + ext;
    const idx = normKnown.indexOf(candidate);
    if (idx !== -1) return knownFiles[idx];
  }

  for (const ext of ['.ts', '.js', '.mjs', '.cjs']) {
    const candidate = normBase + '/index' + ext;
    const idx = normKnown.indexOf(candidate);
    if (idx !== -1) return knownFiles[idx];
  }

  return null;
}

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

export async function extractRoutesFromFile(filePath: string, mountPrefix = ''): Promise<Endpoint[]> {
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
      // Compose mount prefix + route path, collapsing duplicate slashes
      const routePath = normalisePath(rawPath);
      const normPath = mountPrefix
        ? normalisePath(mountPrefix.replace(/\/$/, '') + '/' + routePath.replace(/^\//, ''))
        : routePath;

      const lineNo = getLineNumber(source, match.index);
      const handlerSource = extractHandlerSource(source, match.index);
      const riskHints = detectRiskHints(handlerSource, normPath, method);
      const authMiddleware = detectAuthMiddleware(source, match.index);
      const { bodyFields, queryParams } = extractInputFields(handlerSource);

      endpoints.push({
        method,
        path: normPath,
        file: filePath,
        line: lineNo,
        riskHints,
        authMiddleware,
        handlerSource: handlerSource.slice(0, 500),
        bodyFields,
        queryParams,
      });
    }
  }

  return deduplicateEndpoints(endpoints);
}

// ─── Input field extraction ────────────────────────────────────────────────────

export function extractInputFields(source: string): { bodyFields: string[]; queryParams: string[] } {
  const body = new Set<string>();
  const query = new Set<string>();

  // req.body.field
  for (const m of source.matchAll(/req\.body\.([a-zA-Z_$][a-zA-Z0-9_$]*)/g))
    body.add(m[1]);

  // req.body['field'] or req.body["field"]
  for (const m of source.matchAll(/req\.body\[['"]([^'"]+)['"]\]/g))
    body.add(m[1]);

  // const/let/var { field1, field2 } = req.body
  for (const m of source.matchAll(/(?:const|let|var)\s*\{([^}]+)\}\s*=\s*req\.body/g)) {
    for (const part of m[1].split(',')) {
      const field = part.trim().split(/[=:]/)[0].trim();
      if (field && /^[a-zA-Z_$]/.test(field)) body.add(field);
    }
  }

  // hasProperties(req.body, "f1", "f2", ...)  — any argument-list pattern
  for (const m of source.matchAll(/hasPropert\w*\s*\(\s*req\.body\s*,([^)]+)\)/g)) {
    for (const part of m[1].split(',')) {
      const field = part.trim().replace(/^['"`]|['"`]$/g, '');
      if (field && /^[a-zA-Z_$]/.test(field)) body.add(field);
    }
  }

  // Zod: z.object({ field: z.string(), ... })
  for (const m of source.matchAll(/z\.object\s*\(\s*\{([^}]+)\}/g)) {
    for (const part of m[1].split(',')) {
      const field = part.trim().split(':')[0].trim();
      if (field && /^[a-zA-Z_$]/.test(field)) body.add(field);
    }
  }

  // Joi / yup: schema.keys({ field: ... }) or object({ field: ... })
  for (const m of source.matchAll(/(?:keys|shape|object)\s*\(\s*\{([^}]+)\}/g)) {
    for (const part of m[1].split(',')) {
      const field = part.trim().split(':')[0].trim();
      if (field && /^[a-zA-Z_$]/.test(field)) body.add(field);
    }
  }

  // Python FastAPI/Flask: request.json.get('field') / request.form.get('field')
  for (const m of source.matchAll(/request\.(?:json|form|data)\.get\s*\(\s*['"]([^'"]+)['"]/g))
    body.add(m[1]);

  // Python pydantic model fields: field: type  (inside a class body)
  for (const m of source.matchAll(/^\s{4}([a-zA-Z_]\w*)\s*:\s*(?:str|int|float|bool|Optional)/gm))
    body.add(m[1]);

  // req.query.field
  for (const m of source.matchAll(/req\.query\.([a-zA-Z_$][a-zA-Z0-9_$]*)/g))
    query.add(m[1]);

  // req.query['field']
  for (const m of source.matchAll(/req\.query\[['"]([^'"]+)['"]\]/g))
    query.add(m[1]);

  // const { field } = req.query
  for (const m of source.matchAll(/(?:const|let|var)\s*\{([^}]+)\}\s*=\s*req\.query/g)) {
    for (const part of m[1].split(',')) {
      const field = part.trim().split(/[=:]/)[0].trim();
      if (field && /^[a-zA-Z_$]/.test(field)) query.add(field);
    }
  }

  // Python: request.args.get('field')
  for (const m of source.matchAll(/request\.args\.get\s*\(\s*['"]([^'"]+)['"]/g))
    query.add(m[1]);

  return { bodyFields: [...body], queryParams: [...query] };
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
