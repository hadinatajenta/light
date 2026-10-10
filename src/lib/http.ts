import { ZodError } from 'astro/zod';
import type { AuthenticatedUser } from './auth';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function createRequestId(): string {
  return crypto.randomUUID();
}

export function jsonOk(data: unknown, requestId: string, status = 200): Response {
  return new Response(JSON.stringify({ data, meta: { request_id: requestId } }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export function jsonError(
  status: number,
  code: string,
  message: string,
  requestId: string,
  details?: unknown,
): Response {
  return new Response(
    JSON.stringify({ error: { code, message, details, request_id: requestId } }),
    {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    },
  );
}

export function createRequestContext(): { requestId: string } {
  return { requestId: createRequestId() };
}

export function requireUser(user: AuthenticatedUser | null | undefined): AuthenticatedUser {
  if (!user) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication is required.');
  }

  return user;
}

export async function readJsonBody<T>(request: Request, maxBytes: number): Promise<T> {
  const raw = await request.text();

  if (raw.length > maxBytes) {
    throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'The request body is too large.');
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new ApiError(400, 'INVALID_JSON', 'The request body is not valid JSON.');
  }
}

export function toErrorResponse(error: unknown, requestId: string): Response {
  if (error instanceof ApiError) {
    return jsonError(error.status, error.code, error.message, requestId, error.details);
  }

  if (error instanceof ZodError) {
    return jsonError(422, 'VALIDATION_FAILED', 'The submitted data is invalid.', requestId, {
      issues: error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  console.error(`[api] unhandled error request_id=${requestId}`, error);
  return jsonError(500, 'INTERNAL_ERROR', 'An unexpected error occurred.', requestId);
}
