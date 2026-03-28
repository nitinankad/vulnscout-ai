import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { MOCK_SCANS, MOCK_FINDINGS, type Finding, type Severity } from '@/lib/mock-data'
import { api, type ScanWithFindings, type BackendFinding, type ScanRequest } from '@/lib/api'
import { useAuth } from '@/context/auth'
import { useScanStream, type ScanEvent } from '@/hooks/useScanStream'

// ─── Severity helpers ────────────────────────────────────────────────────────

const SEV_COLOR: Record<Severity, string> = {
  critical: 'text-destructive bg-destructive/10 border-destructive/30',
  high: 'text-orange-400 bg-orange-400/10 border-orange-400/30',
  medium: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
  low: 'text-blue-400 bg-blue-400/10 border-blue-400/30',
  info: 'text-muted-foreground bg-muted/20 border-border',
}

const METHOD_COLOR: Record<string, string> = {
  GET: 'text-primary bg-primary/10',
  POST: 'text-yellow-400 bg-yellow-400/10',
  PUT: 'text-blue-400 bg-blue-400/10',
  PATCH: 'text-purple-400 bg-purple-400/10',
  DELETE: 'text-destructive bg-destructive/10',
}

// ─── Live scan events (mock demo) ─────────────────────────────────────────────

const MOCK_SCAN_EVENTS = [
  { t: 300,  text: 'Cloning repository…', type: 'info' },
  { t: 1000, text: 'Building Docker image…', type: 'info' },
  { t: 2000, text: 'Sandbox network created · sandbox-abc123', type: 'info' },
  { t: 2800, text: 'Starting dependencies · postgres:15', type: 'info' },
  { t: 3500, text: 'Starting target service…', type: 'info' },
  { t: 4200, text: 'Health check passed · http://target:3000', type: 'success' },
  { t: 4500, text: 'Static analysis complete · 84 endpoints mapped', type: 'success' },
  { t: 5000, text: 'AI agent initialized · profile: aggressive', type: 'info' },
  { t: 5600, text: '[RECON] Discovered 84 endpoints', type: 'info' },
  { t: 6200, text: '[AUTH] Testing login endpoint…', type: 'info' },
  { t: 7000, text: "[CRITICAL] SQL Injection confirmed · POST /api/auth/login", type: 'critical' },
  { t: 7800, text: '[AUTH] JWT algorithm check passed', type: 'success' },
  { t: 8400, text: '[AUTH] Testing admin endpoints without token…', type: 'info' },
  { t: 9000, text: "[CRITICAL] Auth bypass · GET /api/admin/stats returns 200 unauthenticated", type: 'critical' },
  { t: 9800, text: '[IDOR] Testing user resource endpoints…', type: 'info' },
  { t: 10600, text: "[HIGH] IDOR confirmed · GET /api/users/2 accessible with user-1 token", type: 'high' },
  { t: 11400, text: '[ACCESS] Testing object-level authorization on posts…', type: 'info' },
  { t: 12200, text: "[HIGH] Broken access control · PUT /api/posts/55 modifiable by any user", type: 'high' },
  { t: 13000, text: '[CSRF] Testing state-changing endpoints…', type: 'info' },
  { t: 13800, text: "[MEDIUM] CSRF · DELETE /api/comments/{id} no CSRF protection", type: 'medium' },
  { t: 14600, text: 'Generating report…', type: 'info' },
  { t: 15200, text: 'Sandbox torn down · all containers removed', type: 'info' },
  { t: 15500, text: 'Scan complete · 2 critical · 2 high · 1 medium · 5 low', type: 'success' },
] as const

const EVENT_COLOR: Record<string, string> = {
  critical: 'text-destructive',
  high: 'text-orange-400',
  medium: 'text-yellow-400',
  success: 'text-primary',
  info: 'text-muted-foreground',
  error: 'text-destructive',
}

// ─── Backend finding mapper ───────────────────────────────────────────────────

