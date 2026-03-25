import type { AgentEndpoint } from '../static-analysis';

export interface PromptContext {
  targetBaseUrl: string;
  attackProfile: 'Quick' | 'Standard' | 'Aggressive';
  knownEndpoints: AgentEndpoint[];
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

function formatEndpointList(endpoints: AgentEndpoint[]): string {
  if (endpoints.length === 0) return '  (none — discover endpoints by probing common paths)';

  return endpoints
    .map((e) => {
      const hints = e.risk_hints.length > 0 ? ` [risks: ${e.risk_hints.join(', ')}]` : '';
      const auth = e.auth ? '' : ' [NO AUTH]';
      return `  ${e.method.padEnd(7)} ${e.path}${auth}${hints}`;
    })
    .join('\n');
}

export function buildSystemPrompt(ctx: PromptContext): string {
  const endpointList = formatEndpointList(ctx.knownEndpoints);

  // Surface high-priority targets for the agent
  const priorityTargets = ctx.knownEndpoints
    .filter((e) => e.risk_hints.length > 0 || !e.auth)
    .slice(0, 20);

  const prioritySection =
    priorityTargets.length > 0
      ? `\nPRIORITY TARGETS (flagged by static analysis)\n` +
        priorityTargets
          .map((e) => `  ${e.method.padEnd(7)} ${e.path} → ${e.risk_hints.join(', ') || 'no auth'}`)
          .join('\n')
      : '';

  return `You are an expert API security researcher conducting an authorized penetration test.

TARGET
  Base URL : ${ctx.targetBaseUrl}
  Profile  : ${ctx.attackProfile}

KNOWN ENDPOINTS (from static analysis)
${endpointList}
${prioritySection}

ATTACK SCOPE
${OWASP_CATEGORIES}

DEPTH GUIDANCE
${PROFILE_DEPTH[ctx.attackProfile]}

METHODOLOGY
1. Call get_endpoints() first — it returns the statically-discovered routes with risk annotations.
2. Prioritise endpoints flagged [NO AUTH] or with risk hints like raw_sql, idor_candidate, no_auth.
3. For each endpoint, send a legitimate request first to understand its shape and auth requirements.
4. Then test attack scenarios relevant to that endpoint type:
   - Login endpoints      → SQL injection (' OR '1'='1--), weak credentials
   - Authenticated routes → try without a token, then with a low-priv token
   - Resource routes (/users/:id, /orders/:id) → IDOR (swap IDs between accounts)
   - Write endpoints (POST/PUT/DELETE) → mass assignment, authorization bypass
   - Admin routes         → access with a regular-user token
   - raw_sql hint         → prioritise injection payloads on that endpoint
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
  const count = ctx.knownEndpoints.length;
  const risky = ctx.knownEndpoints.filter((e) => e.risk_hints.length > 0 || !e.auth).length;

  const hint =
    count > 0
      ? `Static analysis found ${count} endpoints (${risky} flagged as risky). `
      : '';

  return (
    `Begin the penetration test of ${ctx.targetBaseUrl}.\n\n` +
    `${hint}Start by calling get_endpoints() to see the full annotated attack surface, ` +
    `then systematically probe and attack the API according to the ${ctx.attackProfile} profile.`
  );
}
