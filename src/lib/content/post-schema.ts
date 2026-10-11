import { z } from 'astro/zod';

export const POST_STATUSES = ['draft', 'published', 'archived'] as const;

export const postFrontmatterSchema = z.object({
  title: z.string().min(10).max(70),
  description: z.string().min(50).max(160),
  seoTitle: z.string().max(70).optional(),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .optional(),
  status: z.enum(POST_STATUSES).default('draft'),
  category: z.string().optional(),
  tags: z.array(z.string()).default([]),
  pubDate: z.coerce.date(),
  updatedDate: z.coerce.date().optional(),
  coverUrl: z.string().optional(),
  coverAlt: z.string().optional(),
  canonical: z.url().optional(),
  noindex: z.boolean().default(false),
  focusKeyword: z.string().optional(),
  targetIntent: z.enum(['informational', 'commercial', 'transactional', 'navigational']).optional(),
  affiliate: z.boolean().default(false),
  faq: z.array(z.object({ question: z.string(), answer: z.string() })).default([]),
});

export type PostFrontmatter = z.infer<typeof postFrontmatterSchema>;
export type PostStatus = (typeof POST_STATUSES)[number];
