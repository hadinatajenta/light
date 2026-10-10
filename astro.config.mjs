import cloudflare from '@astrojs/cloudflare';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, envField } from 'astro/config';

export default defineConfig({
  site: 'https://lightscripts.com',
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
      GITHUB_TOKEN: envField.string({ context: 'server', access: 'secret', optional: true }),
      GITHUB_REPO: envField.string({ context: 'server', access: 'secret', optional: true }),
      GITHUB_BRANCH: envField.string({ context: 'server', access: 'secret', optional: true }),
    },
  },
  integrations: [mdx(), react()],
  adapter: cloudflare({
    imageService: 'compile',
    prerenderEnvironment: 'node',
  }),
  vite: {
    plugins: [tailwindcss()],
  },
});
