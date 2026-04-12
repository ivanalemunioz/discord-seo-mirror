import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';
import react from '@astrojs/react';

const rawSite = process.env.SITE_URL || 'https://example.github.io/discord-seo-mirror';
const site = /^https?:\/\//i.test(rawSite) ? rawSite : `https://${rawSite}`;

export default defineConfig({
  site,
  integrations: [tailwind(), sitemap(), react()],
  markdown: {
    shikiConfig: { theme: 'github-dark' }
  },
  vite: {
    server: {
      allowedHosts: true
    }
  }
});
