import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type FindingWithContext } from '@/lib/api'

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info'] as const

const SEVERITY_STYLES: Record<string, { dot: string; badge: string; label: string }> = {
  critical: { dot: 'bg-destructive', badge: 'text-destructive bg-destructive/10 border-destructive/30', label: 'Critical' },
  high: { dot: 'bg-orange-400', badge: 'text-orange-400 bg-orange-400/10 border-orange-400/30', label: 'High' },
  medium: { dot: 'bg-yellow-400', badge: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30', label: 'Medium' },
  low: { dot: 'bg-muted-foreground/50', badge: 'text-muted-foreground bg-muted/20 border-border', label: 'Low' },
  info: { dot: 'bg-primary/50', badge: 'text-primary bg-primary/10 border-primary/30', label: 'Info' },
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function Findings() {
  const navigate = useNavigate()
  const [findings, setFindings] = useState<FindingWithContext[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [severityFilter, setSeverityFilter] = useState<string>('all')
  const [serviceFilter, setServiceFilter] = useState<string>('all')
  const [classFilter, setClassFilter] = useState<string>('all')

  useEffect(() => {
    api.findings.list()
      .then((data) => {
        // Sort by severity order, then by date desc
        const sorted = [...data].sort((a, b) => {
          const si = SEVERITY_ORDER.indexOf(a.severity as typeof SEVERITY_ORDER[number])
          const sj = SEVERITY_ORDER.indexOf(b.severity as typeof SEVERITY_ORDER[number])
          if (si !== sj) return si - sj
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        })
        setFindings(sorted)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const serviceNames = [...new Set(findings.map((f) => f.serviceName).filter(Boolean))] as string[]
  const vulnClasses = [...new Set(findings.map((f) => f.vulnClass))]

  const displayed = findings.filter((f) => {
    if (severityFilter !== 'all' && f.severity !== severityFilter) return false
    if (serviceFilter !== 'all' && f.serviceName !== serviceFilter) return false
    if (classFilter !== 'all' && f.vulnClass !== classFilter) return false
    return true
  })

  function exportCsv() {
    const header = 'Severity,Title,Method,Endpoint,Service,Vuln Class,CWE,OWASP,Date'
    const rows = displayed.map((f) =>
      [
        f.severity,
        `"${f.title.replace(/"/g, '""')}"`,
        f.method,
        f.endpoint,
        f.serviceName ?? '',
        f.vulnClass,
        f.cweId,
        `"${f.owaspCategory.replace(/"/g, '""')}"`,
        f.scanStartedAt ? formatDate(f.scanStartedAt) : '',
      ].join(','),
    )
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'findings.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const counts = SEVERITY_ORDER.reduce((acc, s) => {
    acc[s] = findings.filter((f) => f.severity === s).length
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Findings</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {loading ? 'Loading…' : `${findings.length} total across all services`}
          </p>
        </div>
        {displayed.length > 0 && (
          <button
            onClick={exportCsv}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground border border-border rounded-lg px-3 py-2 hover:text-foreground hover:border-border/80 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export CSV
          </button>
        )}
      </div>

      {/* Severity summary */}
      {!loading && findings.length > 0 && (
        <div className="flex items-center gap-3 mb-6">
          {SEVERITY_ORDER.filter((s) => counts[s] > 0).map((s) => (
            <button
              key={s}
              onClick={() => setSeverityFilter(severityFilter === s ? 'all' : s)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                severityFilter === s
                  ? SEVERITY_STYLES[s].badge
                  : 'bg-card border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              <div className={`w-1.5 h-1.5 rounded-full ${SEVERITY_STYLES[s].dot}`} />
              {counts[s]} {SEVERITY_STYLES[s].label}
            </button>
          ))}
          {severityFilter !== 'all' && (
            <button
              onClick={() => setSeverityFilter('all')}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors ml-1"
            >
              Clear ×
            </button>
          )}
        </div>
      )}

      {/* Filters */}
      {!loading && (serviceNames.length > 1 || vulnClasses.length > 1) && (
        <div className="flex items-center gap-3 mb-4">
          {serviceNames.length > 1 && (
            <select
              className="bg-card border border-border rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
              value={serviceFilter}
              onChange={(e) => setServiceFilter(e.target.value)}
            >
              <option value="all">All services</option>
              {serviceNames.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          {vulnClasses.length > 1 && (
            <select
              className="bg-card border border-border rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
            >
              <option value="all">All categories</option>
              {vulnClasses.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
            </select>
          )}
        </div>
      )}

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {!loading && findings.length > 0 && (
          <div className="grid grid-cols-[auto_1fr_auto_auto_auto] text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 px-5 py-2.5 border-b border-border bg-muted/10">
            <span className="w-20">Severity</span>
            <span>Finding</span>
            <span className="w-32 text-right">Service</span>
            <span className="w-24 text-right">Category</span>
            <span className="w-24 text-right">Date</span>
          </div>
        )}

        {loading && (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">Loading findings…</div>
        )}

        {error && (
          <div className="px-5 py-10 text-center text-sm text-destructive">{error}</div>
        )}

        {!loading && !error && findings.length === 0 && (
          <div className="px-5 py-12 text-center">
            <p className="text-sm text-muted-foreground">No findings yet — run a scan to see results here.</p>
          </div>
        )}

        {!loading && !error && findings.length > 0 && displayed.length === 0 && (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            No findings match the selected filters.
          </div>
        )}

        {!loading && !error && displayed.length > 0 && (
          <div className="divide-y divide-border">
            {displayed.map((f) => {
              const style = SEVERITY_STYLES[f.severity] ?? SEVERITY_STYLES.info
              return (
                <div
                  key={f.id}
                  className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center px-5 py-3.5 hover:bg-white/[0.02] cursor-pointer transition-colors group"
                  onClick={() => navigate(`/app/scans/${f.scanId}`)}
                >
                  <div className="w-20">
                    <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full border ${style.badge}`}>
                      {f.severity}
                    </span>
                  </div>

                  <div className="min-w-0 pr-4">
                    <p className="text-sm font-medium text-foreground truncate">{f.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 font-mono truncate">
                      <span className="text-muted-foreground/60">{f.method}</span> {f.endpoint}
                    </p>
                  </div>

                  <div className="w-32 text-right">
                    <p className="text-xs text-muted-foreground truncate">{f.serviceName ?? '—'}</p>
                  </div>

                  <div className="w-24 text-right">
                    <p className="text-xs text-muted-foreground/60">{f.vulnClass.replace(/_/g, ' ')}</p>
                  </div>

                  <div className="w-24 flex items-center justify-end gap-2">
                    <p className="text-xs text-muted-foreground">
                      {f.scanStartedAt ? formatDate(f.scanStartedAt) : '—'}
                    </p>
                    <svg className="w-3.5 h-3.5 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