function mapFinding(f: BackendFinding): Finding {
  return {
    id: f.id,
    severity: f.severity,
    vuln_class: f.vulnClass,
    title: f.title,
    endpoint: f.endpoint,
    method: f.method,
    description: f.description,
    proof_request: f.proofRequest,
    proof_response: f.proofResponse,
    curl_command: f.curlCommand,
    fix_suggestion: f.fixSuggestion,
    cwe_id: f.cweId,
    owasp_category: f.owaspCategory,
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function prettyBody(raw: string | undefined | null): string {
  if (!raw) return ''
  try { return JSON.stringify(JSON.parse(raw), null, 2) } catch { return raw }
}

function parseQueryParams(url: string): [string, string][] {
  try {
    const u = new URL(url)
    return [...u.searchParams.entries()]
  } catch { return [] }
}

type FindingTab = 'summary' | 'raw'

function FindingRow({ finding, expanded, onToggle }: { finding: Finding; expanded: boolean; onToggle: () => void }) {
  const [tab, setTab] = useState<FindingTab>('summary')
  const queryParams = parseQueryParams(finding.proof_request.url)
  const statusOk = finding.proof_response.status > 0 && finding.proof_response.status < 400

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors text-left"
        onClick={onToggle}
      >
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase flex-shrink-0 ${SEV_COLOR[finding.severity]}`}>
          {finding.severity}
        </span>
        <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${METHOD_COLOR[finding.method] ?? 'text-muted-foreground'}`}>
          {finding.method}
        </span>
        <span className="text-sm text-foreground/80 font-mono flex-shrink-0">{finding.endpoint}</span>
        <span className="flex-1 text-sm text-muted-foreground truncate">{finding.title}</span>
        <span className="text-[10px] text-muted-foreground bg-muted/20 border border-border px-1.5 py-0.5 rounded flex-shrink-0">
          {finding.cwe_id}
        </span>
        <svg
          className={`w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-border bg-[oklch(0.08_0.01_200)]">
          {/* Tab bar */}
          <div className="flex items-center gap-1 px-4 pt-3 pb-0 border-b border-border">
            {(['summary', 'raw'] as FindingTab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 text-xs font-medium rounded-t-md border-b-2 transition-colors capitalize -mb-px ${
                  tab === t
                    ? 'text-foreground border-primary'
                    : 'text-muted-foreground border-transparent hover:text-foreground'
                }`}
              >
                {t === 'raw' ? 'Raw HTTP' : 'Summary'}
              </button>
            ))}
          </div>

          {tab === 'summary' && (
            <div className="px-4 pb-4 pt-4 space-y-4">
              <p className="text-sm text-muted-foreground leading-relaxed">{finding.description}</p>

              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Proof — Request</p>
                  <div className="bg-[oklch(0.06_0.008_200)] border border-border rounded-lg p-3 font-mono text-xs space-y-1">
                    <p className="text-primary">{finding.proof_request.method} {finding.proof_request.url}</p>
                    {Object.entries(finding.proof_request.headers).map(([k, v]) => (
                      <p key={k} className="text-muted-foreground"><span className="text-foreground/60">{k}:</span> {String(v)}</p>
                    ))}
                    {finding.proof_request.body && (
                      <pre className="text-yellow-400/80 mt-2 whitespace-pre-wrap text-[10px]">{prettyBody(finding.proof_request.body)}</pre>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Proof — Response</p>
                  <div className="bg-[oklch(0.06_0.008_200)] border border-border rounded-lg p-3 font-mono text-xs space-y-1">
                    <p className={statusOk ? 'text-destructive font-bold' : 'text-primary'}>
                      HTTP {finding.proof_response.status}
                    </p>
                    <pre className="text-muted-foreground whitespace-pre-wrap text-[10px] mt-2">{prettyBody(finding.proof_response.body_excerpt)}</pre>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Reproduce</p>
                <div className="bg-[oklch(0.06_0.008_200)] border border-border rounded-lg p-3 font-mono text-xs">
                  <pre className="text-foreground/80 whitespace-pre-wrap">{finding.curl_command}</pre>
                </div>
              </div>

              <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
                <p className="text-[10px] text-primary uppercase tracking-wider mb-1.5 font-semibold">Fix suggestion</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{finding.fix_suggestion}</p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-[10px] border-border text-muted-foreground">{finding.cwe_id}</Badge>
                <Badge variant="outline" className="text-[10px] border-border text-muted-foreground">{finding.owasp_category}</Badge>
              </div>
            </div>
          )}

          {tab === 'raw' && (
            <div className="px-4 pb-4 pt-4 space-y-4 font-mono text-xs">

              {/* Request line */}
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 font-sans">Request</p>
                <div className="bg-[oklch(0.05_0.008_200)] border border-border rounded-lg overflow-hidden">
                  <div className="px-3 py-2 border-b border-border bg-[oklch(0.07_0.01_200)]">
                    <span className={`font-bold mr-2 ${METHOD_COLOR[finding.method] ?? 'text-foreground'}`}>{finding.method}</span>
                    <span className="text-foreground/80">{finding.proof_request.url}</span>
                  </div>

                  {/* Query params table */}
                  {queryParams.length > 0 && (
                    <div className="border-b border-border">
                      <p className="text-[10px] text-muted-foreground/60 uppercase px-3 pt-2 pb-1 font-sans">Query parameters</p>
                      <table className="w-full text-xs">
                        <tbody>
                          {queryParams.map(([k, v]) => (
                            <tr key={k} className="border-b border-border/50 last:border-0">
                              <td className="px-3 py-1.5 text-primary/80 w-1/3 align-top">{k}</td>
                              <td className="px-3 py-1.5 text-yellow-400/80 break-all">{v}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Headers */}
                  {Object.keys(finding.proof_request.headers).length > 0 && (
                    <div className="border-b border-border">
                      <p className="text-[10px] text-muted-foreground/60 uppercase px-3 pt-2 pb-1 font-sans">Headers</p>
                      <table className="w-full text-xs">
                        <tbody>
                          {Object.entries(finding.proof_request.headers).map(([k, v]) => (
                            <tr key={k} className="border-b border-border/50 last:border-0">
                              <td className="px-3 py-1.5 text-foreground/60 w-1/3 align-top">{k}</td>
                              <td className="px-3 py-1.5 text-muted-foreground break-all">{String(v)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Body */}
                  {finding.proof_request.body ? (
                    <div>
                      <p className="text-[10px] text-muted-foreground/60 uppercase px-3 pt-2 pb-1 font-sans">Body</p>
                      <pre className="px-3 pb-3 text-yellow-400/80 whitespace-pre-wrap text-[11px] leading-relaxed">
                        {prettyBody(finding.proof_request.body)}
                      </pre>
                    </div>
                  ) : (
                    <p className="px-3 py-2 text-muted-foreground/40 italic text-[10px]">(no body)</p>
                  )}
                </div>
              </div>

              {/* Response */}
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 font-sans">Response</p>
                <div className="bg-[oklch(0.05_0.008_200)] border border-border rounded-lg overflow-hidden">
                  <div className={`px-3 py-2 border-b border-border font-bold ${
                    finding.proof_response.status === 0 ? 'text-muted-foreground' :
                    finding.proof_response.status < 300 ? 'text-primary' :
                    finding.proof_response.status < 400 ? 'text-yellow-400' : 'text-destructive'
                  }`}>
                    HTTP {finding.proof_response.status}
                    <span className="ml-2 text-[10px] font-normal text-muted-foreground">
                      {finding.proof_response.status === 200 ? 'OK' :
                       finding.proof_response.status === 201 ? 'Created' :
                       finding.proof_response.status === 204 ? 'No Content' :
                       finding.proof_response.status === 400 ? 'Bad Request' :
                       finding.proof_response.status === 401 ? 'Unauthorized' :
                       finding.proof_response.status === 403 ? 'Forbidden' :
                       finding.proof_response.status === 404 ? 'Not Found' :
                       finding.proof_response.status === 500 ? 'Internal Server Error' : ''}
                    </span>
                  </div>
                  {finding.proof_response.body_excerpt ? (
                    <div>
                      <p className="text-[10px] text-muted-foreground/60 uppercase px-3 pt-2 pb-1 font-sans">Body</p>
                      <pre className="px-3 pb-3 text-muted-foreground whitespace-pre-wrap text-[11px] leading-relaxed">
                        {prettyBody(finding.proof_response.body_excerpt)}
                      </pre>
                    </div>
                  ) : (
                    <p className="px-3 py-2 text-muted-foreground/40 italic text-[10px]">(no body)</p>
                  )}
                </div>
              </div>

            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Running view (shared by mock and real) ──────────────────────────────────

interface LiveEvent {
  text: string
  type: string
  ts: string
}

function phaseFromEvent(text: string): string {
  if (/clone|ingest|build|docker/i.test(text)) return 'Building image…'
  if (/static|endpoint|analys/i.test(text)) return 'Running static analysis…'
  if (/sandbox|network|health|depend/i.test(text)) return 'Spinning up sandbox…'
  if (/agent|attack|scan|probe|inject|idor|auth/i.test(text)) return 'AI agent attacking…'
  if (/complete|done|report|torn/i.test(text)) return 'Finishing…'
  return 'Running…'
}

function RunningView({
  events,
  phase,
  progress,
  backPath,
  onCancel,
}: {
  events: LiveEvent[]
  phase: string
  progress: number
  backPath: string
  onCancel?: () => void
}) {
  const logRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    requestAnimationFrame(() => {
      logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' })
    })
  }, [events.length])

  return (
    <div className="p-8 max-w-3xl">
      <button
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        onClick={() => navigate(backPath)}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Overview
      </button>

      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
            <h1 className="text-xl font-bold text-foreground">Scan in progress</h1>
          </div>
          <p className="text-sm text-muted-foreground">acme-corp/backend-api · main</p>
        </div>
        <Badge variant="outline" className="text-yellow-400 border-yellow-400/30 bg-yellow-400/10 text-xs">
          Running
        </Badge>
      </div>

      {/* Progress */}
      <div className="bg-card border border-border rounded-xl p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-foreground">{phase}</p>
          <p className="text-sm text-primary font-mono">{progress}%</p>
        </div>
        <Progress value={progress} className="h-1.5" />

        <div className="flex items-center justify-between mt-4">
          {['Ingest', 'Analysis', 'Sandbox', 'Attacking', 'Report'].map((p, i) => {
            const thresholds = [10, 30, 45, 90, 100]
            const active = progress >= (thresholds[i - 1] ?? 0)
            const current = progress >= (thresholds[i - 1] ?? 0) && progress < thresholds[i]
            return (
              <div key={p} className="flex flex-col items-center gap-1">
                <div className={`w-2 h-2 rounded-full ${active ? 'bg-primary' : 'bg-border'} ${current ? 'ring-2 ring-primary/30' : ''}`} />
                <span className={`text-[10px] ${active ? 'text-primary' : 'text-muted-foreground'}`}>{p}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Live log */}
      <div className="bg-[oklch(0.07_0.01_200)] border border-border rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          <p className="text-xs text-muted-foreground font-mono">Live event log</p>
        </div>
        <div ref={logRef} className="h-72 overflow-y-auto p-4 space-y-1.5 font-mono text-xs">
          {events.map((ev, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-muted-foreground/40 flex-shrink-0 select-none">
                {new Date(ev.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              <span className={EVENT_COLOR[ev.type] ?? 'text-muted-foreground'}>{ev.text}</span>
            </div>
          ))}
          {events.length === 0 && <p className="text-muted-foreground/40">Connecting…</p>}
        </div>
      </div>

      {onCancel && (
        <div className="mt-4 flex justify-end">
          <button
            onClick={onCancel}
            className="text-xs text-muted-foreground border border-border rounded-lg px-3 py-1.5 hover:text-destructive hover:border-destructive/50 transition-colors"
          >
            Cancel scan & generate report
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ScanDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { token } = useAuth()

  // ── Determine mode ────────────────────────────────────────────────────────
  const isMockRunning = id === 'scan-running'
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const isRealScan = !!id && !isMockRunning && UUID_RE.test(id)

  // ── Live events state ─────────────────────────────────────────────────────
  const [events, setEvents] = useState<LiveEvent[]>([])
  const [phase, setPhase] = useState('Initializing…')
  const [progress, setProgress] = useState(0)
  const [done, setDone] = useState(false)

  // ── Completed view state (must be unconditional) ──────────────────────────
  const [filter, setFilter] = useState<Severity | 'all'>('all')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [scanLogOpen, setScanLogOpen] = useState(false)
  const [containerLogOpen, setContainerLogOpen] = useState(false)
  const [auditLogOpen, setAuditLogOpen] = useState(false)
  const [auditRequests, setAuditRequests] = useState<ScanRequest[] | null>(null)
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditExpanded, setAuditExpanded] = useState<Set<string>>(new Set())
  const [scanData, setScanData] = useState<ScanWithFindings | null>(null)
  const [scanDataLoading, setScanDataLoading] = useState(isRealScan)
  const [cancelling, setCancelling] = useState(false)

  // ── Real scan streaming ───────────────────────────────────────────────────
  const handleEvent = useCallback((ev: ScanEvent) => {
    setEvents((prev) => [
      ...prev,
      { text: ev.message, type: ev.type, ts: ev.timestamp },
    ])
    setPhase(phaseFromEvent(ev.message))
    // Crude progress heuristic based on phase keywords
    setProgress((prev) => {
      if (/clone|ingest/i.test(ev.message)) return Math.max(prev, 5)
      if (/build|docker/i.test(ev.message)) return Math.max(prev, 12)
      if (/static|analys/i.test(ev.message)) return Math.max(prev, 28)
      if (/sandbox|network/i.test(ev.message)) return Math.max(prev, 35)
      if (/health.*pass/i.test(ev.message)) return Math.max(prev, 45)
      if (/agent.*init/i.test(ev.message)) return Math.max(prev, 50)
      if (/agent.*done/i.test(ev.message)) return Math.max(prev, 90)
      if (/scan complete/i.test(ev.message)) return 100
      return Math.min(prev + 1, 95)
    })
  }, [])

  const handleDone = useCallback(() => {
    setProgress(100);
    if (isRealScan && id) {
      setTimeout(async () => {
        try {
          const data = await api.scans.get(id);
          setScanData(data);
        } catch { /* ignore */ }
        setDone(true);
      }, 800);
    } else {
      setTimeout(() => setDone(true), 800);
    }
  }, [isRealScan, id])

  useScanStream(isRealScan ? (id ?? null) : null, {
    token,
    onEvent: handleEvent,
    onDone: handleDone,
    enabled: isRealScan && !done,
  })

  // ── Initial fetch for real scans ──────────────────────────────────────────
  useEffect(() => {
    if (!isRealScan || !id) { setScanDataLoading(false); return; }
    api.scans.get(id)
      .then(async (data) => {
        setScanData(data);
        if (data.status === 'completed' || data.status === 'failed') {
          setDone(true);
          // Load persisted events from DB for completed/failed scans
          try {
            const stored = await api.scans.events(id);
            setEvents(stored.map((e) => ({ text: e.message, type: e.type as LiveEvent['type'], ts: e.createdAt })));
            if (stored.length > 0) setScanLogOpen(true);
          } catch { /* ignore */ }
        }
      })
      .catch(console.error)
      .finally(() => setScanDataLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Cancel handler ────────────────────────────────────────────────────────
  const handleCancel = useCallback(async () => {
    if (!id || cancelling) return;
    setCancelling(true);
    try {
      await api.scans.cancel(id);
    } catch { /* ignore */ }
  }, [id, cancelling])

  // ── Mock demo simulation ──────────────────────────────────────────────────
  useEffect(() => {
    if (!isMockRunning) return
    const timers: ReturnType<typeof setTimeout>[] = []

    MOCK_SCAN_EVENTS.forEach((ev) => {
      const t = setTimeout(() => {
        setEvents((prev) => [...prev, { text: ev.text, type: ev.type, ts: new Date().toISOString() }])
        const pct = Math.round((ev.t / 15500) * 100)
        setProgress(pct)
        if (ev.t < 4500) setPhase('Building sandbox…')
        else if (ev.t < 6000) setPhase('Running static analysis…')
        else if (ev.t < 15000) setPhase('AI agent attacking…')
        else setPhase('Generating report…')
        if (ev.t >= 15500) setTimeout(() => setDone(true), 600)
      }, ev.t)
      timers.push(t)
    })

    return () => timers.forEach(clearTimeout)
  }, [isMockRunning])

  // ── Derived values (no hooks below this line) ─────────────────────────────
  const isRunning = (isMockRunning || isRealScan) && !done
  const mockScan = MOCK_SCANS.find((s) => s.id === id) ?? MOCK_SCANS[0]
  const displayScan = isRealScan && scanData ? {
    service_name: scanData.serviceName ?? scanData.serviceId,
    service_source: scanData.serviceSource ?? '',
    branch: scanData.branch ?? undefined,
    attack_profile: scanData.attackProfile,
    endpoints_scanned: scanData.endpointsScanned,
    requests_fired: scanData.requestsFired,
    duration: scanData.durationMs ? `${Math.round(scanData.durationMs / 1000)}s` : '—',
    critical: scanData.critical,
    high: scanData.high,
    medium: scanData.medium,
    low: scanData.low,
  } : {
    service_name: mockScan.service_name,
    service_source: mockScan.service_source,
    branch: mockScan.branch,
    attack_profile: mockScan.attack_profile,
    endpoints_scanned: mockScan.endpoints_scanned,
    requests_fired: mockScan.requests_fired,
    duration: mockScan.duration ?? '—',
    critical: mockScan.critical,
    high: mockScan.high,
    medium: mockScan.medium,
    low: mockScan.low,
  }
  const allFindings: Finding[] = isRealScan && scanData
    ? scanData.findings.map(mapFinding)
    : MOCK_FINDINGS;
  const findings = filter === 'all' ? allFindings : allFindings.filter((f) => f.severity === filter)

  if (isRealScan && scanDataLoading) {
    return (
      <div className="p-8 flex items-center gap-3 text-muted-foreground text-sm">
        <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12a8 8 0 018-8v4l3-3-3-3V4a10 10 0 100 20v-2a8 8 0 01-8-8z" />
        </svg>
        Loading scan…
      </div>
    );
  }

  return isRunning ? (
    <RunningView
      events={events}
      phase={phase}
      progress={progress}
      backPath="/app"
      onCancel={handleCancel}
    />
  ) : (
    <div className="p-8 max-w-4xl">

      <button
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        onClick={() => navigate('/app')}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Overview
      </button>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-foreground mb-1">{displayScan.service_name}</h1>
          <p className="text-sm text-muted-foreground">{displayScan.service_source}{displayScan.branch ? ` · ${displayScan.branch}` : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs border-border">
            Export PDF
          </Button>
          <Button size="sm" className="h-8 text-xs bg-primary text-primary-foreground hover:bg-primary/90">
            Re-scan
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Critical', count: displayScan.critical, cls: 'text-destructive bg-destructive/10 border-destructive/20' },
          { label: 'High', count: displayScan.high, cls: 'text-orange-400 bg-orange-400/10 border-orange-400/20' },
          { label: 'Medium', count: displayScan.medium, cls: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20' },
          { label: 'Low', count: displayScan.low, cls: 'text-blue-400 bg-blue-400/10 border-blue-400/20' },
        ].map((s) => (
          <div key={s.label} className={`rounded-xl border p-4 text-center ${s.cls}`}>
            <p className="text-2xl font-bold">{s.count}</p>
            <p className="text-xs mt-0.5 opacity-80">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Meta */}
      <div className="flex items-center gap-6 text-xs text-muted-foreground mb-6 pb-6 border-b border-border">
        <span>Profile: <span className="text-foreground">{displayScan.attack_profile}</span></span>
        <span>Endpoints: <span className="text-foreground">{displayScan.endpoints_scanned}</span></span>
        <span>Requests fired: <span className="text-foreground">{displayScan.requests_fired.toLocaleString()}</span></span>
        <span>Duration: <span className="text-foreground">{displayScan.duration}</span></span>
        <span className="ml-auto text-primary">Scan complete</span>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 mb-4">
        {(['all', 'critical', 'high', 'medium', 'low'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors capitalize ${
              filter === f
                ? 'bg-primary/10 text-primary border border-primary/30'
                : 'text-muted-foreground hover:text-foreground border border-transparent'
            }`}
          >
            {f === 'all' ? `All (${allFindings.length})` : f}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setExpanded(new Set(findings.map((f) => f.id)))}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Expand all
          </button>
          <span className="text-border">·</span>
          <button
            onClick={() => setExpanded(new Set())}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Collapse all
          </button>
        </div>
      </div>

      {/* Findings */}
      <div className="space-y-2">
        {findings.map((f) => (
          <FindingRow
            key={f.id}
            finding={f}
            expanded={expanded.has(f.id)}
            onToggle={() => setExpanded((prev) => {
              const next = new Set(prev)
              next.has(f.id) ? next.delete(f.id) : next.add(f.id)
              return next
            })}
          />
        ))}
      </div>

      {/* Audit log — all requests */}
      {isRealScan && (
        <div className="mt-4 bg-[oklch(0.07_0.01_200)] border border-border rounded-xl overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors"
            onClick={async () => {
              const opening = !auditLogOpen;
              setAuditLogOpen(opening);
              if (opening && auditRequests === null && id) {
                setAuditLoading(true);
                try {
                  const reqs = await api.scans.requests(id);
                  setAuditRequests(reqs);
                } catch { setAuditRequests([]); }
                finally { setAuditLoading(false); }
              }
            }}
          >
            <div className="flex items-center gap-2">
              <svg className="w-3.5 h-3.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <span className="text-xs font-medium text-muted-foreground">Full request audit log</span>
              {auditRequests !== null && (
                <span className="text-[10px] text-muted-foreground/50 bg-muted/20 border border-border px-1.5 py-0.5 rounded">
                  {auditRequests.length} requests · {auditRequests.filter(r => r.vulnerable === 'true').length} vulnerable
                </span>
              )}
            </div>
            <svg
              className={`w-4 h-4 text-muted-foreground transition-transform ${auditLogOpen ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {auditLogOpen && (
            <div className="border-t border-border">
              {auditLoading && (
                <div className="flex items-center gap-2 px-4 py-6 text-xs text-muted-foreground">
                  <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12a8 8 0 018-8v4l3-3-3-3V4a10 10 0 100 20v-2a8 8 0 01-8-8z" />
                  </svg>
                  Loading audit log…
                </div>
              )}
              {!auditLoading && auditRequests?.length === 0 && (
                <p className="px-4 py-6 text-xs text-muted-foreground/50 text-center">No requests recorded for this scan.</p>
              )}
              {!auditLoading && auditRequests && auditRequests.length > 0 && (
                <div className="divide-y divide-border">
                  {auditRequests.map((req) => {
                    const isVuln = req.vulnerable === 'true';
                    const isOpen = auditExpanded.has(req.id);
                    return (
                      <div key={req.id}>
                        <button
                          className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.02] transition-colors text-left font-mono text-xs"
                          onClick={() => setAuditExpanded(prev => {
                            const next = new Set(prev);
                            next.has(req.id) ? next.delete(req.id) : next.add(req.id);
                            return next;
                          })}
                        >
                          <span className={`flex-shrink-0 w-1.5 h-1.5 rounded-full ${isVuln ? 'bg-destructive' : 'bg-muted-foreground/30'}`} />
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${METHOD_COLOR[req.method] ?? 'text-muted-foreground bg-muted/20'}`}>
                            {req.method}
                          </span>
                          <span className={`flex-shrink-0 text-[10px] font-mono font-bold w-10 text-right ${
                            req.status === 0 ? 'text-muted-foreground' :
                            req.status < 300 ? 'text-primary' :
                            req.status < 400 ? 'text-yellow-400' : 'text-destructive'
                          }`}>{req.status || '—'}</span>
                          <span className="text-muted-foreground flex-shrink-0 truncate max-w-xs">{req.endpoint}</span>
                          <span className="text-muted-foreground/40 flex-shrink-0 text-[10px]">{req.vulnClass.replace(/_/g, ' ')}</span>
                          {isVuln && (
                            <span className="text-destructive text-[10px] font-semibold flex-shrink-0 ml-auto">VULNERABLE</span>
                          )}
                          <svg className={`w-3 h-3 text-muted-foreground/40 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''} ${isVuln ? '' : 'ml-auto'}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>

                        {isOpen && (
                          <div className="px-4 pb-3 pt-1 bg-[oklch(0.06_0.008_200)] space-y-3 font-mono text-xs border-t border-border/50">
                            {/* Request */}
                            <div>
                              <p className="text-[10px] text-muted-foreground/60 uppercase font-sans mb-1.5">Request</p>
                              <div className="bg-[oklch(0.05_0.005_200)] rounded border border-border/50 overflow-hidden">
                                <div className="px-3 py-2 border-b border-border/50">
                                  <span className={`font-bold mr-2 ${METHOD_COLOR[req.method] ?? 'text-foreground'}`}>{req.method}</span>
                                  <span className="text-foreground/70 break-all">{req.url}</span>
                                </div>
                                {Object.keys(req.requestHeaders).length > 0 && (
                                  <div className="px-3 py-2 border-b border-border/50 space-y-0.5">
                                    {Object.entries(req.requestHeaders).map(([k, v]) => (
                                      <div key={k}><span className="text-foreground/50">{k}: </span><span className="text-muted-foreground">{String(v)}</span></div>
                                    ))}
                                  </div>
                                )}
                                {req.requestBody && (
                                  <pre className="px-3 py-2 text-yellow-400/70 whitespace-pre-wrap text-[11px]">{prettyBody(req.requestBody)}</pre>
                                )}
                              </div>
                            </div>
                            {/* Response */}
                            <div>
                              <p className="text-[10px] text-muted-foreground/60 uppercase font-sans mb-1.5">Response</p>
                              <div className="bg-[oklch(0.05_0.005_200)] rounded border border-border/50 overflow-hidden">
                                <div className={`px-3 py-2 border-b border-border/50 font-bold text-[11px] ${
                                  req.status === 0 ? 'text-muted-foreground' :
                                  req.status < 300 ? 'text-primary' :
                                  req.status < 400 ? 'text-yellow-400' : 'text-destructive'
                                }`}>HTTP {req.status || '(no response)'}</div>
                                {req.responseBody && (
                                  <pre className="px-3 py-2 text-muted-foreground whitespace-pre-wrap text-[11px]">{prettyBody(req.responseBody)}</pre>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Container output */}
      {isRealScan && scanData?.containerLogs && (
        <div className="mt-4 bg-[oklch(0.07_0.01_200)] border border-border rounded-xl overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors"
            onClick={() => setContainerLogOpen(v => !v)}
          >
            <div className="flex items-center gap-2">
              <svg className="w-3.5 h-3.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-xs font-medium text-muted-foreground">Container output</span>
              <span className="text-[10px] text-muted-foreground/50 bg-muted/20 border border-border px-1.5 py-0.5 rounded">
                {scanData.containerLogs.split('\n').filter(Boolean).length} lines
              </span>
            </div>
            <svg
              className={`w-4 h-4 text-muted-foreground transition-transform ${containerLogOpen ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {containerLogOpen && (
            <div className="border-t border-border p-4 font-mono text-[11px] text-muted-foreground max-h-96 overflow-y-auto leading-relaxed whitespace-pre-wrap bg-[oklch(0.05_0.008_200)]">
              {scanData.containerLogs}
            </div>
          )}
        </div>
      )}

      {/* Scan execution log */}
      {events.length > 0 && (
        <div className="mt-6 border border-border rounded-xl overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-4 py-3 bg-muted/10 hover:bg-muted/20 transition-colors"
            onClick={() => setScanLogOpen((v) => !v)}
          >
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary/60 flex-shrink-0" />
              <span className="text-xs font-medium text-foreground">Execution log</span>
              <span className="text-[10px] text-muted-foreground/60 tabular-nums">{events.length} events</span>
            </div>
            <svg
              className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${scanLogOpen ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {scanLogOpen && (
            <div className="border-t border-border bg-[oklch(0.06_0.01_200)] p-4 font-mono text-xs max-h-96 overflow-y-auto space-y-1">
              {events.map((ev, i) => (
                <div key={i} className="flex items-start gap-3 leading-relaxed">
                  <span className="text-muted-foreground/30 flex-shrink-0 select-none whitespace-nowrap">
                    {new Date(ev.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                  <span className={`flex-1 ${EVENT_COLOR[ev.type] ?? 'text-muted-foreground'}`}>{ev.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
