import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { MOCK_SCANS, MOCK_FINDINGS, type Finding, type Severity } from '@/lib/mock-data'

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

// ─── Live scan events (simulated) ────────────────────────────────────────────

const SCAN_EVENTS = [
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
]

const EVENT_COLOR: Record<string, string> = {
  critical: 'text-destructive',
  high: 'text-orange-400',
  medium: 'text-yellow-400',
  success: 'text-primary',
  info: 'text-muted-foreground',
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FindingRow({ finding, expanded, onToggle }: { finding: Finding; expanded: boolean; onToggle: () => void }) {
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
        <div className="border-t border-border px-4 pb-4 pt-4 space-y-4 bg-[oklch(0.08_0.01_200)]">
          <p className="text-sm text-muted-foreground leading-relaxed">{finding.description}</p>

          <div className="grid md:grid-cols-2 gap-3">
            {/* Request */}
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Proof — Request</p>
              <div className="bg-[oklch(0.06_0.008_200)] border border-border rounded-lg p-3 font-mono text-xs space-y-1">
                <p className="text-primary">{finding.proof_request.method} {finding.proof_request.url}</p>
                {Object.entries(finding.proof_request.headers).map(([k, v]) => (
                  <p key={k} className="text-muted-foreground"><span className="text-foreground/60">{k}:</span> {v}</p>
                ))}
                {finding.proof_request.body && (
                  <pre className="text-yellow-400/80 mt-2 whitespace-pre-wrap text-[10px]">{finding.proof_request.body}</pre>
                )}
              </div>
            </div>

            {/* Response */}
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Proof — Response</p>
              <div className="bg-[oklch(0.06_0.008_200)] border border-border rounded-lg p-3 font-mono text-xs space-y-1">
                <p className={finding.proof_response.status < 400 ? 'text-destructive font-bold' : 'text-primary'}>
                  HTTP {finding.proof_response.status}
                </p>
                <pre className="text-muted-foreground whitespace-pre-wrap text-[10px] mt-2">{finding.proof_response.body_excerpt}</pre>
              </div>
            </div>
          </div>

          {/* curl */}
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Reproduce</p>
            <div className="bg-[oklch(0.06_0.008_200)] border border-border rounded-lg p-3 font-mono text-xs">
              <pre className="text-foreground/80 whitespace-pre-wrap">{finding.curl_command}</pre>
            </div>
          </div>

          {/* Fix */}
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
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ScanDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isRunning = id === 'scan-running'
  const scan = isRunning ? null : MOCK_SCANS.find(s => s.id === id)

  // Live scan simulation state
  const [progress, setProgress] = useState(0)
  const [events, setEvents] = useState<typeof SCAN_EVENTS>([])
  const [phase, setPhase] = useState('Spinning up sandbox…')
  const [done, setDone] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isRunning) return
    const timers: ReturnType<typeof setTimeout>[] = []

    SCAN_EVENTS.forEach(ev => {
      const t = setTimeout(() => {
        setEvents(prev => [...prev, ev])
        const pct = Math.round((ev.t / 15500) * 100)
        setProgress(pct)
        if (ev.t < 4500) setPhase('Building sandbox…')
        else if (ev.t < 6000) setPhase('Running static analysis…')
        else if (ev.t < 15000) setPhase('AI agent attacking…')
        else setPhase('Generating report…')
        if (ev.t >= 15500) {
          setTimeout(() => setDone(true), 600)
        }
        requestAnimationFrame(() => {
          logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' })
        })
      }, ev.t)
      timers.push(t)
    })

    return () => timers.forEach(clearTimeout)
  }, [isRunning])

  // Completed scan
  const [filter, setFilter] = useState<Severity | 'all'>('all')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const findings = filter === 'all' ? MOCK_FINDINGS : MOCK_FINDINGS.filter(f => f.severity === filter)
  const displayScan = scan ?? MOCK_SCANS[0]

  // ── Running view ──────────────────────────────────────────────────────────
  if (isRunning && !done) {
    return (
      <div className="p-8 max-w-3xl">
        <button
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
          onClick={() => navigate('/app')}
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

          {/* Phase steps */}
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
                  {String(Math.floor(ev.t / 1000)).padStart(2, '0')}s
                </span>
                <span className={EVENT_COLOR[ev.type]}>{ev.text}</span>
              </div>
            ))}
            {events.length === 0 && <p className="text-muted-foreground/40">Initializing…</p>}
          </div>
        </div>
      </div>
    )
  }

  // ── Completed view ─────────────────────────────────────────────────────────
  return (
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
        ].map(s => (
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
        {(['all', 'critical', 'high', 'medium', 'low'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors capitalize ${
              filter === f
                ? 'bg-primary/10 text-primary border border-primary/30'
                : 'text-muted-foreground hover:text-foreground border border-transparent'
            }`}
          >
            {f === 'all' ? `All (${MOCK_FINDINGS.length})` : f}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setExpanded(new Set(findings.map(f => f.id)))}
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
        {findings.map(f => (
          <FindingRow
            key={f.id}
            finding={f}
            expanded={expanded.has(f.id)}
            onToggle={() => setExpanded(prev => {
              const next = new Set(prev)
              next.has(f.id) ? next.delete(f.id) : next.add(f.id)
              return next
            })}
          />
        ))}
      </div>
    </div>
  )
}
