const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

function token() {
  return localStorage.getItem('vs_token')
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const t = token()
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
      ...(init.headers as Record<string, string> ?? {}),
    },
  })
  if (res.status === 204) return undefined as T
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
  return body as T
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string
  email: string
  name: string
}

export interface Service {
  id: string
  userId: string
  name: string
  sourceType: 'github' | 'openapi'
  source: string
  branch: string | null
  envVars: Record<string, string>
  createdAt: string
}

export interface Scan {
  id: string;
  serviceId: string;
  userId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  attackProfile: string;
  startedAt: string;
  completedAt: string | null;
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  endpointsScanned: number;
  requestsFired: number;
  durationMs: number | null;
  errorMessage: string | null;
}

export interface BackendFinding {
  id: string;
  scanId: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  vulnClass: string;
  title: string;
  endpoint: string;
  method: string;
  description: string;
  proofRequest: { method: string; url: string; headers: Record<string, string>; body?: string };
  proofResponse: { status: number; body_excerpt: string };
  curlCommand: string;
  fixSuggestion: string;
  cweId: string;
  owaspCategory: string;
  createdAt: string;
}

export type ScanWithFindings = Scan & {
  findings: BackendFinding[];
  serviceName: string | null;
  serviceSource: string | null;
  branch: string | null;
};

// ─── API calls ────────────────────────────────────────────────────────────────

export const api = {
  auth: {
    login: (email: string, password: string) =>
      request<{ token: string; user: AuthUser }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),

    register: (email: string, password: string, name: string) =>
      request<{ token: string; user: AuthUser }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, name }),
      }),

    githubConnect: () =>
      request<{ url: string }>('/auth/github/connect'),

    githubStatus: () =>
      request<{ connected: boolean }>('/auth/github/status'),

    githubDisconnect: () =>
      request<{ ok: boolean }>('/auth/github', { method: 'DELETE' }),
  },

  services: {
    list: () => request<Service[]>('/services'),

    create: (data: { name: string; source_type: 'github' | 'openapi'; source: string; branch?: string; env_vars?: Record<string, string> }) =>
      request<Service>('/services', { method: 'POST', body: JSON.stringify(data) }),

    delete: (id: string) =>
      request<void>(`/services/${id}`, { method: 'DELETE' }),
  },

  scans: {
    list: () => request<Scan[]>('/scans'),

    get: (id: string) => request<ScanWithFindings>(`/scans/${id}`),

    cancel: (id: string) => request<{ ok: boolean }>(`/scans/${id}/cancel`, { method: 'POST' }),

    create: (data: { serviceId: string; attackProfile: string }) =>
      request<Scan>('/scans', {
        method: 'POST',
        body: JSON.stringify({ service_id: data.serviceId, attack_profile: data.attackProfile }),
      }),
  },
}
