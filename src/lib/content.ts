import fs from 'node:fs/promises';
import path from 'node:path';

const DATA_DIR = path.resolve('src/data/channels');
const THREADS_DIR = path.resolve('src/data/threads');
const META_FILE = path.resolve('src/data/meta.json');

type ChannelIndex = {
  id: string;
  name: string;
  slug: string;
  totalMessages: number;
  totalPages: number;
  channelType?: number;
};

type DiscussionLike = {
  id: string;
  slug: string;
  data: {
    title: string;
    channelId: string;
    channelName: string;
    messageCount: number;
    excerpt: string;
    updatedAt: Date;
    pageNumber: number;
    totalPages: number;
  };
};

type Meta = {
  guild?: { id: string; name: string; iconUrl?: string };
  nav?: {
    categories: Array<{ id: string; name: string; channels: Array<{ id: string; name: string; position: number }> }>;
    uncategorized: Array<{ id: string; name: string; position: number }>;
  };
};

async function readIndex(): Promise<ChannelIndex[]> {
  try {
    return JSON.parse(await fs.readFile(path.join(DATA_DIR, 'index.json'), 'utf8')) as ChannelIndex[];
  } catch {
    return [];
  }
}

async function readMeta(): Promise<Meta> {
  try {
    return JSON.parse(await fs.readFile(META_FILE, 'utf8')) as Meta;
  } catch {
    return {};
  }
}

export async function getSiteMeta() {
  const meta = await readMeta();
  return {
    serverName: meta.guild?.name || 'Discord SEO Mirror',
    serverIconUrl: meta.guild?.iconUrl
  };
}

export async function getChannelNav() {
  const idx = await readIndex();
  const meta = await readMeta();
  const byId = new Map(idx.map((c) => [c.id, c]));

  const ordered: Array<any> = [];

  for (const cat of meta.nav?.categories || []) {
    for (const ch of cat.channels || []) {
      const found = byId.get(ch.id);
      if (!found) continue;
      ordered.push({
        id: found.id,
        name: found.name,
        slug: found.slug,
        count: found.totalMessages,
        totalPages: found.totalPages,
        category: cat.name,
        channelType: found.channelType
      });
    }
  }

  for (const ch of meta.nav?.uncategorized || []) {
    const found = byId.get(ch.id);
    if (!found) continue;
    ordered.push({
      id: found.id,
      name: found.name,
      slug: found.slug,
      count: found.totalMessages,
      totalPages: found.totalPages,
      category: null,
      channelType: found.channelType
    });
  }

  if (ordered.length) return ordered;
  return idx.map((c) => ({ id: c.id, name: c.name, slug: c.slug, count: c.totalMessages, totalPages: c.totalPages, category: null, channelType: c.channelType }));
}

export async function getDiscussions(): Promise<DiscussionLike[]> {
  const idx = await readIndex();
  const out: DiscussionLike[] = [];

  for (const ch of idx) {
    for (let p = 1; p <= ch.totalPages; p++) {
      const file = path.join(DATA_DIR, ch.id, `page-${String(p).padStart(5, '0')}.json`);
      try {
        const page = JSON.parse(await fs.readFile(file, 'utf8')) as { messages: Array<{ timestamp: string; content: string }> };
        const last = page.messages.at(-1);
        out.push({
          id: `${ch.id}-p${p}`,
          slug: `${ch.slug}-p${p}`,
          data: {
            title: `#${ch.name} · Page ${p}`,
            channelId: ch.id,
            channelName: ch.name,
            messageCount: page.messages.length,
            excerpt: (page.messages[0]?.content || '').slice(0, 180),
            updatedAt: new Date(last?.timestamp || new Date().toISOString()),
            pageNumber: p,
            totalPages: ch.totalPages
          }
        });
      } catch {
        // ignore missing page
      }
    }
  }

  return out.sort((a, b) => b.data.updatedAt.getTime() - a.data.updatedAt.getTime());
}

export async function getChannelPage(channelId: string, pageNumber: number) {
  const file = path.join(DATA_DIR, channelId, `page-${String(pageNumber).padStart(5, '0')}.json`);
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as {
      channelId: string;
      channelName: string;
      channelSlug: string;
      pageNumber: number;
      totalPages: number;
      messages: Array<{
        id: string;
        author: string;
        authorAvatarUrl?: string;
        timestamp: string;
        editedAt?: string | null;
        content: string;
        attachments: Array<{ url: string; filename: string }>;
        embeds?: Array<{
          title?: string;
          description?: string;
          url?: string;
          fields?: Array<{ name?: string; value?: string }>;
        }>;
        replyTo?: {
          id: string;
          author?: string;
          avatarUrl?: string;
          content?: string;
          href?: string;
        };
        thread?: {
          id: string;
          name: string;
          messageCount: number;
          lastMessageAt?: string;
          preview?: string;
        };
      }>;
    };
  } catch {
    return null;
  }
}

export async function getMessagePageMap(channelId: string) {
  const map = new Map<string, number>();
  const dir = path.join(DATA_DIR, channelId);
  let files: string[] = [];
  try {
    files = (await fs.readdir(dir)).filter((f) => f.endsWith('.json')).sort();
  } catch {
    return map;
  }

  for (const f of files) {
    const m = f.match(/page-(\d+)\.json$/);
    if (!m) continue;
    const page = Number(m[1]);
    try {
      const payload = JSON.parse(await fs.readFile(path.join(dir, f), 'utf8')) as { messages: Array<{ id: string }> };
      for (const msg of payload.messages || []) map.set(msg.id, page);
    } catch {
      // ignore
    }
  }

  return map;
}

export async function getThreadById(threadId: string) {
  const file = path.join(THREADS_DIR, `${threadId}.json`);
  return JSON.parse(await fs.readFile(file, 'utf8')) as {
    id: string;
    name: string;
    parentChannelId: string;
    messages: Array<{
      id: string;
      author: string;
      authorAvatarUrl?: string;
      timestamp: string;
      editedAt?: string | null;
      content: string;
      attachments: Array<{ url: string; filename: string }>;
      embeds?: Array<{
        title?: string;
        description?: string;
        url?: string;
        fields?: Array<{ name?: string; value?: string }>;
      }>;
      replyTo?: {
        id: string;
        author?: string;
        avatarUrl?: string;
        content?: string;
        href?: string;
      };
    }>;
  };
}
