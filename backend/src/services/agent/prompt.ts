export interface PromptContext {
  targetBaseUrl: string;
  attackProfile: 'Quick' | 'Standard' | 'Aggressive';
  knownEndpoints: string[];
}

const OWASP_CATEGORIES = `
- API1:2023  Broken Object Level Authorization (BOLA/IDOR)
- API2:2023  Broken Authentication
- API3:2023  Broken Object Property Level Authorization
- API4:2023  Unrestricted Resource Consumption
- API5:2023  Broken Function Level Authorization
- API6:2023  Unrestricted Access to Sensitive Business Flows
- API7:2023  Server Side Request Forgery
- API8:2023  Security Misconfiguration
- API9:2023  Improper Inventory Management
- API10:2023 Unsafe Consumption of APIs
`.trim();

const PROFILE_DEPTH: Record<PromptContext['attackProfile'], string> = {
  Quick:
    'Focus on the highest-impact, easiest-to-spot issues only: auth bypass on admin endpoints, ' +
    'SQL injection in login/search, and unauthenticated access to sensitive routes. ' +
    'Stop after finding 3 critical/high issues or after 20 requests.',
  Standard:
    'Cover the OWASP API Top 10 thoroughly. Test authentication, authorization on all resource ' +
    'endpoints (IDOR), input validation (SQL injection, XSS), and security misconfigurations. ' +
    'Stop after 60 requests or 10 minutes.',
  Aggressive:
    'Exhaustively test every discovered endpoint. Include chained attacks, privilege escalation, ' +
    'mass assignment, and business logic flaws. Do not self-limit on request count.',
};

export function buildSystemPrompt(ctx: PromptContext): string {
  const endpointList =
    ctx.knownEndpoints.length > 0
      ? ctx.knownEndpoints.map((e) => `  - ${e}`).join('\n')
      : '  (none — discover endpoints by probing common paths)';

  return `You are an expert API security researcher conducting an authorized penetration test.

TARGET
  Base URL : ${ctx.targetBaseUrl}
  Profile  : ${ctx.attackProfile}

KNOWN ENDPOINTS
${endpointList}

ATTACK SCOPE
${OWASP_CATEGORIES}

DEPTH GUIDANCE
${PROFILE_DEPTH[ctx.attackProfile]}

METHODOLOGY
1. Call get_endpoints() first to see any statically discovered routes.
2. Probe common API paths: /api/users, /api/auth/login, /api/admin, /api/posts, /health, etc.
3. For each endpoint, send a legitimate request first to understand its shape and auth requirements.
4. Then test attack scenarios relevant to that endpoint type:
   - Login endpoints      → SQL injection (' OR '1'='1--), weak credentials
   - Authenticated routes → try without a token, then with a low-priv token
   - Resource routes (/users/:id, /orders/:id) → IDOR (swap IDs)
   - Write endpoints (POST/PUT/DELETE) → CSRF, mass assignment, authorization
   - Admin routes         → access with a regular-user token
5. When you obtain a valid auth token (from a login response), call set_auth() so it is
   automatically injected into subsequent requests.
6. Only call record_finding() when you have a concrete HTTP proof — the exact request and
   response that demonstrates the flaw. Do not record theoretical or unconfirmed issues.
7. After recording a finding, continue testing other endpoints — do not stop early.

RULES
- Only attack ${ctx.targetBaseUrl}. Never make requests to external URLs.
- Be precise with JSON bodies — always use valid JSON strings.
- If a request returns an unexpected 5xx, note it but do not count it as a confirmed finding
  unless you can show it leaks data or has a security impact.
- When you have exhausted your test plan and recorded all confirmed findings, respond with a
  brief summary and stop calling tools.`;
}

export function buildInitialMessage(ctx: PromptContext): string {
  return (
    `Begin the penetration test of ${ctx.targetBaseUrl}.\n\n` +
    `Start by calling get_endpoints() to see the known attack surface, then systematically ` +
    `probe and attack the API according to the ${ctx.attackProfile} profile.`
  );
}
