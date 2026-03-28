export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS' | 'ANY';

export type RiskHint =
  | 'raw_sql'           // string interpolation into SQL query
  | 'eval_usage'        // eval() or Function() constructor
  | 'no_auth'           // no auth middleware on route
  | 'query_in_db'       // req.query/req.params used directly in DB call
  | 'missing_validation'// no input validation library detected on handler
  | 'file_path_concat'  // user input concatenated into fs path
  | 'shell_exec'        // exec/spawn with user input
  | 'mass_assignment'   // spread of req.body into create/update
  | 'admin_route'       // path contains /admin, /internal, /debug, /superuser
  | 'unprotected_write' // POST/PUT/DELETE with no_auth
  | 'idor_candidate';   // resource route with :id param and no obvious ownership check

export interface Endpoint {
  method: HttpMethod;
  path: string;
  file: string;
  line: number;
  riskHints: RiskHint[];
  authMiddleware: string[];  // middleware names detected on this route
  handlerSource?: string;    // up to 500 chars of the handler body for agent context
  bodyFields: string[];      // req.body field names extracted from handler
  queryParams: string[];     // req.query param names extracted from handler
}

export interface StaticAnalysisResult {
  source: 'openapi' | 'express' | 'fastify' | 'hono' | 'fastapi' | 'unknown';
  endpoints: Endpoint[];
  totalFiles: number;
  analysedFiles: number;
}
