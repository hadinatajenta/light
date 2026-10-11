import type { APIContext } from 'astro';
import type { AuthenticatedUser } from '../auth/types';
import { resolveContentDatabase } from '../content/database';
import { createRequestContext, requireUser, toErrorResponse } from '../http';
import { enforceRateLimit, type RateLimitRule } from '../security/rate-limit';

const ADMIN_WINDOW_MS = 60_000;
const ADMIN_READ_LIMIT = 240;
const ADMIN_WRITE_LIMIT = 60;
const READ_METHODS = new Set(['GET', 'HEAD']);

export type AdminHandler = (
  context: APIContext,
  requestId: string,
  user: AuthenticatedUser,
) => Promise<Response>;

function adminRateLimitRule(method: string, user: AuthenticatedUser): RateLimitRule {
  const isRead = READ_METHODS.has(method.toUpperCase());
  const bucket = isRead ? 'read' : 'write';

  return {
    key: `admin:${bucket}:${user.email.toLowerCase()}`,
    limit: isRead ? ADMIN_READ_LIMIT : ADMIN_WRITE_LIMIT,
    windowMs: ADMIN_WINDOW_MS,
  };
}

export function withAdmin(handler: AdminHandler): (context: APIContext) => Promise<Response> {
  return async (context: APIContext): Promise<Response> => {
    const { requestId } = createRequestContext();

    try {
      const user = requireUser(context.locals.user);
      const database = await resolveContentDatabase();

      if (database) {
        await enforceRateLimit(database, adminRateLimitRule(context.request.method, user));
      }

      return await handler(context, requestId, user);
    } catch (error) {
      return toErrorResponse(error, requestId);
    }
  };
}
