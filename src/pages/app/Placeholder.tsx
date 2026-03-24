export function Services() {
  return <ComingSoon title="Services" description="Connect and manage your backend services." />
}

export function Reports() {
  return <ComingSoon title="Reports" description="View and export scan reports across all services." />
}

export function Settings() {
  return <ComingSoon title="Settings" description="Manage your account, team, and billing." />
}

function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <div className="p-8 flex flex-col items-center justify-center min-h-[60vh] text-center">
      <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
        <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      </div>
      <h1 className="text-xl font-bold text-foreground tracking-tight mb-2">{title}</h1>
      <p className="text-sm text-muted-foreground max-w-xs">{description}</p>
      <p className="text-xs text-muted-foreground/50 mt-4">Coming soon</p>
    </div>
  )
}
