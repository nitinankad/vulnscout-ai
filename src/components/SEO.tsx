import { Helmet } from 'react-helmet-async'

interface SEOProps {
  title: string
  description: string
  path?: string
  noindex?: boolean
}

const BASE_URL = 'https://vulnscout.ai'

export function SEO({ title, description, path = '', noindex = false }: SEOProps) {
  const fullTitle = title === 'VulnScout AI'
    ? 'VulnScout AI — AI-Powered API Security Testing'
    : `${title} — VulnScout AI`
  const url = `${BASE_URL}${path}`

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      {noindex && <meta name="robots" content="noindex, nofollow" />}
      <link rel="canonical" href={url} />

      {/* Open Graph — also used by Discord for rich embeds */}
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="VulnScout AI" />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />

      {/* Twitter / X */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />

      {/* Discord embed accent color */}
      <meta name="theme-color" content="#00d282" />
    </Helmet>
  )
}
