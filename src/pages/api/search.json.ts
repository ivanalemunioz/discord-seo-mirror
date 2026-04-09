import { getDiscussions } from '@/lib/content';

export async function GET() {
  const discussions = await getDiscussions();
  const payload = discussions.map((d) => ({
    title: d.data.title,
    slug: d.slug,
    channel: d.data.channelName,
    excerpt: d.data.excerpt,
    updatedAt: d.data.updatedAt
  }));

  return new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' }
  });
}
