# Discord SEO Mirror

Production-ready Astro project that mirrors **public-by-default Discord community content** into static, SEO-friendly pages deployable on GitHub Pages.

## Stack

- Astro + TypeScript
- Tailwind CSS
- shadcn-style UI primitives (React components)
- Discord official REST API (bot token)
- GitHub Actions + GitHub Pages

## Public-by-default policy

Default behavior:

- ✅ Include channels readable by the default community audience
- ✅ Include public forum channels and public threads
- ✅ Include normal public text channels
- ❌ Exclude channels denied to `@everyone` (staff/mod/admin/private)

The sync logic checks channel permission overwrites for the guild default role (`@everyone` = guild ID). If `VIEW_CHANNEL` or `READ_MESSAGE_HISTORY` is denied, the channel is excluded.

### Overrides

- `SYNC_INCLUDE_CHANNEL_IDS`: force include comma-separated IDs
- `SYNC_EXCLUDE_CHANNEL_IDS`: force exclude comma-separated IDs

Include/exclude overrides always win over auto-detection.

## Setup

1. Create Discord bot in Developer Portal.
2. Enable **Server Members Intent** only if you later extend member-based features (not required for MVP).
3. Invite bot with minimum scopes/permissions:
   - `bot`
   - View Channels
   - Read Message History
4. Copy `.env.example` to `.env` and set values.

```bash
npm install
npm run sync
npm run dev
```

## Build/deploy

```bash
npm run build
```

Deploy uses `.github/workflows/deploy.yml` and runs on:
- push to `main`
- manual dispatch
- daily cron (`0 6 * * *`)

## GitHub configuration steps

1. Push repo to GitHub.
2. In **Settings → Pages**, Source = **GitHub Actions**.
3. Add repo secrets:
   - `DISCORD_BOT_TOKEN`
   - `DISCORD_GUILD_ID`
4. Add repo variables:
   - `SITE_URL`
   - `PUBLIC_BASE_URL`
   - optional include/exclude vars

## Site structure

- `/` Home + latest discussions
- `/latest`
- `/channels`
- `/channels/:slug`
- `/community/:slug`
- `/search`

## SEO defaults

- Canonical URLs
- Open Graph metadata
- `robots.txt`
- sitemap (via `@astrojs/sitemap`)
- structured internal links (channels + related discussions)

## Privacy + limitations

- Uses official Discord API only (no scraping, no selfbot).
- Mirrors only content deemed public by channel permission rules.
- Attachment links point to original Discord CDN URLs.
- Message grouping for text channels is batch-based; you can extend to thread-first models per community structure.
