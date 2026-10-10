export interface ApiErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

interface ApiSuccessEnvelope<T> {
  data: T;
}

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

function parseRetryAfter(value: string): number {
  const seconds = Number.parseInt(value, 10);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds;
  }

  const timestamp = Date.parse(value);
  if (Number.isFinite(timestamp)) {
    return Math.max(0, Math.ceil((timestamp - Date.now()) / 1000));
  }

  return 30;
}

export async function requestJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (typeof init.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, { ...init, headers });

  if (!response.ok) {
    const envelope = (await response.json().catch(() => null)) as ApiErrorEnvelope | null;
    const retryAfter = response.headers.get('Retry-After');
    const fallback =
      response.status === 429
        ? `Too many attempts. Try again in ${retryAfter ? parseRetryAfter(retryAfter) : 30} seconds.`
        : 'The request could not be completed.';

    throw new ApiRequestError(
      response.status,
      envelope?.error?.code ?? 'REQUEST_FAILED',
      envelope?.error?.message ?? fallback,
      envelope?.error?.details,
    );
  }

  const envelope = (await response.json()) as ApiSuccessEnvelope<T>;
  return envelope.data;
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    return error.message;
  }

  return 'You appear to be offline. Check your connection and try again.';
}
