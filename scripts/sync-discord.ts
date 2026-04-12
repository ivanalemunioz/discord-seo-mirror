import fs from 'node:fs/promises';
import path from 'node:path';

const API = 'https://discord.com/api/v10';
const DATA_DIR = path.resolve('src/data/channels');
const THREADS_DIR = path.resolve('src/data/threads');
const META_FILE = path.resolve('src/data/meta.json');
const STATE_FILE = path.resolve('.cache/sync-state.json');
const PAGE_SIZE = 100;

type Channel = {
  id: string;
  name: string;
  type: number;
  position?: number;
  parent_id?: string | null;
  permission_overwrites?: { id: string; type: number; allow: string; deny: string }[];
};

type Guild = {
  id: string;
  name: string;
  icon?: string | null;
  rules_channel_id?: string | null;
  public_updates_channel_id?: string | null;
  approximate_member_count?: number;
};

type ForumThread = {
  id: string;
  name: string;
};

type DiscordMessage = {
  id: string;
  content: string;
  timestamp: string;
  edited_timestamp: string | null;
  author?: { id?: string; username?: string; global_name?: string; avatar?: string; discriminator?: string };
  attachments?: { url: string; filename: string }[];
  type: number;
  message_reference?: { message_id?: string };
  referenced_message?: {
    id?: string;
    content?: string;
    author?: { id?: string; username?: string; global_name?: string; avatar?: string; discriminator?: string };
  } | null;
  thread?: {
    id: string;
    name?: string;
    message_count?: number;
    total_message_sent?: number;
  };
  embeds?: Array<{
    title?: string;
    description?: string;
    url?: string;
    fields?: Array<{ name?: string; value?: string }>;
  }>;
};

type StoredEmbed = {
  title?: string;
  description?: string;
  url?: string;
  fields?: Array<{ name?: string; value?: string }>;
};

type StoredMessage = {
  id: string;
  author: string;
  authorAvatarUrl?: string;
  timestamp: string;
  editedAt?: string | null;
  content: string;
  attachments: { url: string; filename: string }[];
  embeds?: StoredEmbed[];
  replyTo?: {
    id: string;
    author?: string;
    avatarUrl?: string;
    content?: string;
  };
  thread?: {
    id: string;
    name: string;
    messageCount: number;
    lastMessageAt?: string;
    preview?: string;
  };
};

type ThreadSummary = {
  id: string;
  name: string;
  messageCount: number;
  lastMessageAt?: string;
  preview?: string;
};

type ChannelState = { initialized?: boolean; lastMessageId?: string };
type State = { channels: Record<string, ChannelState> };

const env = {
  token: process.env.DISCORD_BOT_TOKEN,
  guildId: process.env.DISCORD_GUILD_ID,
  include: new Set((process.env.SYNC_INCLUDE_CHANNEL_IDS || '').split(',').map((x) => x.trim()).filter(Boolean)),
  exclude: new Set((process.env.SYNC_EXCLUDE_CHANNEL_IDS || '').split(',').map((x) => x.trim()).filter(Boolean))
};

if (!env.token || !env.guildId) {
  console.error('Missing DISCORD_BOT_TOKEN or DISCORD_GUILD_ID');
  process.exit(1);
}

const headers = { Authorization: `Bot ${env.token}` };

const VIEW = 1n << 10n;
const READ_HISTORY = 1n << 16n;

function hasBit(value: string, bit: bigint) {
  return (BigInt(value) & bit) === bit;
}

