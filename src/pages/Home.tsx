import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const FEATURES = [
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z" />
      </svg>
    ),
    tag: 'Isolation',
    title: 'Ephemeral sandbox environments',
    description:
      'Spin up an isolated, containerized replica of your backend directly from the dashboard. Your production environment stays completely untouched.',
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
      </svg>
    ),
    tag: 'AI Agent',
    title: 'Autonomous penetration testing',
    description:
      'Configure attack profiles in the web app and let the AI agent run OWASP-driven attack chains — SQL injection, auth bypass, IDOR, and more.',
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
    tag: 'Reports',
    title: 'Actionable vulnerability reports',
    description:
      'Every finding includes a severity score, reproduction steps, affected endpoints, and fix recommendations — all surfaced in the dashboard.',
  },
]

const STATS = [
  { value: '340+', label: 'Vulnerability classes' },
  { value: '< 5 min', label: 'Time to first finding' },
  { value: '100%', label: 'Isolated from prod' },
  { value: 'OWASP', label: 'Top 10 coverage' },
]

function DashboardMockup() {
  const findings = [
    { method: 'POST', path: '/api/auth/login', vuln: 'SQL Injection', severity: 'critical' },
    { method: 'GET', path: '/api/users/{id}', vuln: 'IDOR', severity: 'high' },
    { method: 'PUT', path: '/api/posts/{id}', vuln: 'Broken Access Control', severity: 'high' },
    { method: 'GET', path: '/api/admin/stats', vuln: 'Auth Bypass', severity: 'critical' },
    { method: 'DELETE', path: '/api/comments/{id}', vuln: 'CSRF', severity: 'medium' },
  ]

  const severityColor: Record<string, string> = {
    critical: 'text-destructive bg-destructive/10 border-destructive/30',
    high: 'text-orange-400 bg-orange-400/10 border-orange-400/30',
    medium: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
  }

  const methodColor: Record<string, string> = {
    GET: 'text-primary bg-primary/10',
    POST: 'text-yellow-400 bg-yellow-400/10',
    PUT: 'text-blue-400 bg-blue-400/10',
    DELETE: 'text-destructive bg-destructive/10',
  }

  return (
    <div className="rounded-xl border border-glow bg-[oklch(0.07_0.01_200)] overflow-hidden glow-green">
      {/* Browser chrome */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-[oklch(0.1_0.012_200)]">
        <span className="w-3 h-3 rounded-full bg-destructive/70" />
        <span className="w-3 h-3 rounded-full bg-yellow-500/70" />
        <span className="w-3 h-3 rounded-full bg-primary/70" />
        <div className="ml-4 flex-1 bg-[oklch(0.13_0.01_200)] rounded-md px-3 py-1 text-xs text-muted-foreground font-mono">
          app.vulnscout.ai/scans/acme-api-v2
        </div>
      </div>

      {/* Dashboard body */}
      <div className="p-5">
        {/* Scan header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm font-medium text-foreground">acme-api · v2.3.1</p>
            <p className="text-xs text-muted-foreground mt-0.5">Scan completed · 4m 12s</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs text-destructive font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
              2 critical
            </span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-orange-400 font-medium">2 high</span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-yellow-400 font-medium">1 medium</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full h-1 bg-border rounded-full mb-5">
          <div className="h-1 bg-primary rounded-full w-full" />
        </div>

        {/* Findings table */}
        <div className="space-y-2">
          {findings.map((f, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 bg-[oklch(0.11_0.012_200)] border border-border/50 hover:border-border transition-colors"
            >
              <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${methodColor[f.method]}`}>
                {f.method}
              </span>
              <span className="text-xs text-muted-foreground font-mono flex-1 truncate">{f.path}</span>
              <span className="text-xs text-foreground/80 hidden sm:block">{f.vuln}</span>
              <span
                className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full border ${severityColor[f.severity]}`}
              >
                {f.severity}
              </span>
            </div>
          ))}
        </div>

        {/* Footer row */}
        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">5 of 47 findings shown</p>
          <button className="text-xs text-primary hover:text-primary/80 transition-colors">View full report →</button>
        </div>
      </div>
    </div>
  )
}

