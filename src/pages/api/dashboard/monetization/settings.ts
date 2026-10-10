import { z } from 'astro/zod';
import { AD_CONFIG, DEFAULT_AFFILIATE_DISCLOSURE } from '@/config/monetization';
import { recordActivity, toUserActor } from '@/lib/activity/record';
import { withAdmin } from '@/lib/api/handler';
import { requireContentDatabase } from '@/lib/content/database';
import { jsonOk, readJsonBody } from '@/lib/http';
import { getSetting, readJsonSetting, setSetting, writeJsonSetting } from '@/lib/settings/store';

export const prerender = false;

const ADS_CONFIG_SETTING = 'ads_config';
const AFFILIATE_DISCLOSURE_SETTING = 'affiliate_disclosure';

const AD_NETWORKS = ['none', 'adsense', 'ezoic', 'mediavine'] as const;

const SLOT_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLOT_VALUE_PATTERN = /^[A-Za-z0-9_-]*$/;
const CLIENT_ID_PATTERN = /^[A-Za-z0-9._-]*$/;

function emptyToNull(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

const adsConfigSchema = z.object({
  network: z.enum(AD_NETWORKS),
  adsenseClientId: z
    .string()
    .max(120)
    .regex(CLIENT_ID_PATTERN, 'Use letters, numbers, dots, hyphens, or underscores.')
    .nullable()
    .transform(emptyToNull)
    .default(null),
  slots: z.record(
    z.string().max(60).regex(SLOT_KEY_PATTERN, 'Use lowercase letters, numbers, and hyphens.'),
    z.string().max(80).regex(SLOT_VALUE_PATTERN, 'Use letters, numbers, hyphens, or underscores.'),
  ),
  adsTxt: z.string().max(20_000).default(''),
});

const monetizationSettingsSchema = z.object({
  ads: adsConfigSchema,
  disclosure: z.string().max(2000),
});

type AdsConfig = z.infer<typeof adsConfigSchema>;

function defaultAdsConfig(): AdsConfig {
  return { ...AD_CONFIG, adsTxt: '' };
}

async function readAdsConfig(database: D1Database): Promise<AdsConfig> {
  const stored = await readJsonSetting<unknown>(database, ADS_CONFIG_SETTING);
  const parsed = adsConfigSchema.safeParse(stored);

  return parsed.success ? parsed.data : defaultAdsConfig();
}

async function readDisclosure(database: D1Database): Promise<string> {
  const stored = await getSetting(database, AFFILIATE_DISCLOSURE_SETTING);
  return stored ?? DEFAULT_AFFILIATE_DISCLOSURE;
}

export const GET = withAdmin(async (_context, requestId) => {
  const database = await requireContentDatabase();
  const [ads, disclosure] = await Promise.all([readAdsConfig(database), readDisclosure(database)]);

  return jsonOk({ ads, disclosure }, requestId);
});

export const PUT = withAdmin(async ({ request }, requestId, user) => {
  const database = await requireContentDatabase();
  const payload = monetizationSettingsSchema.parse(await readJsonBody(request, 40_000));

  await writeJsonSetting(database, ADS_CONFIG_SETTING, payload.ads);
  await setSetting(database, AFFILIATE_DISCLOSURE_SETTING, payload.disclosure);

  await recordActivity({
    ...toUserActor(user),
    action: 'settings.monetization_updated',
    summary: `Updated monetization settings (ads network: ${payload.ads.network})`,
  });

  return jsonOk({ ads: payload.ads, disclosure: payload.disclosure }, requestId);
});