function cmpSnowflake(a: string, b: string) {
  const A = BigInt(a); const B = BigInt(b);
  return A < B ? -1 : A > B ? 1 : 0;
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

async function api<T>(pathname: string): Promise<T> {
  while (true) {
    const res = await fetch(`${API}${pathname}`, { headers });
    if (res.ok) return (await res.json()) as T;
    if (res.status === 429) {
      const body = await res.json().catch(() => ({ retry_after: 1 }));
      await new Promise((r) => setTimeout(r, Math.ceil((body.retry_after ?? 1) * 1000) + 100));
      continue;
    }
    throw new Error(`Discord API ${pathname} failed: ${res.status} ${await res.text()}`);
  }
}

async function readState(): Promise<State> {
  try {
    const raw = JSON.parse(await fs.readFile(STATE_FILE, 'utf8')) as any;
    if (raw?.channels) return raw;
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

function cleanContent(text: string) {
  return (text || '')
    .replace(/<@!?\d+>/g, '@user')
    .replace(/<#\d+>/g, '#channel')
    .replace(/<a?:\w+:\d+>/g, '')
    .trim();
}

function extractEmbeds(m: DiscordMessage): StoredEmbed[] {
  return (m.embeds || []).map((e) => ({
    title: cleanContent(e.title || ''),
    description: cleanContent(e.description || ''),
    url: e.url,
    fields: (e.fields || []).map((f) => ({ name: cleanContent(f.name || ''), value: cleanContent(f.value || '') }))
  })).filter((e) => e.title || e.description || e.url || (e.fields && e.fields.length));
}

function isUserMessage(m: DiscordMessage) {
  // 0 = DEFAULT, 19 = REPLY
  return m.type === 0 || m.type === 19;
}

function hasVisibleContent(m: DiscordMessage) {
  if (!isUserMessage(m)) return false;
  return Boolean(
    cleanContent(m.content || '') ||
    (m.attachments && m.attachments.length > 0) ||
    extractEmbeds(m).length
  );
}

function authorAvatarUrl(author?: DiscordMessage['author']) {
  if (!author?.id) return undefined;
  if (author.avatar) {
    const ext = author.avatar.startsWith('a_') ? 'gif' : 'png';
    return `https://cdn.discordapp.com/avatars/${author.id}/${author.avatar}.${ext}?size=64`;
  }
  return `https://cdn.discordapp.com/embed/avatars/${Number(author.discriminator || 0) % 5}.png`;
}

function toStoredMessage(m: DiscordMessage, threads: Map<string, ThreadSummary>): StoredMessage {
  const replyId = m.message_reference?.message_id || m.referenced_message?.id;
  const threadId = m.thread?.id;
  const threadSummary = threadId ? threads.get(threadId) : undefined;

  const content = cleanContent(m.content || '');
  const embeds = extractEmbeds(m);

  return {
    id: m.id,
    author: m.author?.global_name || m.author?.username || 'unknown',
    authorAvatarUrl: authorAvatarUrl(m.author),
    timestamp: m.timestamp,
    editedAt: m.edited_timestamp,
    content,
    attachments: (m.attachments || []).map((a) => ({ url: a.url, filename: a.filename })),
    embeds,
    replyTo: replyId
      ? {
          id: replyId,
          author: m.referenced_message?.author?.global_name || m.referenced_message?.author?.username,
          avatarUrl: authorAvatarUrl(m.referenced_message?.author),
          content: cleanContent(m.referenced_message?.content || '').slice(0, 160)
        }
      : undefined,
    thread: threadSummary
      ? {
          id: threadSummary.id,
          name: threadSummary.name,
          messageCount: threadSummary.messageCount,
          lastMessageAt: threadSummary.lastMessageAt,
          preview: threadSummary.preview
        }
      : undefined
  };
}

async function fetchAllHistory(channelId: string) {
  const all: DiscordMessage[] = [];
  let before: string | undefined;
  while (true) {
    const q = new URLSearchParams({ limit: '100' });
    if (before) q.set('before', before);
    const batch = await api<DiscordMessage[]>(`/channels/${channelId}/messages?${q.toString()}`);
    if (!batch.length) break;
    all.push(...batch);
    before = batch[batch.length - 1]?.id;
    if (batch.length < 100) break;
  }
  all.sort((a, b) => cmpSnowflake(a.id, b.id));
  return all;
}

async function fetchAfter(channelId: string, after: string) {
  const out: DiscordMessage[] = [];
  let nextAfter: string | undefined = after;
  while (true) {
    const q = new URLSearchParams({ limit: '100' });
    if (nextAfter) q.set('after', nextAfter);
    const batch = await api<DiscordMessage[]>(`/channels/${channelId}/messages?${q.toString()}`);
    if (!batch.length) break;
    batch.sort((a, b) => cmpSnowflake(a.id, b.id));
    out.push(...batch);
    nextAfter = batch.at(-1)?.id;
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
  const dir = path.join(DATA_DIR, channelId);
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
}

async function writeChannelPages(channel: Channel, messages: StoredMessage[]) {
  const pages = chunk(messages, PAGE_SIZE);
  await clearChannelPages(channel.id);

  for (let i = 0; i < pages.length; i++) {
    const pageNumber = i + 1;
    const file = path.join(DATA_DIR, channel.id, `page-${String(pageNumber).padStart(5, '0')}.json`);
    await fs.writeFile(file, JSON.stringify({
      channelId: channel.id,
      channelName: channel.name,
      channelSlug: slugify(channel.name),
      pageNumber,
      totalPages: pages.length,
      messages: pages[i]
    }), 'utf8');
  }

  return pages.length;
}

async function writeIndex(items: Array<{ id: string; name: string; slug: string; totalMessages: number; totalPages: number; channelType: number }>) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(path.join(DATA_DIR, 'index.json'), JSON.stringify(items, null, 2), 'utf8');
}

function guildIconUrl(guild: Guild) {
  if (!guild.icon) return undefined;
  return `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128`;
}

async function writeMeta(guild: Guild, channels: Channel[], included: Channel[]) {
  const includedIds = new Set(included.map((c) => c.id));
  const categories = channels.filter((c) => c.type === 4).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const textLike = channels
    .filter((c) => includedIds.has(c.id))
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  const nav = {
    categories: categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      channels: textLike
        .filter((c) => c.parent_id === cat.id)
        .map((c) => ({ id: c.id, name: c.name, position: c.position ?? 0 }))
    })).filter((cat) => cat.channels.length > 0),
    uncategorized: textLike
      .filter((c) => !c.parent_id)
      .map((c) => ({ id: c.id, name: c.name, position: c.position ?? 0 }))
  };

  await fs.mkdir(path.dirname(META_FILE), { recursive: true });
  await fs.writeFile(META_FILE, JSON.stringify({
    guild: {
      id: guild.id,
      name: guild.name,
      iconUrl: guildIconUrl(guild),
      rulesChannelId: guild.rules_channel_id || null,
      updatesChannelId: guild.public_updates_channel_id || null,
      memberCount: guild.approximate_member_count || null
    },
    nav
  }, null, 2), 'utf8');
}

async function writeThread(threadId: string, payload: { id: string; name: string; parentChannelId: string; messages: StoredMessage[] }) {
  await fs.mkdir(THREADS_DIR, { recursive: true });
  await fs.writeFile(path.join(THREADS_DIR, `${threadId}.json`), JSON.stringify(payload), 'utf8');
}

async function fetchForumThreads(forumChannelId: string): Promise<ForumThread[]> {
  const out = new Map<string, ForumThread>();

  try {
    const active = await api<{ threads?: Array<{ id: string; name: string }> }>(`/channels/${forumChannelId}/threads/active`);
    for (const t of active.threads || []) out.set(t.id, { id: t.id, name: t.name || `Thread ${t.id}` });
  } catch {
    // ignore
  }

  try {
    const archived = await api<{ threads?: Array<{ id: string; name: string }> }>(`/channels/${forumChannelId}/threads/archived/public?limit=100`);
    for (const t of archived.threads || []) out.set(t.id, { id: t.id, name: t.name || `Thread ${t.id}` });
  } catch {
    // ignore
  }

  return [...out.values()];
}

async function main() {
  const state = await readState();
  await fs.mkdir(DATA_DIR, { recursive: true });

  const guild = await api<Guild>(`/guilds/${env.guildId}?with_counts=true`);
  const channels = await api<Channel[]>(`/guilds/${env.guildId}/channels`);
  const included = channels.filter(isPublicChannel);

  await writeMeta(guild, channels, included);

  console.log(`Channels detected: ${channels.length}, included as public: ${included.length}`);

  const indexItems: Array<{ id: string; name: string; slug: string; totalMessages: number; totalPages: number; channelType: number }> = [];

  for (const channel of included) {
    try {
      const channelState = state.channels[channel.id] || {};
      let allMessages: DiscordMessage[] = [];

      const cachePath = path.join('.cache/channel-messages', `${channel.id}.json`);
      try {
        allMessages = JSON.parse(await fs.readFile(cachePath, 'utf8')) as DiscordMessage[];
      } catch {
        allMessages = [];
      }

      if (!channelState.initialized || !allMessages.length) {
        allMessages = await fetchAllHistory(channel.id);
        console.log(`Backfilled #${channel.name}: ${allMessages.length} messages`);
      } else if (channelState.lastMessageId) {
        const newer = await fetchAfter(channel.id, channelState.lastMessageId);
        const byId = new Map(allMessages.map((m) => [m.id, m]));
        for (const m of newer) byId.set(m.id, m);
        allMessages = [...byId.values()].sort((a, b) => cmpSnowflake(a.id, b.id));
        console.log(`Incremental #${channel.name}: +${newer.length} messages`);
      }

      const forumThreads = channel.type === 15 ? await fetchForumThreads(channel.id) : [];
      const forumThreadNameMap = new Map(forumThreads.map((t) => [t.id, t.name]));

      const threadIds = [...new Set([
        ...allMessages.map((m) => m.thread?.id).filter(Boolean),
        ...forumThreads.map((t) => t.id)
      ])] as string[];

      const threadMap = new Map<string, ThreadSummary>();
      const threadFirstMap = new Map<string, StoredMessage | undefined>();

      for (const threadId of threadIds) {
        try {
          const threadMsgs = await fetchAllHistory(threadId);
          const threadStored = threadMsgs
            .filter((m) => hasVisibleContent(m))
            .map((m) => ({
              id: m.id,
              author: m.author?.global_name || m.author?.username || 'unknown',
              authorAvatarUrl: authorAvatarUrl(m.author),
              timestamp: m.timestamp,
              editedAt: m.edited_timestamp,
              content: cleanContent(m.content || ''),
              attachments: (m.attachments || []).map((a) => ({ url: a.url, filename: a.filename })),
              embeds: extractEmbeds(m)
            }));

          const starter = allMessages.find((m) => m.thread?.id === threadId);
          const name = forumThreadNameMap.get(threadId) || starter?.thread?.name || `Thread ${threadId}`;
          const last = threadStored.at(-1);

          await writeThread(threadId, {
            id: threadId,
            name,
            parentChannelId: channel.id,
            messages: threadStored
          });

          threadFirstMap.set(threadId, threadStored[0]);
          threadMap.set(threadId, {
            id: threadId,
            name,
            messageCount: threadStored.length,
            lastMessageAt: last?.timestamp,
            preview: last?.content?.slice(0, 120)
          });
        } catch (err) {
          console.warn(`Thread fetch failed ${threadId}`, err);
        }
      }

      const stored = channel.type === 15
        ? [...threadMap.values()]
            .map((t) => {
              const first = threadFirstMap.get(t.id);
              return {
                id: first?.id || t.id,
                author: first?.author || 'unknown',
                authorAvatarUrl: first?.authorAvatarUrl,
                timestamp: first?.timestamp || t.lastMessageAt || new Date().toISOString(),
                editedAt: first?.editedAt,
                content: first?.content || '',
                attachments: first?.attachments || [],
                embeds: first?.embeds || [],
                thread: {
                  id: t.id,
                  name: t.name,
                  messageCount: t.messageCount,
                  lastMessageAt: t.lastMessageAt,
                  preview: t.preview
                }
              } as StoredMessage;
            })
            .sort((a, b) => cmpSnowflake(a.id, b.id))
        : allMessages
            .filter((m) => hasVisibleContent(m))
            .map((m) => toStoredMessage(m, threadMap));

      await fs.mkdir(path.dirname(cachePath), { recursive: true });
      await fs.writeFile(cachePath, JSON.stringify(allMessages), 'utf8');

      const totalPages = await writeChannelPages(channel, stored);
      const lastId = allMessages.at(-1)?.id || stored.at(-1)?.id;
      if (lastId) state.channels[channel.id] = { initialized: true, lastMessageId: lastId };

      indexItems.push({
        id: channel.id,
        name: channel.name,
        slug: slugify(channel.name),
        totalMessages: stored.length,
        totalPages,
        channelType: channel.type
      });

      console.log(`Built #${channel.name}: ${totalPages} pages`);
    } catch (err) {
      console.error(`Failed channel ${channel.name} (${channel.id})`, err);
    }
  }

  indexItems.sort((a, b) => a.name.localeCompare(b.name));
  await writeIndex(indexItems);
  await writeState(state);
  console.log('Sync complete');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
