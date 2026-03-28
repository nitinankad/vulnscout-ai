import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api, type Service, type Scan } from '@/lib/api'
import { Button } from '@/components/ui/button'

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 2) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatDuration(ms: number | null) {
  if (!ms) return null
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

const STATUS_BADGE: Record<string, string> = {
  completed: 'text-primary bg-primary/10 border-primary/30',
  running: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
  failed: 'text-destructive bg-destructive/10 border-destructive/30',
  queued: 'text-muted-foreground bg-muted/30 border-border',
}

export function ServiceDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [service, setService] = useState<Service | null>(null)
  const [scans, setScans] = useState<Scan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    Promise.all([api.services.list(), api.scans.list()])
      .then(([services, allScans]) => {
        const svc = services.find((s) => s.id === id) ?? null
        if (!svc) { setError('Service not found'); return }
        setService(svc)
        const svcScans = allScans
          .filter((s) => s.serviceId === id)
          .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
        setScans(svcScans)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="p-8 text-sm text-muted-foreground">Loading…</div>
    )
  }

  if (error || !service) {
    return (
      <div className="p-8">
        <p className="text-sm text-destructive">{error ?? 'Service not found'}</p>
        <button className="mt-2 text-xs text-primary hover:underline" onClick={() => navigate('/app/services')}>
          ← Back to services
        </button>
      </div>
    )
  }

  const envVarCount = Object.keys(service.envVars ?? {}).length
  const latestScan = scans[0] ?? null
  const totalFindings = scans.reduce((a, s) => a + s.critical + s.high + s.medium + s.low, 0)
  const totalCritical = scans.reduce((a, s) => a + s.critical, 0)

  return (
    <div className="p-8 max-w-4xl">
      {/* Breadcrumb */}
      <button
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-6"
        onClick={() => navigate('/app/services')}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Services
      </button>

      {/* Service header */}
      <div className="flex items-start justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-muted/30 border border-border flex items-center justify-center text-muted-foreground flex-shrink-0">
            {service.sourceType === 'github' ? (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            )}
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-foreground tracking-tight">{service.name}</h1>
              {service.branch && (
                <span className="text-xs font-mono text-muted-foreground bg-muted/30 px-2 py-0.5 rounded border border-border">
                  {service.branch}
                </span>
              )}
              {envVarCount > 0 && (
                <span className="text-[10px] font-medium text-muted-foreground bg-muted/20 px-2 py-0.5 rounded border border-border">
                  {envVarCount} env var{envVarCount !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5 truncate max-w-lg">{service.source}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            title="Delete service"
            className="w-9 h-9 flex items-center justify-center rounded-md border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-colors"
            onClick={() => setConfirmDelete(true)}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90 glow-green h-9 font-medium text-sm"
            onClick={() => navigate('/app/scans/new')}
          >
            <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            Run scan
          </Button>
        </div>
      </div>

      {/* Delete confirmation banner */}
      {confirmDelete && (
        <div className="mb-6 flex items-center justify-between gap-4 px-4 py-3 rounded-lg border border-destructive/30 bg-destructive/5">
          <p className="text-sm text-foreground">
            Delete <span className="font-medium">{service.name}</span> and all {scans.length} scan{scans.length !== 1 ? 's' : ''}? This cannot be undone.
          </p>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              className="h-8 px-3 text-xs font-medium rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setConfirmDelete(false)}
              disabled={deleting}
            >
              Cancel
            </button>
            <button
              className="h-8 px-3 text-xs font-medium rounded-md bg-destructive text-white hover:bg-destructive/90 transition-colors disabled:opacity-50"
              disabled={deleting}
              onClick={async () => {
                setDeleting(true)
                try {
                  await api.services.delete(id!)
                  navigate('/app/services')
                } catch {
                  setDeleting(false)
                  setConfirmDelete(false)
                }
              }}
            >
              {deleting ? 'Deleting…' : 'Delete service'}
            </button>
          </div>
        </div>
      )}

      {/* Summary strip */}
      {scans.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: 'Scans run', value: scans.length },
            { label: 'Total findings', value: totalFindings },
            { label: 'Critical', value: totalCritical, danger: totalCritical > 0 },
          ].map((s) => (
            <div key={s.label} className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-3">
              <p className={`text-xl font-bold tabular-nums ${s.danger ? 'text-destructive' : 'text-foreground'}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Scan history */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Scan history</h2>
          {latestScan?.status === 'running' && (
            <span className="text-xs text-yellow-400 animate-pulse">Scan in progress…</span>
          )}
        </div>

        {scans.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-sm text-muted-foreground mb-3">No scans yet for this service.</p>
            <Button
              size="sm"
              className="bg-primary text-primary-foreground hover:bg-primary/90 h-8 text-xs"
              onClick={() => navigate('/app/scans/new')}
            >
              Run first scan
            </Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 px-5 py-2.5 border-b border-border bg-muted/10">
              <span className="w-24">Date</span>
              <span>Profile</span>
              <span className="w-32 text-right">Findings</span>
              <span className="w-20 text-right">Duration</span>
              <span className="w-24 text-right">Status</span>
            </div>
            <div className="divide-y divide-border">
              {scans.map((scan) => {
                const total = scan.critical + scan.high + scan.medium + scan.low
                return (
                  <div
                    key={scan.id}
                    className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center px-5 py-3.5 hover:bg-white/[0.02] cursor-pointer transition-colors group"
                    onClick={() => navigate(`/app/scans/${scan.id}`)}
                  >
                    <div className="w-24">
                      <p className="text-xs text-foreground">{formatRelative(scan.startedAt)}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">{scan.attackProfile}</p>
                    <div className="w-32 flex items-center justify-end gap-2">
                      {scan.status === 'completed' && total === 0 && (
                        <span className="text-xs text-muted-foreground/40">clean</span>
                      )}
                      {scan.critical > 0 && <span className="text-xs font-semibold text-destructive">{scan.critical}C</span>}
                      {scan.high > 0 && <span className="text-xs font-semibold text-orange-400">{scan.high}H</span>}
                      {scan.medium > 0 && <span className="text-xs font-semibold text-yellow-400">{scan.medium}M</span>}
                      {scan.low > 0 && <span className="text-xs font-semibold text-muted-foreground">{scan.low}L</span>}
                    </div>
                    <div className="w-20 text-right">
                      <span className="text-xs text-muted-foreground">{formatDuration(scan.durationMs) ?? '—'}</span>
                    </div>
                    <div className="w-24 flex items-center justify-end gap-2">
                      <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full border ${STATUS_BADGE[scan.status]}`}>
                        {scan.status}
                      </span>
                      <svg className="w-3.5 h-3.5 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
