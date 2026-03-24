import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { MOCK_SCANS } from '@/lib/mock-data'

const STATUS_BADGE: Record<string, string> = {
  completed: 'text-primary bg-primary/10 border-primary/30',
  running: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
  failed: 'text-destructive bg-destructive/10 border-destructive/30',
  queued: 'text-muted-foreground bg-muted/30 border-border',
}

export function Scans() {
  const navigate = useNavigate()

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Scans</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{MOCK_SCANS.length} scans total</p>
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

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-4 px-5 py-2.5 border-b border-border">
          {['Service', 'Profile', 'C', 'H', 'M', 'Status'].map(h => (
            <p key={h} className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium text-right first:text-left">{h}</p>
          ))}
        </div>

        <div className="divide-y divide-border">
          {MOCK_SCANS.map(scan => (
            <div
              key={scan.id}
              className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-4 items-center px-5 py-3.5 hover:bg-white/[0.02] cursor-pointer transition-colors"
              onClick={() => navigate(`/app/scans/${scan.id}`)}
            >
              <div className="min-w-0">
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
              <span className="text-xs text-muted-foreground text-right">{scan.attack_profile}</span>
              <span className={`text-xs font-semibold text-right ${scan.critical > 0 ? 'text-destructive' : 'text-muted-foreground/40'}`}>
                {scan.critical || '—'}
              </span>
              <span className={`text-xs font-semibold text-right ${scan.high > 0 ? 'text-orange-400' : 'text-muted-foreground/40'}`}>
                {scan.high || '—'}
              </span>
              <span className={`text-xs font-semibold text-right ${scan.medium > 0 ? 'text-yellow-400' : 'text-muted-foreground/40'}`}>
                {scan.medium || '—'}
              </span>
              <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full border text-right ${STATUS_BADGE[scan.status]}`}>
                {scan.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
