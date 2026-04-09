export function GET() {
  return new Response(`User-agent: *\nAllow: /\nSitemap: ${new URL('/sitemap-index.xml', import.meta.env.SITE).toString()}\n`, {
    headers: { 'Content-Type': 'text/plain' }
  });
}
