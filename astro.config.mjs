import cloudflare from '@astrojs/cloudflare';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, envField } from 'astro/config';

export default defineConfig({
  site: 'https://light.hadinata.me',
  session: false,
  env: {
    schema: {
      ACCESS_TEAM_DOMAIN: envField.string({
        context: 'server',
        access: 'secret',
        optional: true,
      }),
      ACCESS_AUD: envField.string({ context: 'server', access: 'secret', optional: true }),
      DEV_ADMIN_EMAIL: envField.string({ context: 'server', access: 'secret', optional: true }),
    },
  },
  integrations: [mdx(), sitemap(), react()],
  adapter: cloudflare({
    imageService: 'compile',
    prerenderEnvironment: 'node',
  }),
  vite: {
    plugins: [tailwindcss()],
  },
});
