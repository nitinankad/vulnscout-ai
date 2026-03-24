export type SourceType = 'github' | 'docker' | 'openapi'
export type ScanStatus = 'queued' | 'running' | 'completed' | 'failed'

export interface Service {
  id: string
  name: string
  source_type: SourceType
  source: string
  branch?: string
  scan_count: number
  last_scanned: string
  last_scan_id: string
  last_scan_status: ScanStatus
  total_critical: number
  total_high: number
  total_medium: number
  total_low: number
}

export const MOCK_SERVICES: Service[] = [
  {
    id: 'svc-001',
    name: 'acme-api',
    source_type: 'github',
    source: 'github.com/acme-corp/backend-api',
    branch: 'main',
    scan_count: 1,
    last_scanned: '2026-03-24T09:16:12Z',
    last_scan_id: 'scan-001',
    last_scan_status: 'completed',
    total_critical: 2,
    total_high: 2,
    total_medium: 1,
    total_low: 5,
  },
  {
    id: 'svc-002',
    name: 'auth-service',
    source_type: 'github',
    source: 'github.com/acme-corp/auth-service',
    branch: 'main',
    scan_count: 1,
    last_scanned: '2026-03-23T14:36:55Z',
    last_scan_id: 'scan-002',
    last_scan_status: 'completed',
    total_critical: 0,
    total_high: 1,
    total_medium: 3,
    total_low: 2,
  },
  {
    id: 'svc-003',
    name: 'payments-api',
    source_type: 'docker',
    source: 'docker.io/acme/payments-api:latest',
    scan_count: 1,
    last_scanned: '2026-03-22T11:13:40Z',
    last_scan_id: 'scan-003',
    last_scan_status: 'completed',
    total_critical: 1,
    total_high: 3,
    total_medium: 2,
    total_low: 4,
  },
  {
    id: 'svc-004',
    name: 'inventory-service',
    source_type: 'github',
    source: 'github.com/acme-corp/inventory',
    branch: 'develop',
    scan_count: 1,
    last_scanned: '2026-03-21T16:20:00Z',
    last_scan_id: 'scan-004',
    last_scan_status: 'failed',
    total_critical: 0,
    total_high: 0,
    total_medium: 0,
    total_low: 0,
  },
]
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info'

export interface Finding {
  id: string
  severity: Severity
  vuln_class: string
  title: string
  endpoint: string
  method: string
  description: string
  proof_request: {
    method: string
    url: string
    headers: Record<string, string>
    body?: string
  }
  proof_response: {
    status: number
    body_excerpt: string
  }
  curl_command: string
  fix_suggestion: string
  cwe_id: string
  owasp_category: string
}

export interface Scan {
  id: string
  service_name: string
  service_source: string
  branch?: string
  status: ScanStatus
  attack_profile: string
  started_at: string
  completed_at?: string
  duration?: string
  critical: number
  high: number
  medium: number
  low: number
  info: number
  endpoints_scanned: number
  requests_fired: number
}

export const MOCK_SCANS: Scan[] = [
  {
    id: 'scan-001',
    service_name: 'acme-api',
    service_source: 'github.com/acme-corp/backend-api',
    branch: 'main',
    status: 'completed',
    attack_profile: 'Aggressive',
    started_at: '2026-03-24T09:12:00Z',
    completed_at: '2026-03-24T09:16:12Z',
    duration: '4m 12s',
    critical: 2,
    high: 2,
    medium: 1,
    low: 5,
    info: 3,
    endpoints_scanned: 84,
    requests_fired: 1243,
  },
  {
    id: 'scan-002',
    service_name: 'auth-service',
    service_source: 'github.com/acme-corp/auth-service',
    branch: 'main',
    status: 'completed',
    attack_profile: 'Standard',
    started_at: '2026-03-23T14:30:00Z',
    completed_at: '2026-03-23T14:36:55Z',
    duration: '6m 55s',
    critical: 0,
    high: 1,
    medium: 3,
    low: 2,
    info: 1,
    endpoints_scanned: 31,
    requests_fired: 688,
  },
  {
    id: 'scan-003',
    service_name: 'payments-api',
    service_source: 'docker.io/acme/payments-api:latest',
    status: 'completed',
    attack_profile: 'Standard',
    started_at: '2026-03-22T11:05:00Z',
    completed_at: '2026-03-22T11:13:40Z',
    duration: '8m 40s',
    critical: 1,
    high: 3,
    medium: 2,
    low: 4,
    info: 2,
    endpoints_scanned: 52,
    requests_fired: 910,
  },
  {
    id: 'scan-004',
    service_name: 'inventory-service',
    service_source: 'github.com/acme-corp/inventory',
    branch: 'develop',
    status: 'failed',
    attack_profile: 'Quick',
    started_at: '2026-03-21T16:20:00Z',
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
    endpoints_scanned: 0,
    requests_fired: 0,
  },
]

