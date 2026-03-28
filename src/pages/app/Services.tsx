import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type Service, type Scan } from '@/lib/api'
import { Button } from '@/components/ui/button'

function GitHubIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  )
}

function DocIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  )
}

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const STATUS_BADGE: Record<string, string> = {
  completed: 'text-primary bg-primary/10 border-primary/30',
  running: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
  failed: 'text-destructive bg-destructive/10 border-destructive/30',
  queued: 'text-muted-foreground bg-muted/30 border-border',
}

interface Row {
  service: Service
  latestScan: Scan | null
  scanCount: number
}

export function Services() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([api.services.list(), api.scans.list()])
      .then(([services, scans]) => {
        const built: Row[] = services.map((svc) => {
          const svcScans = scans
            .filter((s) => s.serviceId === svc.id)
            .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
          return { service: svc, latestScan: svcScans[0] ?? null, scanCount: svcScans.length }
        })
        setRows(built)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const filtered = rows.filter(
    ({ service }) =>
      service.name.toLowerCase().includes(search.toLowerCase()) ||
      service.source.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Services</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {loading ? 'Loading…' : `${rows.length} connected`}
          </p>
        </div>
        <Button
          className="bg-primary text-primary-foreground hover:bg-primary/90 glow-green h-9 font-medium text-sm"
          onClick={() => navigate('/app/scans/new')}
        >
          <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          Add service
        </Button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          className="w-full bg-card border border-border rounded-lg pl-8 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
          placeholder="Search services…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto_auto] text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 px-5 py-2.5 border-b border-border bg-muted/10">
          <span>Service</span>
          <span className="w-36 text-right">Findings</span>
          <span className="w-28 text-right">Last scan</span>
          <span className="w-28 text-right">Status</span>
        </div>

        {loading && (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">Loading…</div>
        )}

        {error && (
          <div className="px-5 py-10 text-center text-sm text-destructive">{error}</div>
        )}

        {!loading && !error && (
          <div className="divide-y divide-border">
            {filtered.map(({ service, latestScan, scanCount }) => (
              <div
                key={service.id}
                className="grid grid-cols-[1fr_auto_auto_auto] items-center px-5 py-4 hover:bg-white/[0.02] transition-colors cursor-pointer group"
                onClick={() => navigate(`/app/services/${service.id}`)}
              >
                {/* Service info */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-muted/30 border border-border flex items-center justify-center flex-shrink-0 text-muted-foreground">
                    {service.sourceType === 'github' ? <GitHubIcon /> : <DocIcon />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground truncate">{service.name}</p>
                      {service.branch && (
                        <span className="text-[10px] font-mono text-muted-foreground bg-muted/30 px-1.5 py-0.5 rounded border border-border flex-shrink-0">
                          {service.branch}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {service.source}
                      {scanCount > 0 && <span className="ml-2 opacity-50">· {scanCount} scan{scanCount !== 1 ? 's' : ''}</span>}
                    </p>
                  </div>
                </div>

                {/* Findings */}
                <div className="w-36 flex items-center justify-end gap-2.5">
                  {latestScan ? (
                    <>
                      {latestScan.critical > 0 && <span className="text-xs font-semibold text-destructive">{latestScan.critical}C</span>}
                      {latestScan.high > 0 && <span className="text-xs font-semibold text-orange-400">{latestScan.high}H</span>}
                      {latestScan.medium > 0 && <span className="text-xs font-semibold text-yellow-400">{latestScan.medium}M</span>}
                      {latestScan.low > 0 && <span className="text-xs font-semibold text-muted-foreground">{latestScan.low}L</span>}
                      {(latestScan.critical + latestScan.high + latestScan.medium + latestScan.low) === 0 && latestScan.status === 'completed' && (
                        <span className="text-xs text-muted-foreground/40">clean</span>
                      )}
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground/40">—</span>
                  )}
                </div>

                {/* Last scan time */}
                <div className="w-28 text-right">
                  {latestScan ? (
                    <span className="text-xs text-muted-foreground">{formatRelative(latestScan.startedAt)}</span>
                  ) : (
                    <span className="text-xs text-muted-foreground/40">Never</span>
                  )}
                </div>

                {/* Status + scan action */}
                <div className="w-28 flex items-center justify-end gap-2">
                  {latestScan && (
                    <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full border ${STATUS_BADGE[latestScan.status]}`}>
                      {latestScan.status}
                    </span>
                  )}
                  <button
                    className="text-[10px] font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity hover:underline"
                    onClick={(e) => { e.stopPropagation(); navigate('/app/scans/new') }}
                  >
                    Scan
                  </button>
                </div>
              </div>
            ))}

            {filtered.length === 0 && (
              <div className="px-5 py-10 text-center">
                <p className="text-sm text-muted-foreground">
                  {rows.length === 0 ? 'No services yet.' : 'No services match your search.'}
                </p>
                {rows.length === 0 && (
                  <Button
                    size="sm"
                    className="mt-3 bg-primary text-primary-foreground hover:bg-primary/90 h-8 text-xs"
                    onClick={() => navigate('/app/scans/new')}
                  >
                    Connect your first service
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
