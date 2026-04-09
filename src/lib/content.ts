import { getCollection } from 'astro:content';


export async function getDiscussions() {
  const all = await getCollection('discussions');
  return all.sort((a, b) => b.data.updatedAt.getTime() - a.data.updatedAt.getTime());
}

export async function getChannelNav() {
  const discussions = await getDiscussions();
  const map = new Map<string, { id: string; name: string; count: number }>();
  for (const item of discussions) {
    const key = item.data.channelId;
    const current = map.get(key) || { id: key, name: item.data.channelName, count: 0 };
    current.count += 1;
    map.set(key, current);
  }
  const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return [...map.values()]
    .map((c) => ({ ...c, slug: slugify(c.name) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
