import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

const STEPS = [
  {
    number: '01',
    title: 'Connect your service',
    description:
      'Link your GitHub repo, paste a Docker image, or drop in an OpenAPI spec. VulnScout AI pulls it into an isolated environment — no access to your production infrastructure required.',
    details: ['GitHub / GitLab integration', 'Docker image support', 'OpenAPI / Swagger import', 'Environment variable management'],
    visual: (
      <div className="rounded-xl border border-border bg-[oklch(0.07_0.01_200)] p-5 font-mono text-xs space-y-3">
        <p className="text-muted-foreground text-[11px] uppercase tracking-wider mb-4">New scan · Connect service</p>
        <div className="space-y-2">
          {[
            { label: 'Source', value: 'GitHub repo', active: true },
            { label: 'Repository', value: 'acme-corp/backend-api', active: true },
            { label: 'Branch', value: 'main', active: true },
            { label: 'Environment', value: 'Staging vars · 12 keys', active: false },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between bg-[oklch(0.11_0.012_200)] rounded-md px-3 py-2">
              <span className="text-muted-foreground">{row.label}</span>
              <span className={row.active ? 'text-primary' : 'text-foreground/70'}>{row.value}</span>
            </div>
          ))}
        </div>
        <button className="w-full mt-2 bg-primary/10 border border-primary/30 text-primary rounded-md py-2 text-xs hover:bg-primary/20 transition-colors">
          Spin up sandbox →
        </button>
      </div>
    ),
  },
  {
    number: '02',
    title: 'Configure the attack profile',
    description:
      'Choose the attack depth and focus areas from the dashboard. Select from prebuilt OWASP profiles or build a custom ruleset targeting the specific vulnerability classes you care about.',
    details: ['OWASP Top 10 profiles', 'Custom attack rulesets', 'Authenticated & unauthenticated scans', 'Rate limit & concurrency controls'],
    visual: (
      <div className="rounded-xl border border-border bg-[oklch(0.07_0.01_200)] p-5 text-xs space-y-3">
        <p className="text-muted-foreground text-[11px] uppercase tracking-wider mb-4">Attack profile · Aggressive</p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'SQL Injection', on: true },
            { label: 'Auth Bypass', on: true },
            { label: 'IDOR', on: true },
            { label: 'XSS', on: true },
            { label: 'CSRF', on: true },
            { label: 'Rate Limiting', on: false },
            { label: 'SSRF', on: true },
            { label: 'Path Traversal', on: true },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between bg-[oklch(0.11_0.012_200)] rounded-md px-3 py-2">
              <span className="text-foreground/70">{item.label}</span>
              <span className={`w-7 h-4 rounded-full flex items-center px-0.5 transition-colors ${item.on ? 'bg-primary/30 justify-end' : 'bg-border justify-start'}`}>
                <span className={`w-3 h-3 rounded-full ${item.on ? 'bg-primary' : 'bg-muted-foreground'}`} />
              </span>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    number: '03',
    title: 'AI agent runs the pentest',
    description:
      'The agent explores your API surface, maps endpoints, infers authentication flows, and fires attack payloads — adapting its strategy in real time based on each response it gets.',
    details: ['Automatic endpoint discovery', 'Auth flow inference', 'Adaptive attack chaining', 'Real-time progress dashboard'],
    visual: (
      <div className="rounded-xl border border-border bg-[oklch(0.07_0.01_200)] p-5 font-mono text-xs space-y-2">
        <p className="text-muted-foreground text-[11px] uppercase tracking-wider mb-4">Live scan · acme-api</p>
        <div className="space-y-1.5">
          {[
            { status: 'done', text: 'Mapped 84 endpoints' },
            { status: 'done', text: 'Inferred JWT auth flow' },
            { status: 'done', text: 'SQL injection · 1 critical found' },
            { status: 'active', text: 'Testing IDOR vectors...' },
            { status: 'pending', text: 'Broken access control' },
            { status: 'pending', text: 'Generating report' },
          ].map((row, i) => (
            <div key={i} className="flex items-center gap-2.5">
              {row.status === 'done' && <span className="text-primary">✓</span>}
              {row.status === 'active' && <span className="text-yellow-400 animate-pulse">◆</span>}
              {row.status === 'pending' && <span className="text-muted-foreground">○</span>}
              <span className={row.status === 'pending' ? 'text-muted-foreground' : row.status === 'active' ? 'text-yellow-400' : 'text-foreground/80'}>
                {row.text}
              </span>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    number: '04',
    title: 'Review findings & fix',
    description:
      'Get a prioritized report in your dashboard the moment the scan finishes. Every vulnerability includes a severity score, reproduction steps, affected endpoint, and a suggested code-level fix.',
    details: ['CVSS severity scoring', 'Step-by-step reproduction', 'Code-level fix suggestions', 'Export to PDF / Jira / Linear'],
    visual: (
      <div className="rounded-xl border border-border bg-[oklch(0.07_0.01_200)] p-5 text-xs space-y-2.5">
        <p className="text-muted-foreground text-[11px] uppercase tracking-wider mb-4">Report · 47 findings</p>
        {[
          { sev: 'CRITICAL', path: 'POST /api/auth/login', vuln: 'SQL Injection', color: 'text-destructive border-destructive/30 bg-destructive/10' },
          { sev: 'CRITICAL', path: 'GET /api/admin/stats', vuln: 'Auth Bypass', color: 'text-destructive border-destructive/30 bg-destructive/10' },
          { sev: 'HIGH', path: 'GET /api/users/{id}', vuln: 'IDOR', color: 'text-orange-400 border-orange-400/30 bg-orange-400/10' },
          { sev: 'HIGH', path: 'PUT /api/posts/{id}', vuln: 'Broken Access Control', color: 'text-orange-400 border-orange-400/30 bg-orange-400/10' },
        ].map((f, i) => (
          <div key={i} className="flex items-center gap-2.5 bg-[oklch(0.11_0.012_200)] rounded-md px-3 py-2">
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${f.color}`}>{f.sev}</span>
            <span className="text-muted-foreground font-mono flex-1 truncate">{f.path}</span>
            <span className="text-foreground/70 hidden sm:block">{f.vuln}</span>
          </div>
        ))}
        <div className="pt-1 flex gap-2">
          <button className="flex-1 bg-primary/10 border border-primary/30 text-primary rounded py-1.5 hover:bg-primary/20 transition-colors">
            Export PDF
          </button>
          <button className="flex-1 bg-[oklch(0.11_0.012_200)] border border-border text-muted-foreground rounded py-1.5 hover:border-border/80 transition-colors">
            Open in Jira
          </button>
        </div>
      </div>
    ),
  },
]

const FAQS = [
  {
    q: 'Does VulnScout AI ever touch my production environment?',
    a: 'Never. VulnScout AI clones your service into a fully air-gapped sandbox environment. No traffic, credentials, or attack payloads ever reach your production infrastructure.',
  },
  {
    q: 'How does the sandbox get my environment variables?',
    a: 'You provide env vars through the dashboard — either manually, or by connecting a secrets manager (AWS Secrets Manager, Doppler, etc.). They are encrypted at rest and used only within the sandbox lifetime.',
  },
  {
    q: 'What kinds of vulnerabilities does the AI agent find?',
    a: 'The agent covers the OWASP API Security Top 10 including SQL injection, broken authentication, IDOR, broken access control, security misconfiguration, injection attacks, SSRF, and more. Custom attack profiles let you target specific areas.',
  },
  {
    q: 'How long does a typical scan take?',
    a: 'Most scans complete within 5–15 minutes depending on the number of endpoints and attack profile selected. You can monitor live progress in the dashboard.',
  },
  {
    q: 'Can I scan authenticated APIs?',
    a: 'Yes. You can provide API keys, JWT tokens, or OAuth credentials through the dashboard. The agent infers authentication flows automatically where possible.',
  },
]

export function HowItWorks() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden pt-20 pb-16 px-6 border-b border-border">
        <div className="absolute inset-0 pointer-events-none bg-grid" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] pointer-events-none bg-glow-top" />
        <div className="relative max-w-3xl mx-auto text-center">
          <Badge
            variant="outline"
            className="mb-5 border-primary/40 text-primary bg-primary/10 px-3 py-1 text-xs font-medium tracking-wide uppercase"
          >
            How It Works
          </Badge>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground mb-5">
            From service to security report <span className="text-primary glow-green-text">in minutes</span>
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            VulnScout AI is entirely web-based. No agents to install, no CLI to run, no config files to
            write. Connect your service, pick an attack profile, and let the AI do the rest.
          </p>
        </div>
      </section>

      {/* Steps */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto space-y-28">
          {STEPS.map((step, i) => (
            <div
              key={step.number}
              className={`flex flex-col ${i % 2 === 0 ? 'lg:flex-row' : 'lg:flex-row-reverse'} items-center gap-12 lg:gap-20`}
            >
              {/* Text side */}
              <div className="flex-1 max-w-lg">
                <div className="flex items-center gap-4 mb-5">
                  <span className="w-10 h-10 rounded-full border-2 border-primary flex items-center justify-center text-primary font-bold font-mono text-sm glow-green flex-shrink-0">
                    {step.number}
                  </span>
                  <div className="h-px flex-1 bg-border" />
                </div>
                <h2 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight mb-4">
                  {step.title}
                </h2>
                <p className="text-muted-foreground leading-relaxed mb-6">{step.description}</p>
                <ul className="space-y-2">
                  {step.details.map((d) => (
                    <li key={d} className="flex items-center gap-2.5 text-sm text-muted-foreground">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                      {d}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Visual side */}
              <div className="flex-1 w-full max-w-lg">{step.visual}</div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 px-6 border-t border-border">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <Badge
              variant="outline"
              className="mb-4 border-primary/40 text-primary bg-primary/10 text-xs uppercase tracking-wide"
            >
              FAQ
            </Badge>
            <h2 className="text-3xl font-bold text-foreground tracking-tight">Common questions</h2>
          </div>
          <div className="space-y-4">
            {FAQS.map((faq) => (
              <Card key={faq.q} className="bg-card border-border hover:border-primary/30 transition-colors">
                <CardContent className="pt-5 pb-5">
                  <p className="font-medium text-foreground mb-2">{faq.q}</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">{faq.a}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 border-t border-border">
        <div className="max-w-xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-foreground tracking-tight mb-4">
            Ready to run your first scan?
          </h2>
          <p className="text-muted-foreground mb-8">
            It takes under 5 minutes to connect your service and get your first vulnerability report.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              size="lg"
              className="bg-primary text-primary-foreground hover:bg-primary/90 glow-green font-semibold px-8 h-12"
            >
              Start free scan
            </Button>
            <Link to="/pricing">
              <Button size="lg" variant="outline" className="border-border hover:border-primary/60 hover:text-primary h-12">
                View pricing →
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
