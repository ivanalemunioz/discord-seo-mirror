import fs from 'node:fs/promises';
import path from 'node:path';

const API = 'https://discord.com/api/v10';
const DISCUSSIONS_DIR = path.resolve('src/content/discussions');
const STATE_FILE = path.resolve('.cache/sync-state.json');
const CHANNEL_CACHE_DIR = path.resolve('.cache/channel-messages');
const PAGE_SIZE = 100;

type Channel = {
  id: string;
  name: string;
  type: number;
  permission_overwrites?: { id: string; type: number; allow: string; deny: string }[];
};

type Message = {
  id: string;
  content: string;
  timestamp: string;
  edited_timestamp: string | null;
  author?: { username?: string; global_name?: string };
  attachments?: { url: string; filename: string }[];
  type: number;
};

type ChannelState = {
  initialized?: boolean;
  lastMessageId?: string;
};

type State = {
  channels: Record<string, ChannelState>;
};

const env = {
  token: process.env.DISCORD_BOT_TOKEN,
  guildId: process.env.DISCORD_GUILD_ID,
  include: new Set((process.env.SYNC_INCLUDE_CHANNEL_IDS || '').split(',').map((x) => x.trim()).filter(Boolean)),
  exclude: new Set((process.env.SYNC_EXCLUDE_CHANNEL_IDS || '').split(',').map((x) => x.trim()).filter(Boolean)),
  // 0 = unlimited full backfill on first sync
  initialBackfillLimit: Number(process.env.SYNC_INITIAL_BACKFILL_LIMIT || 0)
};

if (!env.token || !env.guildId) {
  console.error('Missing DISCORD_BOT_TOKEN or DISCORD_GUILD_ID');
  process.exit(1);
}

const headers = { Authorization: `Bot ${env.token}` };

async function api<T>(pathname: string): Promise<T> {
  while (true) {
    const res = await fetch(`${API}${pathname}`, { headers });
    if (res.ok) return (await res.json()) as T;

    if (res.status === 429) {
      let retryAfterMs = 1000;
      try {
        const body = await res.json() as { retry_after?: number };
        retryAfterMs = Math.ceil((body.retry_after ?? 1) * 1000);
      } catch {
        // ignore parse errors
      }
      await new Promise((r) => setTimeout(r, retryAfterMs + 100));
      continue;
    }

    throw new Error(`Discord API ${pathname} failed: ${res.status} ${await res.text()}`);
  }
}

const VIEW = 1n << 10n;
const READ_HISTORY = 1n << 16n;

function hasBit(value: string, bit: bigint) {
  return (BigInt(value) & bit) === bit;
}

