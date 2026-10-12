import { getSetting, setSetting } from '../settings/store';

export const SEO_REFRESH_DAYS_SETTING = 'seo_refresh_days';
export const DEFAULT_REFRESH_AFTER_DAYS = 180;
export const MIN_REFRESH_DAYS = 30;
export const MAX_REFRESH_DAYS = 730;

export function clampRefreshDays(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_REFRESH_AFTER_DAYS;
  }

  const rounded = Math.round(value);
  return Math.min(MAX_REFRESH_DAYS, Math.max(MIN_REFRESH_DAYS, rounded));
}

export async function readSeoRefreshDays(db: D1Database): Promise<number> {
  const stored = await getSetting(db, SEO_REFRESH_DAYS_SETTING);
  if (stored === null) {
    return DEFAULT_REFRESH_AFTER_DAYS;
  }

  const parsed = Number.parseInt(stored, 10);
  return Number.isFinite(parsed) ? clampRefreshDays(parsed) : DEFAULT_REFRESH_AFTER_DAYS;
}

export async function saveSeoRefreshDays(db: D1Database, days: number): Promise<number> {
  const clamped = clampRefreshDays(days);
  await setSetting(db, SEO_REFRESH_DAYS_SETTING, String(clamped));

  return clamped;
}
