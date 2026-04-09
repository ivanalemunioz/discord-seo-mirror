import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';
import react from '@astrojs/react';

export default defineConfig({
  site: process.env.SITE_URL || 'https://example.github.io/discord-seo-mirror',
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
