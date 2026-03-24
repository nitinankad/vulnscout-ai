import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

const STEPS = ['Connect service', 'Attack profile', 'Review & launch']

const ATTACK_CLASSES = [
  { id: 'sql_injection', label: 'SQL Injection', owasp: 'API2', on: true },
  { id: 'auth_bypass', label: 'Auth Bypass', owasp: 'API2', on: true },
  { id: 'idor', label: 'IDOR', owasp: 'API1', on: true },
  { id: 'broken_access', label: 'Broken Access Control', owasp: 'API1', on: true },
  { id: 'xss', label: 'XSS', owasp: 'API9', on: true },
  { id: 'csrf', label: 'CSRF', owasp: 'API8', on: true },
  { id: 'ssrf', label: 'SSRF', owasp: 'API7', on: true },
  { id: 'path_traversal', label: 'Path Traversal', owasp: 'API9', on: true },
  { id: 'mass_assignment', label: 'Mass Assignment', owasp: 'API3', on: false },
  { id: 'rate_limiting', label: 'Rate Limiting', owasp: 'API4', on: false },
]

const PROFILES = [
  {
    id: 'quick',
    label: 'Quick',
    time: '~2 min',
    description: 'Top 5 vulnerability classes only. Good for CI/CD gates.',
  },
  {
    id: 'standard',
    label: 'Standard',
    time: '~8 min',
    description: 'Full OWASP Top 10 coverage with moderate depth.',
  },
  {
    id: 'aggressive',
    label: 'Aggressive',
    time: '~15 min',
    description: 'Deep attack chains, blind injection probes, brute-force logic tests.',
  },
]

type SourceTab = 'github' | 'docker' | 'openapi'