function compareIds(a: string, b: string) {
  const A = BigInt(a);
  const B = BigInt(b);
  if (A < B) return -1;
  if (A > B) return 1;
  return 0;
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function isPublicChannel(channel: Channel) {
  if (env.include.has(channel.id)) return true;
  if (env.exclude.has(channel.id)) return false;
  if (![0, 5, 15].includes(channel.type)) return false;

  const everyone = channel.permission_overwrites?.find((ow) => ow.id === env.guildId);
  if (!everyone) return true;
  if (hasBit(everyone.deny, VIEW) || hasBit(everyone.deny, READ_HISTORY)) return false;
  return true;
}

async function readState(): Promise<State> {
  try {
    const txt = await fs.readFile(STATE_FILE, 'utf8');
    const raw = JSON.parse(txt) as any;

    if (raw?.channels) return raw as State;

    // backward compatibility from old shape: { cursorByChannel: { [id]: lastId } }
    if (raw?.cursorByChannel) {
      const channels: Record<string, ChannelState> = {};
      for (const [id, lastMessageId] of Object.entries(raw.cursorByChannel as Record<string, string>)) {
        channels[id] = { initialized: true, lastMessageId };
      }
      return { channels };
    }

    return { channels: {} };
  } catch {
    return { channels: {} };
  }
}

async function writeState(state: State) {
  await fs.mkdir(path.dirname(STATE_FILE), { recursive: true });
  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

async function loadChannelCache(channelId: string): Promise<Message[]> {
  try {
    const p = path.join(CHANNEL_CACHE_DIR, `${channelId}.json`);
    return JSON.parse(await fs.readFile(p, 'utf8')) as Message[];
  } catch {
    return [];
  }
}

async function saveChannelCache(channelId: string, messages: Message[]) {
  await fs.mkdir(CHANNEL_CACHE_DIR, { recursive: true });
  const p = path.join(CHANNEL_CACHE_DIR, `${channelId}.json`);
  await fs.writeFile(p, JSON.stringify(messages), 'utf8');
}

function clean(text: string) {
  return text
    .replace(/<@!?\d+>/g, '@user')
    .replace(/<#\d+>/g, '#channel')
    .replace(/<a?:\w+:\d+>/g, '')
    .trim();
}

function messageToBlock(m: Message) {
  const who = m.author?.global_name || m.author?.username || 'unknown';
  const line = clean(m.content || '');
  const at = new Date(m.timestamp).toISOString();
  const atts = (m.attachments || []).map((a) => `- Attachment: [${a.filename}](${a.url})`).join('\n');
  return `### ${who} · ${at}\n\n${line || '_attachment_'}\n${atts}`.trim();
}

function pageDoc(channel: Channel, pageMessages: Message[], pageNumber: number, totalPages: number) {
  const first = pageMessages[0];
  const last = pageMessages.at(-1);
  if (!first || !last) return '';

  const body = pageMessages
    .filter((m) => m.type === 0 && (m.content?.trim() || m.attachments?.length))
    .map(messageToBlock)
    .join('\n\n');

  const title = `#${channel.name} · Page ${pageNumber}`;
  const excerpt = clean(first.content || `Messages from #${channel.name}`).slice(0, 180);

  return `---
title: ${JSON.stringify(title)}
channelId: ${JSON.stringify(channel.id)}
channelName: ${JSON.stringify(channel.name)}
threadId: ${JSON.stringify(channel.id)}
sourceUrl: ${JSON.stringify('https://discord.com')}
messageCount: ${pageMessages.length}
author: ${JSON.stringify(first.author?.global_name || first.author?.username || 'unknown')}
publishedAt: ${JSON.stringify(first.timestamp)}
updatedAt: ${JSON.stringify(last.edited_timestamp || last.timestamp)}
tags: [${JSON.stringify(channel.name)}]
excerpt: ${JSON.stringify(excerpt)}
pageNumber: ${pageNumber}
totalPages: ${totalPages}
firstMessageId: ${JSON.stringify(first.id)}
lastMessageId: ${JSON.stringify(last.id)}
---

${body || '_No content_'}
`;
}

async function fetchAllHistory(channelId: string) {
  const all: Message[] = [];
  let before: string | undefined;

  while (true) {
    const q = new URLSearchParams({ limit: '100' });
    if (before) q.set('before', before);
    const batch = await api<Message[]>(`/channels/${channelId}/messages?${q.toString()}`);
    if (!batch.length) break;

    all.push(...batch);
    before = batch[batch.length - 1]?.id;

    if (env.initialBackfillLimit > 0 && all.length >= env.initialBackfillLimit) break;
    if (batch.length < 100) break;
  }

  // API returns newest -> oldest; convert oldest -> newest
  all.sort((a, b) => compareIds(a.id, b.id));
  return all;
}

async function fetchAfter(channelId: string, after: string) {
  const out: Message[] = [];
  let nextAfter: string | undefined = after;

  while (true) {
    const q = new URLSearchParams({ limit: '100' });
    if (nextAfter) q.set('after', nextAfter);
    const batch = await api<Message[]>(`/channels/${channelId}/messages?${q.toString()}`);
    if (!batch.length) break;

    const sorted = [...batch].sort((a, b) => compareIds(a.id, b.id));
    out.push(...sorted);
    nextAfter = sorted.at(-1)?.id;

    if (batch.length < 100) break;
  }

  return out;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function clearChannelPages(channelId: string) {
  await fs.mkdir(DISCUSSIONS_DIR, { recursive: true });
  const files = await fs.readdir(DISCUSSIONS_DIR);
  const targets = files.filter((f) => f.startsWith(`${channelId}-p`) && f.endsWith('.md'));
  await Promise.all(targets.map((f) => fs.unlink(path.join(DISCUSSIONS_DIR, f))));
}

async function writeChannelPages(channel: Channel, messages: Message[]) {
  const filtered = messages.filter((m) => m.type === 0 || (m.attachments && m.attachments.length > 0));
  const pages = chunk(filtered, PAGE_SIZE);
  await clearChannelPages(channel.id);

  for (let i = 0; i < pages.length; i++) {
    const pageNumber = i + 1;
    const fileName = `${channel.id}-p${String(pageNumber).padStart(5, '0')}-${slugify(channel.name)}.md`;
    const doc = pageDoc(channel, pages[i], pageNumber, pages.length);
    if (!doc) continue;
    await fs.writeFile(path.join(DISCUSSIONS_DIR, fileName), doc, 'utf8');
  }

  return pages.length;
}

async function main() {
  const state = await readState();
  await fs.mkdir(DISCUSSIONS_DIR, { recursive: true });

  const channels = await api<Channel[]>(`/guilds/${env.guildId}/channels`);
  const included = channels.filter(isPublicChannel);

  console.log(`Channels detected: ${channels.length}, included as public: ${included.length}`);

  for (const channel of included) {
    try {
      const channelState = state.channels[channel.id] || {};
      let existing = await loadChannelCache(channel.id);
      let combined: Message[];

      if (!channelState.initialized || !existing.length) {
        const full = await fetchAllHistory(channel.id);
        combined = full;
        console.log(`Backfilled #${channel.name}: ${full.length} messages`);
      } else if (channelState.lastMessageId) {
        const newer = await fetchAfter(channel.id, channelState.lastMessageId);
        const map = new Map(existing.map((m) => [m.id, m]));
        for (const m of newer) map.set(m.id, m);
        combined = [...map.values()].sort((a, b) => compareIds(a.id, b.id));
        console.log(`Incremental #${channel.name}: +${newer.length} messages`);
      } else {
        combined = existing;
      }

      if (!combined.length) continue;

      const lastMessageId = combined.at(-1)?.id;
      if (!lastMessageId) continue;

      await saveChannelCache(channel.id, combined);
      const pages = await writeChannelPages(channel, combined);

      state.channels[channel.id] = {
        initialized: true,
        lastMessageId
      };

      console.log(`Built #${channel.name}: ${pages} pages of ${PAGE_SIZE}`);
    } catch (err) {
      console.error(`Failed channel ${channel.name} (${channel.id})`, err);
    }
  }

  await writeState(state);
  console.log('Sync complete');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
