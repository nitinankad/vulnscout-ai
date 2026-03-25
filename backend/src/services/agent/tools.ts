import type Anthropic from '@anthropic-ai/sdk';

/**
 * Tool schemas passed to Claude. The input_schema is what Claude uses to
 * construct valid arguments — keep descriptions precise so it doesn't hallucinate.
 */
export const AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'http_request',
    description:
      'Makes an HTTP request to the target service and returns the status code, response headers, and body. ' +
      'Always use a relative path (e.g. /api/users) — the base URL is injected automatically. ' +
      'Use this to probe endpoints, send attack payloads, and observe responses.',
    input_schema: {
      type: 'object' as const,
      properties: {
        method: {
          type: 'string',
          enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
          description: 'HTTP method',
        },
        path: {
          type: 'string',
          description: 'Request path including query string, e.g. /api/users?id=1',
        },
        headers: {
          type: 'object',
          description: 'Optional HTTP headers as key-value pairs',
          additionalProperties: { type: 'string' },
        },
        body: {
          type: 'string',
          description: 'Request body as a JSON string (for POST/PUT/PATCH)',
        },
      },
      required: ['method', 'path'],
    },
  },

  {
    name: 'set_auth',
    description:
      'Stores a bearer token that will be automatically added as an Authorization header ' +
      'to all subsequent http_request calls. Call this after successfully authenticating.',
    input_schema: {
      type: 'object' as const,
      properties: {
        token: {
          type: 'string',
          description: 'Bearer token value (without the "Bearer " prefix)',
        },
      },
      required: ['token'],
    },
  },

  {
    name: 'get_endpoints',
    description:
      'Returns a list of known API endpoints discovered by static analysis. ' +
      'Use this at the start of a scan to understand the attack surface.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },

  {
    name: 'record_finding',
    description:
      'Records a confirmed vulnerability. Only call this when you have concrete proof — ' +
      'an actual HTTP request/response that demonstrates the flaw. Do not record theoretical issues.',
    input_schema: {
      type: 'object' as const,
      properties: {
        severity: {
          type: 'string',
          enum: ['critical', 'high', 'medium', 'low', 'info'],
        },
        vuln_class: {
          type: 'string',
          description: 'Short identifier e.g. sql_injection, auth_bypass, idor, csrf, xss',
        },
        title: {
          type: 'string',
          description: 'One-line title e.g. "SQL Injection in POST /api/auth/login"',
        },
        endpoint: {
          type: 'string',
          description: 'The affected path e.g. /api/auth/login',
        },
        method: { type: 'string' },
        description: {
          type: 'string',
          description: 'What the vulnerability is and why it is exploitable',
        },
        proof_request: {
          type: 'object',
          description: 'The exact request that proves the vulnerability',
          properties: {
            method: { type: 'string' },
            path: { type: 'string' },
            headers: { type: 'object', additionalProperties: { type: 'string' } },
            body: { type: 'string' },
          },
          required: ['method', 'path'],
        },
        proof_response: {
          type: 'object',
          description: 'The response that confirms the vulnerability',
          properties: {
            status: { type: 'number' },
            body_excerpt: { type: 'string', description: 'First 500 chars of the response body' },
          },
          required: ['status', 'body_excerpt'],
        },
        fix_suggestion: {
          type: 'string',
          description: 'Concrete remediation advice with a code example if possible',
        },
        cwe_id: {
          type: 'string',
          description: 'CWE identifier e.g. CWE-89',
        },
        owasp_category: {
          type: 'string',
          description: 'OWASP API Security Top 10 category e.g. API1:2023',
        },
      },
      required: [
        'severity', 'vuln_class', 'title', 'endpoint', 'method',
        'description', 'proof_request', 'proof_response', 'fix_suggestion',
        'cwe_id', 'owasp_category',
      ],
    },
  },
];

// ─── Tool input types ─────────────────────────────────────────────────────────

export interface HttpRequestInput {
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface SetAuthInput {
  token: string;
}

export interface RecordFindingInput {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  vuln_class: string;
  title: string;
  endpoint: string;
  method: string;
  description: string;
  proof_request: {
    method: string;
    path: string;
    headers?: Record<string, string>;
    body?: string;
  };
  proof_response: {
    status: number;
    body_excerpt: string;
  };
  fix_suggestion: string;
  cwe_id: string;
  owasp_category: string;
}
