import { z } from 'astro/zod';
import {
  DEFAULT_OG_IMAGE,
  GOOGLE_SITE_VERIFICATION,
  SITE_AUTHOR,
  SITE_DESCRIPTION,
  SITE_LOCALE,
  SITE_TAGLINE,
  SITE_TITLE,
} from '@/consts';
import { readJsonSetting, writeJsonSetting } from './store';

export const SITE_SETTINGS_KEY = 'site_settings';

function isAbsolutePathOrUrl(value: string): boolean {
  if (value.length === 0) {
    return false;
  }

  if (value.startsWith('/')) {
    return !value.startsWith('//');
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

const siteSettingsFields = z.object({
  title: z.string().min(2).max(60),
  description: z.string().min(20).max(200),
  tagline: z.string().max(200),
  author: z.string().min(2).max(60),
  locale: z.string().regex(/^[a-z]{2}-[A-Z]{2}$/, 'Use a locale like en-US.'),
  defaultOgImage: z
    .string()
    .max(500)
    .refine(isAbsolutePathOrUrl, 'Use an absolute path or a full URL.'),
  googleSiteVerification: z.string().max(200),
  twitterHandle: z.string().max(30),
});

export type SiteSettings = z.infer<typeof siteSettingsFields>;

export const siteSettingsInputSchema = siteSettingsFields.extend({
  tagline: z.string().max(200).default(''),
  googleSiteVerification: z.string().max(200).default(''),
  twitterHandle: z.string().max(30).default(''),
});

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  tagline: SITE_TAGLINE,
  author: SITE_AUTHOR,
  locale: SITE_LOCALE,
  defaultOgImage: DEFAULT_OG_IMAGE,
  googleSiteVerification: GOOGLE_SITE_VERIFICATION,
  twitterHandle: '',
};

export async function getSiteSettings(db: D1Database): Promise<SiteSettings> {
  const stored = await readJsonSetting<unknown>(db, SITE_SETTINGS_KEY);
  const parsed = siteSettingsFields.partial().safeParse(stored);

  if (!parsed.success) {
    return DEFAULT_SITE_SETTINGS;
  }

  return { ...DEFAULT_SITE_SETTINGS, ...parsed.data };
}

export async function saveSiteSettings(db: D1Database, input: unknown): Promise<SiteSettings> {
  const parsed = siteSettingsInputSchema.parse(input);
  const settings: SiteSettings = { ...DEFAULT_SITE_SETTINGS, ...parsed };

  await writeJsonSetting(db, SITE_SETTINGS_KEY, settings);

  return settings;
}
