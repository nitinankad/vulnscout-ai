import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const PLANS = [
  {
    name: 'Starter',
    price: 'Free',
    period: '',
    description: 'For individual developers who want to find the obvious vulnerabilities.',
    cta: 'Get started free',
    ctaVariant: 'outline' as const,
    featured: false,
    limits: '5 scans / month · up to 50 endpoints',
    features: [
      'OWASP Top 10 scan profiles',
      'Up to 50 API endpoints per scan',
      '5 scans per month',
      'Web dashboard',
      'HTML report export',
      'Community support',
    ],
  },
  {
    name: 'Pro',
    price: '$79',
    period: '/ month',
    description: 'For security-conscious teams shipping production APIs.',
    cta: 'Start 14-day trial',
    ctaVariant: 'default' as const,
    featured: true,
    limits: 'Unlimited scans · up to 500 endpoints',
    features: [
      'Everything in Starter',
      'Unlimited scans',
      'Up to 500 endpoints per scan',
      'Custom attack rulesets',
      'Authenticated scan support',
      'PDF + Jira / Linear export',
      'Scheduled recurring scans',
      'Email & Slack notifications',
      'Priority support',
    ],
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    description: 'For teams with compliance requirements or large-scale API estates.',
    cta: 'Talk to us',
    ctaVariant: 'outline' as const,
    featured: false,
    limits: 'Unlimited · custom SLA',
    features: [
      'Everything in Pro',
      'Unlimited endpoints',
      'SSO / SAML',
      'SOC 2 & compliance reports',
      'Private cloud deployment',
      'Custom integrations & API access',
      'Dedicated security engineer',
      'SLA & enterprise support',
    ],
  },
]

const COMPARISON = [
  { feature: 'Scans per month', starter: '5', pro: 'Unlimited', enterprise: 'Unlimited' },
  { feature: 'Endpoints per scan', starter: '50', pro: '500', enterprise: 'Unlimited' },
  { feature: 'OWASP Top 10 coverage', starter: true, pro: true, enterprise: true },
  { feature: 'Custom attack rulesets', starter: false, pro: true, enterprise: true },
  { feature: 'Authenticated scans', starter: false, pro: true, enterprise: true },
  { feature: 'Scheduled scans', starter: false, pro: true, enterprise: true },
  { feature: 'PDF / Jira / Linear export', starter: false, pro: true, enterprise: true },
  { feature: 'SSO / SAML', starter: false, pro: false, enterprise: true },
  { feature: 'Private cloud deployment', starter: false, pro: false, enterprise: true },
  { feature: 'Dedicated engineer', starter: false, pro: false, enterprise: true },
]

function Check({ on }: { on: boolean | string }) {
  if (typeof on === 'string') return <span className="text-sm text-foreground/80">{on}</span>
  return on ? (
    <svg className="w-5 h-5 text-primary mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
  ) : (
    <svg className="w-5 h-5 text-muted-foreground/30 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
    </svg>
  )
}

export function Pricing() {
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
            Pricing
          </Badge>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground mb-5">
            Simple, transparent <span className="text-primary glow-green-text">pricing</span>
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Start free. Scale when you need to. No hidden fees, no per-vulnerability charges.
          </p>
        </div>
      </section>

      {/* Plans */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-3 gap-6 items-stretch">
            {PLANS.map((plan) => (
              <Card
                key={plan.name}
                className={`flex flex-col relative transition-all duration-300 ${
                  plan.featured
                    ? 'border-primary/60 bg-card glow-green scale-[1.02]'
                    : 'border-border bg-card hover:border-primary/30'
                }`}
              >
                {plan.featured && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground text-xs px-3 py-1 font-semibold">
                      Most popular
                    </Badge>
                  </div>
                )}

                <CardHeader className="pb-4 pt-7">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">{plan.name}</p>
                  <div className="flex items-end gap-1 mb-3">
                    <CardTitle className="text-4xl font-bold text-foreground">{plan.price}</CardTitle>
                    {plan.period && <span className="text-muted-foreground mb-1.5">{plan.period}</span>}
                  </div>
                  <p className="text-sm text-muted-foreground leading-snug">{plan.description}</p>
                  <p className="text-xs text-primary/80 mt-2 font-mono">{plan.limits}</p>
                </CardHeader>

                <CardContent className="flex flex-col flex-1 pt-0">
                  <Button
                    variant={plan.ctaVariant}
                    className={`w-full mb-6 h-10 font-medium ${
                      plan.featured
                        ? 'bg-primary text-primary-foreground hover:bg-primary/90 glow-green'
                        : ''
                    }`}
                  >
                    {plan.cta}
                  </Button>

                  <div className="flex-1 space-y-3">
                    {plan.features.map((f) => (
                      <div key={f} className="flex items-start gap-2.5">
                        <svg
                          className="w-4 h-4 text-primary flex-shrink-0 mt-0.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-sm text-muted-foreground">{f}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison table */}
      <section className="py-16 px-6 border-t border-border">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold text-foreground tracking-tight">Full comparison</h2>
          </div>

          <div className="rounded-xl border border-border overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-4 bg-card border-b border-border">
              <div className="p-4" />
              {PLANS.map((p) => (
                <div
                  key={p.name}
                  className={`p-4 text-center border-l border-border ${p.featured ? 'bg-primary/5' : ''}`}
                >
                  <p className={`text-sm font-semibold ${p.featured ? 'text-primary' : 'text-foreground'}`}>
                    {p.name}
                  </p>
                </div>
              ))}
            </div>

            {/* Rows */}
            {COMPARISON.map((row, i) => (
              <div
                key={row.feature}
                className={`grid grid-cols-4 border-b border-border last:border-0 ${
                  i % 2 === 0 ? 'bg-background' : 'bg-card/50'
                }`}
              >
                <div className="p-4 text-sm text-muted-foreground">{row.feature}</div>
                <div className={`p-4 text-center border-l border-border ${PLANS[0].featured ? 'bg-primary/5' : ''}`}>
                  <Check on={row.starter} />
                </div>
                <div className="p-4 text-center border-l border-border bg-primary/5">
                  <Check on={row.pro} />
                </div>
                <div className={`p-4 text-center border-l border-border ${PLANS[2].featured ? 'bg-primary/5' : ''}`}>
                  <Check on={row.enterprise} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 border-t border-border">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-foreground tracking-tight mb-4">
            Not sure which plan is right?
          </h2>
          <p className="text-muted-foreground mb-8">
            Start with the free plan and upgrade anytime. Or talk to us — we'll help you figure out
            the best fit for your team.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              size="lg"
              className="bg-primary text-primary-foreground hover:bg-primary/90 glow-green font-semibold px-8 h-12"
            >
              Start free scan
            </Button>
            <Link to="/how-it-works">
              <Button size="lg" variant="outline" className="border-border hover:border-primary/60 hover:text-primary h-12">
                See how it works →
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
