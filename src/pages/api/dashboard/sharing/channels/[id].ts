import { z } from 'astro/zod';
import { recordActivity, toUserActor } from '@/lib/activity/record';
import { withAdmin } from '@/lib/api/handler';
import { requireContentDatabase } from '@/lib/content/database';
import { ApiError, jsonOk, readJsonBody } from '@/lib/http';
import { deleteShareChannel, updateShareChannel } from '@/lib/sharing/channels';
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

function requireId(params: Record<string, string | undefined>): string {
  const id = params.id;
  if (!id) {
    throw new ApiError(400, 'MISSING_ID', 'The sharing channel id is required.');
  }

  return id;
}

export const PUT = withAdmin(async ({ params, request }, requestId, user) => {
  const database = await requireContentDatabase();
  const id = requireId(params);
  const payload = channelInputSchema.parse(await readJsonBody(request, 40_000));
  const channel = await updateShareChannel(database, id, payload);

  await recordActivity({
    ...toUserActor(user),
    action: 'share.channel_updated',
    targetType: 'share_channel',
    targetId: channel.id,
    summary: `Updated ${channel.provider} sharing channel "${channel.label}"`,
  });

  return jsonOk({ channel }, requestId);
});

export const DELETE = withAdmin(async ({ params }, requestId, user) => {
  const database = await requireContentDatabase();
  const id = requireId(params);
  await deleteShareChannel(database, id);

  await recordActivity({
    ...toUserActor(user),
    action: 'share.channel_deleted',
    targetType: 'share_channel',
    targetId: id,
    summary: `Deleted sharing channel "${id}"`,
  });

  return jsonOk({ id, deleted: true }, requestId);
});
