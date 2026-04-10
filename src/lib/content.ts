import fs from 'node:fs/promises';
import path from 'node:path';

const DATA_DIR = path.resolve('src/data/channels');
const THREADS_DIR = path.resolve('src/data/threads');

type ChannelIndex = {
  id: string;
  name: string;
  slug: string;
  totalMessages: number;
  totalPages: number;
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

async function readIndex(): Promise<ChannelIndex[]> {
  try {
    return JSON.parse(await fs.readFile(path.join(DATA_DIR, 'index.json'), 'utf8')) as ChannelIndex[];
  } catch {
    return [];
  }
}

export async function getChannelNav() {
  const idx = await readIndex();
  return idx.map((c) => ({ id: c.id, name: c.name, slug: c.slug, count: c.totalMessages, totalPages: c.totalPages }));
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
  return JSON.parse(await fs.readFile(file, 'utf8')) as {
    channelId: string;
    channelName: string;
    channelSlug: string;
    pageNumber: number;
    totalPages: number;
    messages: Array<{
      id: string;
      author: string;
      timestamp: string;
      editedAt?: string | null;
      content: string;
      attachments: Array<{ url: string; filename: string }>;
      replyTo?: {
        id: string;
        author?: string;
        content?: string;
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
      timestamp: string;
      editedAt?: string | null;
      content: string;
      attachments: Array<{ url: string; filename: string }>;
    }>;
  };
}
