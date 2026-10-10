import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { postFrontmatterSchema } from './lib/content/post-schema';

const blog = defineCollection({
  loader: glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' }),
  schema: ({ image }) => postFrontmatterSchema.extend({ cover: image().optional() }),
});

export const collections = { blog };
