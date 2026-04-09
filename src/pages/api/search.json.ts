import { getCollection } from 'astro:content';

export async function GET() {
  const discussions = await getCollection('discussions');
  const payload = discussions.map((d) => ({
    title: d.data.title,
    slug: d.data.slug,
    channel: d.data.channelName,
    excerpt: d.data.excerpt,
    updatedAt: d.data.updatedAt
  }));

  return new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' }
  });
}
