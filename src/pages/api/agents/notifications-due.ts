import type { APIContext } from 'astro';
import { requireCronAuthorization } from '@/lib/agents/cron-auth';
import { requireContentDatabase } from '@/lib/content/database';
import { createRequestContext, jsonOk, toErrorResponse } from '@/lib/http';
import { retryFailedNotificationPushes } from '@/lib/notifications/deliver';

export const prerender = false;

export const POST = async (context: APIContext): Promise<Response> => {
  const { requestId } = createRequestContext();

  try {
    await requireCronAuthorization(context.request);

    const database = await requireContentDatabase();
    const summary = await retryFailedNotificationPushes(database);

    return jsonOk(summary, requestId);
  } catch (error) {
    return toErrorResponse(error, requestId);
  }
};