export function NewScan() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [sourceTab, setSourceTab] = useState<SourceTab>('github')
  const [profile, setProfile] = useState('standard')
  const [attacks, setAttacks] = useState(ATTACK_CLASSES)
  const [repoUrl, setRepoUrl] = useState('github.com/acme-corp/backend-api')
  const [branch, setBranch] = useState('main')
  const [bearerToken, setBearerToken] = useState('')
  const [launching, setLaunching] = useState(false)

  function toggleAttack(id: string) {
    setAttacks(a => a.map(x => x.id === id ? { ...x, on: !x.on } : x))
  }

  function handleLaunch() {
    setLaunching(true)
    setTimeout(() => navigate('/app/scans/scan-running'), 1000)
  }

  return (
    <div className="p-8 max-w-2xl">
      {/* Header */}
      <div className="mb-8">
        <button
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
          onClick={() => step > 0 ? setStep(s => s - 1) : navigate('/app')}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {step > 0 ? 'Back' : 'Overview'}
        </button>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">New scan</h1>
        <p className="text-sm text-muted-foreground mt-1">Spin up an isolated sandbox and pentest your service.</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-0 mb-8">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center">
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
                i < step
                  ? 'bg-primary border-primary text-primary-foreground'
                  : i === step
                  ? 'border-primary text-primary bg-primary/10'
                  : 'border-border text-muted-foreground'
              }`}>
                {i < step ? (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : i + 1}
              </div>
              <span className={`text-sm ${i === step ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`w-12 h-px mx-3 ${i < step ? 'bg-primary' : 'bg-border'}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Connect service */}
      {step === 0 && (
        <div className="space-y-6">
          {/* Source tabs */}
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-3 block">Service source</Label>
            <div className="flex gap-1 bg-muted/20 border border-border rounded-lg p-1 w-fit">
              {(['github', 'docker', 'openapi'] as SourceTab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setSourceTab(t)}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    sourceTab === t
                      ? 'bg-card text-foreground shadow-sm border border-border'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t === 'github' ? 'GitHub' : t === 'docker' ? 'Docker image' : 'OpenAPI spec'}
                </button>
              ))}
            </div>
          </div>

          {sourceTab === 'github' && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="repo">Repository URL</Label>
                <Input
                  id="repo"
                  value={repoUrl}
                  onChange={e => setRepoUrl(e.target.value)}
                  placeholder="github.com/your-org/your-repo"
                  className="bg-card border-border font-mono text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="branch">Branch</Label>
                <Input
                  id="branch"
                  value={branch}
                  onChange={e => setBranch(e.target.value)}
                  placeholder="main"
                  className="bg-card border-border font-mono text-sm w-48"
                />
              </div>
            </div>
          )}

          {sourceTab === 'docker' && (
            <div className="space-y-1.5">
              <Label htmlFor="image">Docker image</Label>
              <Input
                id="image"
                placeholder="docker.io/your-org/your-service:latest"
                className="bg-card border-border font-mono text-sm"
              />
            </div>
          )}

          {sourceTab === 'openapi' && (
            <div className="space-y-1.5">
              <Label htmlFor="spec">OpenAPI spec URL</Label>
              <Input
                id="spec"
                placeholder="https://api.yourservice.com/openapi.json"
                className="bg-card border-border font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">Black-box scan only — no sandbox spun up.</p>
            </div>
          )}

          {/* Auth */}
          <div className="space-y-1.5 pt-2 border-t border-border">
            <Label htmlFor="token" className="flex items-center gap-1.5">
              Auth token
              <span className="text-[10px] text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              id="token"
              type="password"
              value={bearerToken}
              onChange={e => setBearerToken(e.target.value)}
              placeholder="Bearer eyJhbGci..."
              className="bg-card border-border font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">Used for authenticated endpoint scanning. Stored encrypted, deleted after scan.</p>
          </div>

          {/* Env vars hint */}
          <div className="bg-card border border-border rounded-lg px-4 py-3 flex items-start gap-3">
            <svg className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Environment variables are inferred from your repo. You'll be able to review and override them before launch.
            </p>
          </div>

          <Button
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 glow-green h-10 font-medium"
            onClick={() => setStep(1)}
          >
            Continue
            <svg className="w-4 h-4 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Button>
        </div>
      )}

      {/* Step 2: Attack profile */}
      {step === 1 && (
        <div className="space-y-6">
          {/* Preset cards */}
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-3 block">Preset profile</Label>
            <div className="space-y-2">
              {PROFILES.map((p) => (
                <div
                  key={p.id}
                  onClick={() => setProfile(p.id)}
                  className={`rounded-lg border px-4 py-3.5 cursor-pointer transition-all ${
                    profile === p.id
                      ? 'border-primary/60 bg-primary/5'
                      : 'border-border hover:border-border/80 bg-card'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 ${
                        profile === p.id ? 'border-primary bg-primary' : 'border-muted-foreground'
                      }`} />
                      <span className="text-sm font-medium text-foreground">{p.label}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{p.time}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5 ml-6">{p.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Attack class toggles */}
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-3 block">Attack classes</Label>
            <div className="grid grid-cols-2 gap-2">
              {attacks.map((atk) => (
                <div
                  key={atk.id}
                  onClick={() => toggleAttack(atk.id)}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 cursor-pointer transition-all ${
                    atk.on ? 'border-border bg-card' : 'border-border/50 bg-card/50'
                  }`}
                >
                  <div>
                    <p className={`text-xs font-medium ${atk.on ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {atk.label}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{atk.owasp}</p>
                  </div>
                  <div className={`w-8 h-4.5 rounded-full flex items-center px-0.5 transition-colors flex-shrink-0 ${atk.on ? 'bg-primary/30 justify-end' : 'bg-border justify-start'}`}>
                    <div className={`w-3 h-3 rounded-full transition-colors ${atk.on ? 'bg-primary' : 'bg-muted-foreground'}`} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Button
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 glow-green h-10 font-medium"
            onClick={() => setStep(2)}
          >
            Continue
            <svg className="w-4 h-4 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Button>
        </div>
      )}

      {/* Step 3: Review & launch */}
      {step === 2 && (
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-xl divide-y divide-border">
            <div className="px-5 py-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Service</p>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Source</span>
                  <span className="text-foreground font-mono">{repoUrl}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Branch</span>
                  <span className="text-foreground font-mono">{branch}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Auth token</span>
                  <span className={bearerToken ? 'text-primary' : 'text-muted-foreground/50'}>
                    {bearerToken ? 'Provided ✓' : 'None (unauthenticated)'}
                  </span>
                </div>
              </div>
            </div>
            <div className="px-5 py-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Attack configuration</p>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Profile</span>
                  <span className="text-foreground capitalize">{profile}</span>
                </div>
                <div className="flex justify-between text-sm items-start">
                  <span className="text-muted-foreground">Attack classes</span>
                  <div className="flex flex-wrap gap-1 justify-end max-w-xs">
                    {attacks.filter(a => a.on).map(a => (
                      <Badge key={a.id} variant="outline" className="text-[10px] border-border text-muted-foreground py-0">
                        {a.label}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="px-5 py-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Sandbox</p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Network</span>
                  <span className="text-foreground">Isolated (no internet egress)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Runtime</span>
                  <span className="text-foreground">Docker + gVisor</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">TTL</span>
                  <span className="text-foreground">30 min (auto-destroyed)</span>
                </div>
              </div>
            </div>
          </div>

          <Button
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 glow-green h-11 font-semibold"
            onClick={handleLaunch}
            disabled={launching}
          >
            {launching ? (
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12a8 8 0 018-8v4l3-3-3-3V4a10 10 0 100 20v-2a8 8 0 01-8-8z" />
                </svg>
                Spinning up sandbox…
              </span>
            ) : (
              <>
                Launch scan
                <svg className="w-4 h-4 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  )
}
