import fs from 'node:fs/promises';
import path from 'node:path';


const API = 'https://discord.com/api/v10';
const DISCUSSIONS_DIR = path.resolve('src/content/discussions');
const CACHE_FILE = path.resolve('.cache/sync-state.json');

type Channel = {
  id: string;
  name: string;
  type: number;
  parent_id?: string | null;
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

type State = { cursorByChannel: Record<string, string> };

const env = {
  token: process.env.DISCORD_BOT_TOKEN,
  guildId: process.env.DISCORD_GUILD_ID,
  baseUrl: process.env.PUBLIC_BASE_URL || '',
  include: new Set((process.env.SYNC_INCLUDE_CHANNEL_IDS || '').split(',').map((x) => x.trim()).filter(Boolean)),
  exclude: new Set((process.env.SYNC_EXCLUDE_CHANNEL_IDS || '').split(',').map((x) => x.trim()).filter(Boolean)),
  maxPerChannel: Number(process.env.SYNC_MAX_MESSAGES_PER_CHANNEL || 500)
};

if (!env.token || !env.guildId) {
  console.error('Missing DISCORD_BOT_TOKEN or DISCORD_GUILD_ID');
  process.exit(1);
}

const headers = { Authorization: `Bot ${env.token}` };

async function api<T>(pathname: string): Promise<T> {
  const res = await fetch(`${API}${pathname}`, { headers });
  if (!res.ok) throw new Error(`Discord API ${pathname} failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

function hasBit(value: string, bit: bigint) {
  return (BigInt(value) & bit) === bit;
}

const VIEW = 1n << 10n;
const READ_HISTORY = 1n << 16n;

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
    const txt = await fs.readFile(CACHE_FILE, 'utf8');
    return JSON.parse(txt) as State;
  } catch {
    return { cursorByChannel: {} };
  }
}

async function writeState(state: State) {
  await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
  await fs.writeFile(CACHE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

function clean(text: string) {
  return text
    .replace(/<@!?\d+>/g, '@user')
    .replace(/<#\d+>/g, '#channel')
    .replace(/<a?:\w+:\d+>/g, '')
    .trim();
}

function toDoc(channel: Channel, messages: Message[]) {
  const sorted = [...messages].sort((a, b) => Number(a.id) - Number(b.id));
  const first = sorted[0];
  const last = sorted.at(-1);
  const bodyLines = sorted
    .filter((m) => m.type === 0 && (m.content?.trim() || m.attachments?.length))
    .map((m) => {
      const who = m.author?.global_name || m.author?.username || 'unknown';
      const line = clean(m.content || '');
      const at = new Date(m.timestamp).toISOString();
      const atts = (m.attachments || []).map((a) => `- Attachment: [${a.filename}](${a.url})`).join('\n');
      return `### ${who} · ${at}\n\n${line || '_attachment_'}\n${atts}`.trim();
    })
    .join('\n\n');

  if (!first || !last) return '';
  const title = `${channel.name} - ${new Date(first.timestamp).toISOString().slice(0, 10)}`;
  const slug = `${channel.name}-${first.id}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const excerpt = clean(first.content || `Discussion from #${channel.name}`).slice(0, 180);
  const sourceUrl = env.baseUrl ? `${env.baseUrl}/community/${slug}` : undefined;

  return `---
title: ${JSON.stringify(title)}
slug: ${JSON.stringify(slug)}
channelId: ${JSON.stringify(channel.id)}
channelName: ${JSON.stringify(channel.name)}
threadId: ${JSON.stringify(channel.id)}
sourceUrl: ${JSON.stringify(sourceUrl || 'https://discord.com')}
messageCount: ${sorted.length}
author: ${JSON.stringify(first.author?.global_name || first.author?.username || 'unknown')}
publishedAt: ${JSON.stringify(first.timestamp)}
updatedAt: ${JSON.stringify((last.edited_timestamp || last.timestamp))}
tags: [${JSON.stringify(channel.name)}]
excerpt: ${JSON.stringify(excerpt)}
---

${bodyLines || '_No content_'}
`;
}

async function fetchMessages(channelId: string, after?: string) {
  const out: Message[] = [];
  let nextAfter = after;
  while (out.length < env.maxPerChannel) {
    const q = new URLSearchParams({ limit: '100' });
    if (nextAfter) q.set('after', nextAfter);
    const batch = await api<Message[]>(`/channels/${channelId}/messages?${q.toString()}`);
    if (!batch.length) break;
    const sorted = batch.sort((a, b) => Number(a.id) - Number(b.id));
    out.push(...sorted);
    nextAfter = sorted.at(-1)?.id;
    if (batch.length < 100) break;
  }
  return out;
}

async function main() {
  const state = await readState();
  await fs.mkdir(DISCUSSIONS_DIR, { recursive: true });

  const channels = await api<Channel[]>(`/guilds/${env.guildId}/channels`);
  const included = channels.filter(isPublicChannel);

  console.log(`Channels detected: ${channels.length}, included as public: ${included.length}`);

  for (const channel of included) {
    try {
      const after = state.cursorByChannel[channel.id];
      const messages = await fetchMessages(channel.id, after);
      if (!messages.length) continue;

      const doc = toDoc(channel, messages);
      if (!doc) continue;
      const firstId = messages[0].id;
      const file = path.join(DISCUSSIONS_DIR, `${channel.id}-${firstId}.md`);
      await fs.writeFile(file, doc, 'utf8');
      state.cursorByChannel[channel.id] = messages.at(-1)!.id;
      console.log(`Synced #${channel.name}: ${messages.length} messages`);
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