export function Home() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden pt-24 pb-20 px-6">
        <div className="absolute inset-0 pointer-events-none bg-grid" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] pointer-events-none bg-glow-top" />

        <div className="relative max-w-6xl mx-auto text-center">
          <Badge
            variant="outline"
            className="mb-6 border-primary/40 text-primary bg-primary/10 px-3 py-1 text-xs font-medium tracking-wide uppercase"
          >
            AI-Powered Pentesting Platform
          </Badge>

          <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-foreground mb-6 leading-[1.05]">
            Find your API's <br />
            <span className="text-primary glow-green-text">vulnerabilities</span>
            <br />
            before attackers do.
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
            VulnScout AI spins up an isolated copy of your backend service and deploys an AI agent to
            pentest it — uncovering real security flaws in minutes, not weeks. No CLI, no config files.
            Just point, click, and fix.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <Button
              size="lg"
              className="bg-primary text-primary-foreground hover:bg-primary/90 glow-green font-semibold px-8 h-12 text-base"
            >
              Start free scan
              <svg className="ml-2 w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Button>
            <Link to="/how-it-works">
              <Button size="lg" variant="outline" className="border-border hover:border-primary/60 hover:text-primary h-12 text-base px-8">
                See how it works
              </Button>
            </Link>
          </div>

          <DashboardMockup />
        </div>
      </section>

      {/* Stats bar */}
      <section className="border-y border-border bg-card/50">
        <div className="max-w-6xl mx-auto px-6 py-8 grid grid-cols-2 md:grid-cols-4 gap-8">
          {STATS.map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="text-2xl md:text-3xl font-bold text-primary glow-green-text">{stat.value}</p>
              <p className="text-sm text-muted-foreground mt-1">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <Badge
              variant="outline"
              className="mb-4 border-primary/40 text-primary bg-primary/10 text-xs uppercase tracking-wide"
            >
              Features
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight">
              Everything you need to secure your APIs
            </h2>
            <p className="mt-4 text-muted-foreground max-w-xl mx-auto">
              From environment isolation to AI-driven attacks and detailed reports — VulnScout AI covers
              the full pentest lifecycle, all from your browser.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {FEATURES.map((feature) => (
              <Card
                key={feature.title}
                className="bg-card border-border hover:border-primary/40 transition-all duration-300 hover:glow-green group"
              >
                <CardHeader className="pb-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                    {feature.icon}
                  </div>
                  <Badge variant="outline" className="w-fit mb-2 border-border text-muted-foreground text-xs">
                    {feature.tag}
                  </Badge>
                  <CardTitle className="text-foreground text-lg leading-snug">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground text-sm leading-relaxed">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6 border-t border-border">
        <div className="max-w-3xl mx-auto text-center">
          <div
            className="rounded-2xl border border-primary/30 p-12 relative overflow-hidden bg-glow-center"
          >
            <div className="absolute inset-0 pointer-events-none rounded-2xl bg-grid-sm" />
            <Badge
              variant="outline"
              className="mb-6 border-primary/40 text-primary bg-primary/10 text-xs uppercase tracking-wide"
            >
              Free tier available
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight mb-4">
              Ready to find your <span className="text-primary glow-green-text">blind spots?</span>
            </h2>
            <p className="text-muted-foreground mb-8 max-w-lg mx-auto">
              Run your first pentest in under 5 minutes — no credit card required. See exactly what
              an attacker would find against your service.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button
                size="lg"
                className="bg-primary text-primary-foreground hover:bg-primary/90 glow-green font-semibold px-10 h-12 text-base"
              >
                Start free scan
              </Button>
              <Link to="/pricing">
                <Button size="lg" variant="ghost" className="text-muted-foreground hover:text-foreground h-12">
                  View pricing →
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
