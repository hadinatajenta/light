import type { APIContext } from 'astro';
import type { AuthenticatedUser } from '../auth/types';
import { createRequestContext, requireUser, toErrorResponse } from '../http';

export type AdminHandler = (
  context: APIContext,
  requestId: string,
  user: AuthenticatedUser,
) => Promise<Response>;

export function withAdmin(handler: AdminHandler): (context: APIContext) => Promise<Response> {
  return async (context: APIContext): Promise<Response> => {
    const { requestId } = createRequestContext();

    try {
      const user = requireUser(context.locals.user);
      return await handler(context, requestId, user);
    } catch (error) {
      return toErrorResponse(error, requestId);
    }
  };
}
