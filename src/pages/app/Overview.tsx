import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { MOCK_SCANS } from '@/lib/mock-data'

const STATUS_BADGE: Record<string, string> = {
  completed: 'text-primary bg-primary/10 border-primary/30',
  running: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
  failed: 'text-destructive bg-destructive/10 border-destructive/30',
  queued: 'text-muted-foreground bg-muted/30 border-border',
}

function SeverityDot({ count, color }: { count: number; color: string }) {
  if (count === 0) return <span className="text-muted-foreground/40 text-xs">—</span>
  return <span className={`text-xs font-semibold ${color}`}>{count}</span>
}

export function Overview() {
  const navigate = useNavigate()

  const totalVulns = MOCK_SCANS.reduce((a, s) => a + s.critical + s.high + s.medium + s.low, 0)
  const totalCritical = MOCK_SCANS.reduce((a, s) => a + s.critical, 0)
  const completedScans = MOCK_SCANS.filter(s => s.status === 'completed').length

  const STATS = [
    {
      label: 'Total scans',
      value: MOCK_SCANS.length.toString(),
      sub: `${completedScans} completed`,
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
    },
    {
      label: 'Vulnerabilities found',
      value: totalVulns.toString(),
      sub: 'across all scans',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
    },
    {
      label: 'Critical findings',
      value: totalCritical.toString(),
      sub: 'require immediate fix',
      danger: true,
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
        </svg>
      ),
    },
    {
      label: 'Avg scan time',
      value: '6m 36s',
      sub: 'for completed scans',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
  ]

  return (
    <div className="p-8 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Overview</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Welcome back, Nobody</p>
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
          <div
            key={stat.label}
            className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3"
          >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${stat.danger ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>
              {stat.icon}
            </div>
            <div>
              <p className={`text-2xl font-bold ${stat.danger ? 'text-destructive' : 'text-foreground'}`}>
                {stat.value}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Recent scans */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Recent scans</h2>
          <button
            className="text-xs text-muted-foreground hover:text-primary transition-colors"
            onClick={() => navigate('/app/scans')}
          >
            View all →
          </button>
        </div>

        <div className="divide-y divide-border">
          {MOCK_SCANS.map((scan) => (
            <div
              key={scan.id}
              className="flex items-center gap-4 px-5 py-3.5 hover:bg-white/[0.02] cursor-pointer transition-colors"
              onClick={() => navigate(`/app/scans/${scan.id}`)}
            >
              {/* Service */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground truncate">{scan.service_name}</p>
                  {scan.branch && (
                    <span className="text-[10px] font-mono text-muted-foreground bg-muted/30 px-1.5 py-0.5 rounded border border-border flex-shrink-0">
                      {scan.branch}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{scan.service_source}</p>
              </div>

              {/* Severity counts */}
              <div className="flex items-center gap-3 flex-shrink-0">
                <div className="flex items-center gap-1.5">
                  <SeverityDot count={scan.critical} color="text-destructive" />
                  <span className="text-[10px] text-muted-foreground">C</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <SeverityDot count={scan.high} color="text-orange-400" />
                  <span className="text-[10px] text-muted-foreground">H</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <SeverityDot count={scan.medium} color="text-yellow-400" />
                  <span className="text-[10px] text-muted-foreground">M</span>
                </div>
              </div>

              {/* Profile */}
              <span className="text-xs text-muted-foreground flex-shrink-0 hidden lg:block w-20 text-right">
                {scan.attack_profile}
              </span>

              {/* Status */}
              <span
                className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full border flex-shrink-0 ${STATUS_BADGE[scan.status]}`}
              >
                {scan.status}
              </span>

              {/* Duration */}
              <span className="text-xs text-muted-foreground flex-shrink-0 w-16 text-right">
                {scan.duration ?? '—'}
              </span>

              <svg className="w-4 h-4 text-muted-foreground/40 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