export const MOCK_FINDINGS: Finding[] = [
  {
    id: 'f-001',
    severity: 'critical',
    vuln_class: 'sql_injection',
    title: 'SQL Injection in login endpoint',
    endpoint: '/api/auth/login',
    method: 'POST',
    description:
      'The login endpoint concatenates user-supplied input directly into a SQL query without parameterization. An attacker can bypass authentication or extract the entire users table.',
    proof_request: {
      method: 'POST',
      url: 'http://target/api/auth/login',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: "admin'--", password: 'anything' }, null, 2),
    },
    proof_response: {
      status: 200,
      body_excerpt: '{"token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...","user":{"id":1,"role":"admin"}}',
    },
    curl_command: `curl -X POST https://api.acme-corp.com/api/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"email":"admin'\''--","password":"anything"}'`,
    fix_suggestion:
      'Use parameterized queries or a prepared statement. With an ORM like Prisma: `prisma.user.findFirst({ where: { email } })`. Never interpolate user input into SQL strings.',
    cwe_id: 'CWE-89',
    owasp_category: 'API2:2023 Broken Authentication',
  },
  {
    id: 'f-002',
    severity: 'critical',
    vuln_class: 'auth_bypass',
    title: 'Admin endpoint accessible without authentication',
    endpoint: '/api/admin/stats',
    method: 'GET',
    description:
      'The /api/admin/stats endpoint returns sensitive system statistics and user data without requiring any authentication token. Any unauthenticated request returns a 200 response with full data.',
    proof_request: {
      method: 'GET',
      url: 'http://target/api/admin/stats',
      headers: {},
    },
    proof_response: {
      status: 200,
      body_excerpt: '{"total_users":8432,"revenue_mtd":142300,"active_sessions":231,"user_emails":[...]}',
    },
    curl_command: `curl https://api.acme-corp.com/api/admin/stats`,
    fix_suggestion:
      'Add authentication middleware to all /api/admin/* routes. Verify the `requireAuth` middleware is applied before the route handler, not after.',
    cwe_id: 'CWE-306',
    owasp_category: 'API2:2023 Broken Authentication',
  },
  {
    id: 'f-003',
    severity: 'high',
    vuln_class: 'idor',
    title: 'IDOR on user profile endpoint',
    endpoint: '/api/users/{id}',
    method: 'GET',
    description:
      'The user profile endpoint returns another user\'s full profile data when their numeric ID is supplied. Authorization checks the token is valid but does not verify the requesting user owns the resource.',
    proof_request: {
      method: 'GET',
      url: 'http://target/api/users/2',
      headers: { Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.<user-1-token>' },
    },
    proof_response: {
      status: 200,
      body_excerpt: '{"id":2,"email":"jane@acme-corp.com","phone":"+1-555-0192","address":"...","payment_methods":[...]}',
    },
    curl_command: `curl https://api.acme-corp.com/api/users/2 \\
  -H "Authorization: Bearer <your-token>"`,
    fix_suggestion:
      'Compare the authenticated user\'s ID against the requested resource ID: `if (req.user.id !== parseInt(req.params.id)) return res.status(403).json({ error: "Forbidden" })`',
    cwe_id: 'CWE-639',
    owasp_category: 'API1:2023 Broken Object Level Authorization',
  },
  {
    id: 'f-004',
    severity: 'high',
    vuln_class: 'broken_access_control',
    title: 'Broken object-level authorization on post updates',
    endpoint: '/api/posts/{id}',
    method: 'PUT',
    description:
      'Any authenticated user can update any post by supplying its ID, regardless of ownership. The endpoint validates the JWT but does not check that the post belongs to the authenticated user.',
    proof_request: {
      method: 'PUT',
      url: 'http://target/api/posts/55',
      headers: {
        Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.<user-who-does-not-own-post-55>',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: 'Hijacked', content: 'Modified by attacker' }, null, 2),
    },
    proof_response: {
      status: 200,
      body_excerpt: '{"id":55,"title":"Hijacked","content":"Modified by attacker","updated_at":"2026-03-24T09:14:22Z"}',
    },
    curl_command: `curl -X PUT https://api.acme-corp.com/api/posts/55 \\
  -H "Authorization: Bearer <any-valid-token>" \\
  -H "Content-Type: application/json" \\
  -d '{"title":"Hijacked","content":"Modified by attacker"}'`,
    fix_suggestion:
      'Before updating, fetch the post and verify ownership: `const post = await Post.findById(id); if (post.author_id !== req.user.id) return res.status(403).json({ error: "Forbidden" })`',
    cwe_id: 'CWE-285',
    owasp_category: 'API1:2023 Broken Object Level Authorization',
  },
  {
    id: 'f-005',
    severity: 'medium',
    vuln_class: 'csrf',
    title: 'CSRF on comment deletion',
    endpoint: '/api/comments/{id}',
    method: 'DELETE',
    description:
      'Comment deletion relies solely on a session cookie for authentication with no CSRF token validation. A malicious site can craft a request that deletes a victim\'s comments when visited.',
    proof_request: {
      method: 'DELETE',
      url: 'http://target/api/comments/88',
      headers: { Cookie: 'session=<victim-session>' },
    },
    proof_response: { status: 200, body_excerpt: '{"deleted":true}' },
    curl_command: `curl -X DELETE https://api.acme-corp.com/api/comments/88 \\
  -H "Cookie: session=<victim-session>"`,
    fix_suggestion:
      'Implement CSRF tokens using the `csurf` package, or switch to `Authorization: Bearer` header-based auth for all state-changing requests (headers cannot be set cross-origin by default).',
    cwe_id: 'CWE-352',
    owasp_category: 'API8:2023 Security Misconfiguration',
  },
]
