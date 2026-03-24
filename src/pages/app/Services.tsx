import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MOCK_SERVICES, MOCK_SCANS, type Service } from '@/lib/mock-data'
import { Button } from '@/components/ui/button'

const STATUS_BADGE: Record<string, string> = {
  completed: 'text-primary bg-primary/10 border-primary/30',
  running: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
  failed: 'text-destructive bg-destructive/10 border-destructive/30',
  queued: 'text-muted-foreground bg-muted/30 border-border',
}

function SourceIcon({ type }: { type: Service['source_type'] }) {
  if (type === 'github') {
    return (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
      </svg>
    )
  }
  if (type === 'docker') {
    return (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M13.983 11.078h2.119a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.119a.185.185 0 00-.185.185v1.888c0 .102.083.185.185.185m-2.954-5.43h2.118a.186.186 0 00.186-.186V3.574a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.185m0 2.716h2.118a.187.187 0 00.186-.186V6.29a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.887c0 .102.082.185.185.186m-2.93 0h2.12a.186.186 0 00.184-.186V6.29a.185.185 0 00-.185-.185H8.1a.185.185 0 00-.185.185v1.887c0 .102.083.185.185.186m-2.964 0h2.119a.186.186 0 00.185-.186V6.29a.185.185 0 00-.185-.185H5.136a.186.186 0 00-.186.185v1.887c0 .102.084.185.186.186m5.893 2.715h2.118a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.185m-2.93 0h2.12a.185.185 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.185.185 0 00-.184.185v1.888c0 .102.083.185.185.185m-2.964 0h2.119a.185.185 0 00.185-.185V9.006a.185.185 0 00-.184-.186h-2.12a.186.186 0 00-.186.186v1.887c0 .102.084.185.186.185m-2.92 0h2.12a.186.186 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.185.185 0 00-.184.186v1.887c0 .102.082.185.185.185M23.763 9.89c-.065-.051-.672-.51-1.954-.51-.338.001-.676.03-1.01.087-.248-1.7-1.653-2.53-1.716-2.566l-.344-.199-.226.327c-.284.438-.49.922-.612 1.43-.23.97-.09 1.882.403 2.661-.595.332-1.55.413-1.744.42H.751a.751.751 0 00-.75.748 11.376 11.376 0 00.692 4.062c.545 1.428 1.355 2.48 2.41 3.124 1.18.723 3.1 1.137 5.275 1.137.983.003 1.963-.086 2.93-.266a12.248 12.248 0 003.823-1.389c.98-.567 1.86-1.288 2.61-2.136 1.252-1.418 1.998-2.997 2.553-4.4h.221c1.372 0 2.215-.549 2.68-1.009.309-.293.55-.65.707-1.046l.098-.288z" />
      </svg>
    )
  }
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  )
}

function SeverityPill({ count, label, color }: { count: number; label: string; color: string }) {
  if (count === 0) return <span className="text-muted-foreground/40 text-xs tabular-nums">—</span>
  return (
    <span className={`text-xs font-semibold tabular-nums ${color}`}>
      {count}<span className="text-muted-foreground/50 font-normal ml-0.5">{label}</span>
    </span>
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

export function Services() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')

  const filtered = MOCK_SERVICES.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.source.toLowerCase().includes(search.toLowerCase()),
  )

  const totalServices = MOCK_SERVICES.length
  const withCritical = MOCK_SERVICES.filter((s) => s.total_critical > 0).length
  const recentScans = MOCK_SCANS.filter((sc) => sc.status === 'completed').length

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Services</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {totalServices} connected · {withCritical} with critical findings
          </p>
        </div>
        <Button
          className="bg-primary text-primary-foreground hover:bg-primary/90 glow-green h-9 font-medium text-sm"
          onClick={() => navigate('/app/scans/new')}
        >
          <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          Connect service
        </Button>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Services', value: totalServices, sub: 'connected' },
          { label: 'Critical', value: MOCK_SERVICES.reduce((a, s) => a + s.total_critical, 0), sub: 'open findings', danger: true },
          { label: 'Scans run', value: recentScans, sub: 'completed' },
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

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 px-5 py-2.5 border-b border-border bg-muted/10">
          <span>Service</span>
          <span className="w-40 text-right">Findings</span>
          <span className="w-28 text-right">Last scanned</span>
          <span className="w-24 text-right">Status</span>
        </div>

        <div className="divide-y divide-border">
          {filtered.map((svc) => (
            <div
              key={svc.id}
              className="grid grid-cols-[1fr_auto_auto_auto] gap-0 items-center px-5 py-4 hover:bg-white/[0.02] transition-colors group"
            >
              {/* Name + source */}
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-muted/30 border border-border flex items-center justify-center flex-shrink-0 text-muted-foreground">
                  <SourceIcon type={svc.source_type} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground truncate">{svc.name}</p>
                    {svc.branch && (
                      <span className="text-[10px] font-mono text-muted-foreground bg-muted/30 px-1.5 py-0.5 rounded border border-border flex-shrink-0">
                        {svc.branch}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{svc.source}</p>
                </div>
              </div>

              {/* Severity counts */}
              <div className="w-40 flex items-center justify-end gap-3">
                <SeverityPill count={svc.total_critical} label="C" color="text-destructive" />
                <SeverityPill count={svc.total_high} label="H" color="text-orange-400" />
                <SeverityPill count={svc.total_medium} label="M" color="text-yellow-400" />
                <SeverityPill count={svc.total_low} label="L" color="text-muted-foreground" />
              </div>

              {/* Last scanned */}
              <div className="w-28 text-right">
                {svc.last_scan_status === 'failed' ? (
                  <span className="text-xs text-destructive">Scan failed</span>
                ) : (
                  <span className="text-xs text-muted-foreground">{formatRelative(svc.last_scanned)}</span>
                )}
              </div>

              {/* Status + action */}
              <div className="w-24 flex items-center justify-end gap-2">
                <span
                  className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full border ${STATUS_BADGE[svc.last_scan_status]}`}
                >
                  {svc.last_scan_status}
                </span>
                <button
                  className="text-[10px] font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity hover:underline"
                  onClick={() => navigate('/app/scans/new')}
                >
                  Scan
                </button>
              </div>
            </div>
          ))}

          {filtered.length === 0 && (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              No services match your search.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
