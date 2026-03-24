import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MOCK_SCANS, type Scan } from '@/lib/mock-data'

const STATUS_BADGE: Record<string, string> = {
  completed: 'text-primary bg-primary/10 border-primary/30',
  running: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
  failed: 'text-destructive bg-destructive/10 border-destructive/30',
  queued: 'text-muted-foreground bg-muted/30 border-border',
}

function SeverityBar({ scan }: { scan: Scan }) {
  const total = scan.critical + scan.high + scan.medium + scan.low
  if (total === 0) return <span className="text-xs text-muted-foreground/40">No findings</span>

  const segs = [
    { count: scan.critical, color: 'bg-destructive' },
    { count: scan.high, color: 'bg-orange-400' },
    { count: scan.medium, color: 'bg-yellow-400' },
    { count: scan.low, color: 'bg-muted-foreground/40' },
  ].filter((s) => s.count > 0)

  return (
    <div className="flex items-center gap-2">
      <div className="flex h-1.5 w-24 rounded-full overflow-hidden gap-px">
        {segs.map((s) => (
          <div
            key={s.color}
            className={`${s.color} h-full`}
            style={{ width: `${(s.count / total) * 100}%` }}
          />
        ))}
      </div>
      <span className="text-xs text-muted-foreground tabular-nums">{total}</span>
    </div>
  )
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

const completedScans = MOCK_SCANS.filter((s) => s.status === 'completed')
const totalFindings = completedScans.reduce((a, s) => a + s.critical + s.high + s.medium + s.low, 0)
const totalCritical = completedScans.reduce((a, s) => a + s.critical, 0)
const totalEndpoints = completedScans.reduce((a, s) => a + s.endpoints_scanned, 0)

export function Reports() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<'all' | 'completed' | 'failed'>('all')

  const displayed = MOCK_SCANS.filter((s) => {
    if (filter === 'completed') return s.status === 'completed'
    if (filter === 'failed') return s.status === 'failed'
    return true
  })

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {completedScans.length} completed scan{completedScans.length !== 1 ? 's' : ''} · {totalFindings} total findings
          </p>
        </div>
        <button
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground border border-border rounded-lg px-3 py-2 hover:text-foreground hover:border-border/80 transition-colors"
          onClick={() => {
            const csv = [
              'Scan ID,Service,Branch,Status,Profile,Critical,High,Medium,Low,Info,Endpoints,Requests,Duration,Date',
              ...MOCK_SCANS.filter((s) => s.status === 'completed').map((s) =>
                [
                  s.id, s.service_name, s.branch ?? '', s.status, s.attack_profile,
                  s.critical, s.high, s.medium, s.low, s.info,
                  s.endpoints_scanned, s.requests_fired, s.duration ?? '',
                  s.completed_at ? formatDate(s.completed_at) : '',
                ].join(','),
              ),
            ].join('\n')
            const blob = new Blob([csv], { type: 'text/csv' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = 'vulnscout-reports.csv'
            a.click()
            URL.revokeObjectURL(url)
          }}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export CSV
        </button>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Scans', value: completedScans.length, sub: 'completed' },
          { label: 'Findings', value: totalFindings, sub: 'total' },
          { label: 'Critical', value: totalCritical, sub: 'need attention', danger: totalCritical > 0 },
          { label: 'Endpoints', value: totalEndpoints, sub: 'tested' },
        ].map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-3">
            <p className={`text-xl font-bold ${s.danger ? 'text-destructive' : 'text-foreground'}`}>{s.value}</p>
            <div>
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="text-[10px] text-muted-foreground/50">{s.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 mb-4 bg-muted/20 border border-border rounded-lg p-1 w-fit">
        {(['all', 'completed', 'failed'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors capitalize ${
              filter === f
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Reports table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto_auto_auto] text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 px-5 py-2.5 border-b border-border bg-muted/10">
          <span>Service</span>
          <span className="w-32 text-center">Findings</span>
          <span className="w-20 text-right">Endpoints</span>
          <span className="w-24 text-right">Date</span>
          <span className="w-24 text-right">Status</span>
        </div>

        <div className="divide-y divide-border">
          {displayed.map((scan) => (
            <div
              key={scan.id}
              className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center px-5 py-4 hover:bg-white/[0.02] transition-colors cursor-pointer group"
              onClick={() => navigate(`/app/scans/${scan.id}`)}
            >
              {/* Service info */}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground truncate">{scan.service_name}</p>
                  {scan.branch && (
                    <span className="text-[10px] font-mono text-muted-foreground bg-muted/30 px-1.5 py-0.5 rounded border border-border flex-shrink-0">
                      {scan.branch}
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground/50 flex-shrink-0">{scan.attack_profile}</span>
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{scan.service_source}</p>
              </div>

              {/* Findings bar */}
              <div className="w-32 flex justify-center">
                <SeverityBar scan={scan} />
              </div>

              {/* Endpoints */}
              <div className="w-20 text-right">
                {scan.status === 'completed' ? (
                  <div>
                    <p className="text-xs text-foreground tabular-nums">{scan.endpoints_scanned}</p>
                    <p className="text-[10px] text-muted-foreground/60">{scan.requests_fired} req</p>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground/40">—</span>
                )}
              </div>

              {/* Date */}
              <div className="w-24 text-right">
                {scan.completed_at ? (
                  <div>
                    <p className="text-xs text-foreground">{formatDate(scan.completed_at)}</p>
                    <p className="text-[10px] text-muted-foreground/60">{scan.duration}</p>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground/40">—</span>
                )}
              </div>

              {/* Status */}
              <div className="w-24 flex items-center justify-end gap-2">
                <span
                  className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full border ${STATUS_BADGE[scan.status]}`}
                >
                  {scan.status}
                </span>
                <svg className="w-4 h-4 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          ))}

          {displayed.length === 0 && (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              No reports match the selected filter.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
