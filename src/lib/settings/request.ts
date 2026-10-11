import { resolveContentDatabase } from '@/lib/content/database';
import { listFooterPages, type PageRecord } from '@/lib/pages/store';
import { DEFAULT_SITE_SETTINGS, getSiteSettings, type SiteSettings } from './site';

export interface RequestSettingsCache {
  siteSettings?: Promise<SiteSettings>;
  footerPages?: Promise<PageRecord[]>;
}

function resolveSettingsCache(locals: App.Locals): RequestSettingsCache {
  if (!locals.settingsCache) {
    locals.settingsCache = {};
  }

  return locals.settingsCache;
}

async function readSiteSettings(): Promise<SiteSettings> {
  try {
    const database = await resolveContentDatabase();
    if (!database) {
      return DEFAULT_SITE_SETTINGS;
    }

    return await getSiteSettings(database);
  } catch {
    return DEFAULT_SITE_SETTINGS;
  }
}

async function readFooterPages(): Promise<PageRecord[]> {
  try {
    const database = await resolveContentDatabase();
    if (!database) {
      return [];
    }

    return await listFooterPages(database);
  } catch (error) {
    console.error('Failed to load footer pages', error);
    return [];
  }
}

export function getRequestSiteSettings(locals: App.Locals): Promise<SiteSettings> {
  const cache = resolveSettingsCache(locals);
  const pending = cache.siteSettings ?? readSiteSettings();
  cache.siteSettings = pending;

  return pending;
}

export function getRequestFooterPages(locals: App.Locals): Promise<PageRecord[]> {
  const cache = resolveSettingsCache(locals);
  const pending = cache.footerPages ?? readFooterPages();
  cache.footerPages = pending;

  return pending;
}
