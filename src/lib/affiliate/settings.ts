import { getSetting, setSetting } from '../settings/store';

export const AFFILIATE_LINKS_ENABLED_SETTING = 'affiliate_links_enabled';

export async function readAffiliateLinksEnabled(db: D1Database): Promise<boolean> {
  const stored = await getSetting(db, AFFILIATE_LINKS_ENABLED_SETTING);

  return stored !== '0';
}

export async function saveAffiliateLinksEnabled(db: D1Database, enabled: boolean): Promise<void> {
  await setSetting(db, AFFILIATE_LINKS_ENABLED_SETTING, enabled ? '1' : '0');
}
