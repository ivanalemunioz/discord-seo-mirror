# Discord SEO Mirror

Static Astro site that mirrors **public Discord community content** into crawlable web pages.

## Index

- [What it does](#what-it-does)
- [Stack](#stack)
- [Public-by-default mirroring policy](#public-by-default-mirroring-policy)
- [Setup](#setup)
- [Environment variables](#environment-variables)
- [How to create the Discord bot + token](#how-to-create-the-discord-bot--token)
- [How to get Discord server (guild) ID](#how-to-get-discord-server-guild-id)
- [How to create a Discord invite URL (for footer CTA)](#how-to-create-a-discord-invite-url-for-footer-cta)
- [Sync behavior](#sync-behavior)
- [Build and deploy](#build-and-deploy)
- [SEO](#seo)
- [Notes](#notes)

## What it does

- Syncs Discord content via **official Discord API** (bot token)
- Mirrors public text channels + forum channels + threads
- Builds static pages optimized for SEO
- Deploys to GitHub Pages via GitHub Actions

---

## Stack

- Astro + TypeScript
- Tailwind CSS
- Discord REST API
- GitHub Actions + GitHub Pages

---

## Public-by-default mirroring policy

Default include:
- channels readable by the general community
- public forum channels + public threads
- normal community channels

Default exclude:
- staff/mod/admin/private channels
- role-gated channels not readable by default audience

Override options:
- `SYNC_INCLUDE_CHANNEL_IDS`
- `SYNC_EXCLUDE_CHANNEL_IDS`

---

## Setup

```bash
npm install
cp .env.example .env
# fill .env values
npm run sync
npm run dev
```

### Environment variables

Required:
- `DISCORD_BOT_TOKEN`
- `DISCORD_GUILD_ID`
- `SITE_URL`
- `PUBLIC_BASE_URL`

Optional:
- `PUBLIC_DISCORD_INVITE_URL`
- `SITE_LANG` (`en` default, `es` supported)
- `SYNC_INCLUDE_CHANNEL_IDS`
- `SYNC_EXCLUDE_CHANNEL_IDS`
- `SYNC_MAX_MESSAGES_PER_CHANNEL`

---

## How to create the Discord bot + token

1. Open Discord Developer Portal: https://discord.com/developers/applications
2. Click **New Application**
3. Go to **Bot** (left menu)
4. Click **Add Bot**
5. In **Bot** page:
   - Copy token (or Reset Token then copy)
   - This value is `DISCORD_BOT_TOKEN`
6. In **Bot → Privileged Gateway Intents**:
   - Enable **MESSAGE CONTENT INTENT**

### Bot permissions/scopes

In **OAuth2 → URL Generator**:
- Scopes: `bot`
- Bot Permissions:
  - View Channels
  - Read Message History

Open generated URL and invite bot to your server.

---

## How to get Discord server (guild) ID

1. In Discord app: **User Settings → Advanced → Developer Mode ON**
2. Right-click server icon/name
3. Click **Copy Server ID**
4. Use it as `DISCORD_GUILD_ID`

---

## How to create a Discord invite URL (for footer CTA)

1. In your Discord server, click server name → **Invite People**
2. Create/copy invite link
3. Put it in `.env`:

```env
PUBLIC_DISCORD_INVITE_URL=https://discord.gg/your-invite
```

If this env var is missing, the footer composer CTA is hidden.

---

## Sync behavior

- Uses Discord API pagination (`before` / `after`)
- Stores channel pages as JSON arrays of messages
- Includes embed messages and reply-type messages
- Ingests forum threads and stores them in `src/data/threads/*.json`

---

## Build and deploy

### Local build

```bash
npm run build
```

### GitHub Pages

Workflow: `.github/workflows/deploy.yml`

Runs on:
- push to `main`
- manual dispatch
- daily cron

### GitHub repo settings

1. Settings → Pages → Source: **GitHub Actions**
2. Add secrets:
   - `DISCORD_BOT_TOKEN`
   - `DISCORD_GUILD_ID`
3. Add variables:
   - `SITE_URL`
   - `PUBLIC_BASE_URL`
   - optional sync overrides

---

## SEO

- Canonical URLs
- Open Graph tags
- `robots.txt`
- `sitemap.xml`/`sitemap-index.xml` via `@astrojs/sitemap`
- Static fast pages

---

## Notes

- Official API only (no scraping/selfbot)
- Designed for static hosting
- Some Discord dynamic UI behavior is approximated in static pages
