import { recordActivity, toUserActor } from '@/lib/activity/record';
import { withAdmin } from '@/lib/api/handler';
import { requireContentDatabase } from '@/lib/content/database';
import { ApiError, jsonOk } from '@/lib/http';
import {
  getShareChannel,
  readChannelConfig,
  setChannelNeedsAttention,
  touchChannelSuccess,
} from '@/lib/sharing/channels';
import { redactShareError, resolveShareAdapter } from '@/lib/sharing/sender';
import { escapeTelegramHtml } from '@/lib/sharing/templates';
import type { ShareChannel, ShareMessage, SharePostContent } from '@/lib/sharing/types';

export const prerender = false;

const TEST_TIMEOUT_MS = 10_000;

function requireId(params: Record<string, string | undefined>): string {
  const id = params.id;
  if (!id) {
    throw new ApiError(400, 'MISSING_ID', 'The sharing channel id is required.');
  }

  return id;
}

function resolveOrigin(site: URL | undefined, request: Request): string {
  if (site) {
    return site.origin;
  }

  return new URL(request.url).origin;
}

function buildTestMessage(channel: ShareChannel): ShareMessage {
  if (channel.provider === 'telegram') {
    return {
      text: `<b>Test message</b>\n\nThis is a test send from the ${escapeTelegramHtml(channel.label)} sharing channel.`,
      photoUrl: null,
    };
  }

  return {
    text: `Test message\n\nThis is a test send from the ${channel.label} sharing channel.`,
    photoUrl: null,
  };
}

export const POST = withAdmin(async ({ params, request, site }, requestId, user) => {
  const database = await requireContentDatabase();
  const id = requireId(params);
  const channel = await getShareChannel(database, id);
  const config = await readChannelConfig(database, channel);
  const secrets = Object.values(config);

  const post: SharePostContent = {
    id: 'share-test',
    title: channel.label,
    description: '',
    body: '',
    coverUrl: null,
    affiliate: false,
  };

  const adapter = resolveShareAdapter(channel.provider);
  const result = await adapter.send({
    channel,
    config,
    post,
    message: buildTestMessage(channel),
    url: resolveOrigin(site, request),
    timeoutMs: TEST_TIMEOUT_MS,
  });

  if (result.outcome === 'success') {
    await touchChannelSuccess(database, channel.id);
    await setChannelNeedsAttention(database, channel.id, false);
  } else if (result.outcome === 'channel_config') {
    await setChannelNeedsAttention(
      database,
      channel.id,
      true,
      redactShareError(result.error, secrets),
    );
  }

  await recordActivity({
    ...toUserActor(user),
    action: 'share.channel_tested',
    targetType: 'share_channel',
    targetId: channel.id,
    summary: `Test send to "${channel.label}" returned ${result.outcome}`,
  });

  return jsonOk(
    {
      outcome: result.outcome,
      providerPostId: result.providerPostId ?? null,
      error: result.error ? redactShareError(result.error, secrets) : null,
    },
    requestId,
  );
});
