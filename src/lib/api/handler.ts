import type { APIContext } from 'astro';
import { createRequestContext, requireUser, toErrorResponse } from '../http';

export type AdminHandler = (context: APIContext, requestId: string) => Promise<Response>;

export function withAdmin(handler: AdminHandler): (context: APIContext) => Promise<Response> {
  return async (context: APIContext): Promise<Response> => {
    const { requestId } = createRequestContext();

    try {
      requireUser(context.locals.user);
      return await handler(context, requestId);
    } catch (error) {
      return toErrorResponse(error, requestId);
    }
  };
}
