import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@/context/auth'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type GitHubStatus = 'loading' | 'connected' | 'disconnected' | 'error'

export function Settings() {
  const { user, logout } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  const [ghStatus, setGhStatus] = useState<GitHubStatus>('loading')
  const [ghBusy, setGhBusy] = useState(false)
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // ── Read OAuth redirect result ────────────────────────────────────────────
  useEffect(() => {
    const result = searchParams.get('github')
    if (!result) return
    setSearchParams({}, { replace: true })

    if (result === 'connected') {
      setBanner({ type: 'success', text: 'GitHub connected successfully.' })
      setGhStatus('connected')
    } else if (result === 'denied') {
      setBanner({ type: 'error', text: 'GitHub authorization was denied.' })
    } else {
      setBanner({ type: 'error', text: 'GitHub connection failed. Please try again.' })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Check current GitHub status ────────────────────────────────────────────
  useEffect(() => {
    api.auth.githubStatus()
      .then(({ connected }) => setGhStatus(connected ? 'connected' : 'disconnected'))
      .catch(() => setGhStatus('error'))
  }, [])

  async function connectGitHub() {
    setGhBusy(true)
    try {
      const { url } = await api.auth.githubConnect()
      window.location.href = url
    } catch (err) {
      setBanner({ type: 'error', text: err instanceof Error ? err.message : 'Failed to start GitHub OAuth.' })
      setGhBusy(false)
    }
  }

  async function disconnectGitHub() {
    setGhBusy(true)
    try {
      await api.auth.githubDisconnect()
      setGhStatus('disconnected')
      setBanner({ type: 'success', text: 'GitHub disconnected.' })
    } catch {
      setBanner({ type: 'error', text: 'Failed to disconnect GitHub.' })
    } finally {
      setGhBusy(false)
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Manage your account and integrations.</p>
      </div>

      {/* Banner */}
      {banner && (
        <div className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 mb-6 text-sm ${
          banner.type === 'success'
            ? 'border-primary/30 bg-primary/5 text-primary'
            : 'border-destructive/30 bg-destructive/5 text-destructive'
        }`}>
          <span>{banner.text}</span>
          <button onClick={() => setBanner(null)} className="opacity-60 hover:opacity-100 transition-opacity text-lg leading-none">×</button>
        </div>
      )}

      {/* Account */}
      <section className="bg-card border border-border rounded-xl divide-y divide-border mb-6">
        <div className="px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground mb-4">Account</h2>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                defaultValue={user?.name ?? ''}
                className="bg-background border-border"
                disabled
              />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input
                defaultValue={user?.email ?? ''}
                type="email"
                className="bg-background border-border"
                disabled
              />
            </div>
          </div>
        </div>
        <div className="px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Sign out</p>
            <p className="text-xs text-muted-foreground mt-0.5">End your current session.</p>
          </div>
          <Button variant="outline" size="sm" className="border-border" onClick={logout}>
            Sign out
          </Button>
        </div>
      </section>

      {/* GitHub integration */}
      <section className="bg-card border border-border rounded-xl divide-y divide-border">
        <div className="px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground mb-1">Integrations</h2>
          <p className="text-xs text-muted-foreground">Connect external accounts to allow VulnScout to clone private repositories.</p>
        </div>

        <div className="px-5 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-muted/30 border border-border flex items-center justify-center flex-shrink-0 text-foreground">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">GitHub</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {ghStatus === 'loading' && 'Checking…'}
                {ghStatus === 'connected' && 'Connected — private repos enabled'}
                {ghStatus === 'disconnected' && 'Not connected — public repos only'}
                {ghStatus === 'error' && 'Could not check status'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {ghStatus === 'connected' && (
              <>
                <span className="flex items-center gap-1 text-xs text-primary">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                  Connected
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-border text-muted-foreground h-8 text-xs"
                  onClick={disconnectGitHub}
                  disabled={ghBusy}
                >
                  Disconnect
                </Button>
              </>
            )}
            {(ghStatus === 'disconnected' || ghStatus === 'error') && (
              <Button
                size="sm"
                className="bg-foreground text-background hover:bg-foreground/90 h-8 text-xs font-medium"
                onClick={connectGitHub}
                disabled={ghBusy}
              >
                {ghBusy ? 'Redirecting…' : 'Connect GitHub'}
              </Button>
            )}
            {ghStatus === 'loading' && (
              <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
