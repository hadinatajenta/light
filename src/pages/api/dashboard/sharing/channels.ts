import { z } from 'astro/zod';
import { recordActivity, toUserActor } from '@/lib/activity/record';
import { withAdmin } from '@/lib/api/handler';
import { requireContentDatabase } from '@/lib/content/database';
import { jsonOk, readJsonBody } from '@/lib/http';
import { createShareChannel } from '@/lib/sharing/channels';
import { SHARE_PROVIDERS } from '@/lib/sharing/types';

export const prerender = false;

const channelConfigSchema = z.object({
  public: z.record(z.string().max(120), z.string().max(2000)).default({}),
  secret: z.record(z.string().max(120), z.string().max(2000)).default({}),
});

const channelInputSchema = z.object({
  provider: z.enum(SHARE_PROVIDERS),
  label: z.string().trim().min(1).max(120),
  enabled: z.boolean().default(true),
  dailyCap: z.number().int().positive().max(10_000).nullable().default(null),
  requireApproval: z.boolean().default(false),
  config: channelConfigSchema.default({ public: {}, secret: {} }),
});

export const POST = withAdmin(async ({ request }, requestId, user) => {
  const database = await requireContentDatabase();
  const payload = channelInputSchema.parse(await readJsonBody(request, 40_000));
  const channel = await createShareChannel(database, payload);

  await recordActivity({
    ...toUserActor(user),
    action: 'share.channel_created',
    targetType: 'share_channel',
    targetId: channel.id,
    summary: `Created ${channel.provider} sharing channel "${channel.label}"`,
  });

  return jsonOk({ channel }, requestId);
});
