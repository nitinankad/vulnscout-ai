import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { api, type Service, type Scan } from '@/lib/api'

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 2) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const STATUS_COLOR: Record<string, string> = {
  completed: 'bg-primary',
  running: 'bg-yellow-400',
  failed: 'bg-destructive',
  queued: 'bg-muted-foreground/40',
}

export function Overview() {
  const navigate = useNavigate()
  const [services, setServices] = useState<Service[]>([])
  const [scans, setScans] = useState<Scan[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([api.services.list(), api.scans.list()])
      .then(([s, sc]) => { setServices(s); setScans(sc) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const completed = scans.filter((s) => s.status === 'completed')
  const totalFindings = completed.reduce((a, s) => a + s.critical + s.high + s.medium + s.low, 0)
  const totalCritical = completed.reduce((a, s) => a + s.critical, 0)
  const totalRequests = completed.reduce((a, s) => a + s.requestsFired, 0)

  const STATS = [
    {
      label: 'Services',
      value: loading ? '—' : services.length.toString(),
      sub: 'connected',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
        </svg>
      ),
    },
    {
      label: 'Findings',
      value: loading ? '—' : totalFindings.toString(),
      sub: 'across all scans',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
    },
    {
      label: 'Critical',
      value: loading ? '—' : totalCritical.toString(),
      sub: 'need attention',
      danger: totalCritical > 0,
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
        </svg>
      ),
    },
    {
      label: 'Requests fired',
      value: loading ? '—' : totalRequests.toLocaleString(),
      sub: 'in completed scans',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
    },
  ]

  // Last 10 scans sorted most recent first
  const serviceMap = new Map(services.map((s) => [s.id, s]))
  const recent = [...scans]
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .slice(0, 10)

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Security posture at a glance</p>
        </div>
        <Button
          className="bg-primary text-primary-foreground hover:bg-primary/90 glow-green h-9 font-medium text-sm"
          onClick={() => navigate('/app/scans/new')}
        >
          <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          New scan
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {STATS.map((stat) => (
          <div key={stat.label} className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${stat.danger ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>
              {stat.icon}
            </div>
            <div>
              <p className={`text-2xl font-bold tabular-nums ${stat.danger ? 'text-destructive' : 'text-foreground'}`}>
                {stat.value}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Recent activity */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Recent activity</h2>
          <button
            className="text-xs text-muted-foreground hover:text-primary transition-colors"
            onClick={() => navigate('/app/services')}
          >
            All services →
          </button>
        </div>

        {loading && (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">Loading…</div>
        )}

        {!loading && recent.length === 0 && (
          <div className="px-5 py-12 text-center">
            <p className="text-sm text-muted-foreground mb-3">No scans yet.</p>
            <Button
              size="sm"
              className="bg-primary text-primary-foreground hover:bg-primary/90 h-8 text-xs"
              onClick={() => navigate('/app/scans/new')}
            >
              Run your first scan
            </Button>
          </div>
        )}

        {!loading && recent.length > 0 && (
          <div className="divide-y divide-border">
            {recent.map((scan) => {
              const svc = serviceMap.get(scan.serviceId)
              const totalF = scan.critical + scan.high + scan.medium + scan.low
              return (
                <div
                  key={scan.id}
                  className="flex items-center gap-4 px-5 py-3 hover:bg-white/[0.02] cursor-pointer transition-colors"
                  onClick={() => navigate(`/app/scans/${scan.id}`)}
                >
                  {/* Status dot */}
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_COLOR[scan.status]}`} />

                  {/* Service name */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground truncate">
                        {svc?.name ?? 'Unknown service'}
                      </p>
                      {svc?.branch && (
                        <span className="text-[10px] font-mono text-muted-foreground bg-muted/30 px-1.5 py-0.5 rounded border border-border flex-shrink-0">
                          {svc.branch}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{scan.attackProfile} · {formatRelative(scan.startedAt)}</p>
                  </div>

                  {/* Findings summary */}
                  {scan.status === 'completed' && totalF > 0 ? (
                    <div className="flex items-center gap-2.5 flex-shrink-0">
                      {scan.critical > 0 && <span className="text-xs font-semibold text-destructive">{scan.critical}C</span>}
                      {scan.high > 0 && <span className="text-xs font-semibold text-orange-400">{scan.high}H</span>}
                      {scan.medium > 0 && <span className="text-xs font-semibold text-yellow-400">{scan.medium}M</span>}
                      {scan.low > 0 && <span className="text-xs font-semibold text-muted-foreground">{scan.low}L</span>}
                    </div>
                  ) : scan.status === 'completed' ? (
                    <span className="text-xs text-muted-foreground/40 flex-shrink-0">clean</span>
                  ) : (
                    <span className={`text-[10px] font-semibold uppercase flex-shrink-0 ${
                      scan.status === 'running' ? 'text-yellow-400' :
                      scan.status === 'failed' ? 'text-destructive' :
                      'text-muted-foreground'
                    }`}>{scan.status}</span>
                  )}

                  <svg className="w-4 h-4 text-muted-foreground/30 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
