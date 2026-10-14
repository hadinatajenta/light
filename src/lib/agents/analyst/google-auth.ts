import { importPKCS8, SignJWT } from 'jose';
import { ApiError } from '../../errors';
import { type SearchRetryOptions, withSearchRetry } from '../search/retry';
import {
  type AnalystGoogleSource,
  type GoogleServiceAccount,
  isGoogleTokenFresh,
  readCachedGoogleToken,
  writeCachedGoogleToken,
} from './credentials';

export const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
export const DEFAULT_GOOGLE_TIMEOUT_MS = 20_000;

const JWT_LIFETIME_SECONDS = 3600;

export interface GoogleRequestOptions {
  fetchImpl?: GoogleFetch;
  signal?: AbortSignal;
  timeoutMs?: number;
  retry?: SearchRetryOptions;
}

export type GoogleFetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface GoogleAccessToken {
  accessToken: string;
  expiresAt: number;
}

export function resolveRequestSignal(input: {
  signal?: AbortSignal;
  timeoutMs?: number;
}): AbortSignal {
  const timeout = AbortSignal.timeout(input.timeoutMs ?? DEFAULT_GOOGLE_TIMEOUT_MS);

  return input.signal ? AbortSignal.any([input.signal, timeout]) : timeout;
}

export function toGoogleStatusError(response: Response): ApiError {
  if (response.status === 401 || response.status === 403) {
    return new ApiError(
      401,
      'ANALYST_CREDENTIALS_REJECTED',
      'Google rejected the service account credentials.',
    );
  }

  if (response.status === 404) {
    return new ApiError(
      404,
      'ANALYST_PROPERTY_NOT_FOUND',
      'Google could not find that property for the service account.',
    );
  }

  if (response.status === 429) {
    return new ApiError(429, 'ANALYST_RATE_LIMITED', 'Google rate limited the request.', {
      retryAfter: response.headers.get('Retry-After'),
    });
  }

  return new ApiError(
    502,
    'ANALYST_UPSTREAM_ERROR',
    `Google responded with status ${response.status}.`,
    {
      status: response.status,
    },
  );
}

export function toGoogleTransportError(error: unknown): ApiError {
  if (error instanceof Error && error.name === 'AbortError') {
    return new ApiError(504, 'ANALYST_TIMEOUT', 'The Google request timed out.');
  }

  return new ApiError(502, 'ANALYST_UNREACHABLE', 'Could not reach the Google API.');
}

export function isRetryableGoogleError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.code === 'ANALYST_RATE_LIMITED' ||
      error.code === 'ANALYST_UPSTREAM_ERROR' ||
      error.code === 'ANALYST_UNREACHABLE')
  );
}

export function readGoogleNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function clampGoogleLimit(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(Math.trunc(value), minimum), maximum);
}

export function withGoogleRetry<T>(
  operation: () => Promise<T>,
  retry?: SearchRetryOptions,
): Promise<T> {
  return withSearchRetry(operation, {
    ...retry,
    isRetryable: retry?.isRetryable ?? isRetryableGoogleError,
  });
}

export interface GoogleJsonRequest extends GoogleRequestOptions {
  url: string;
  method: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
}

export async function fetchGoogleJson(input: GoogleJsonRequest): Promise<unknown> {
  return withGoogleRetry(async () => {
    const fetchImpl = input.fetchImpl ?? fetch;
    let response: Response;

    try {
      response = await fetchImpl(input.url, {
        method: input.method,
        headers: input.headers,
        body: input.body,
        signal: resolveRequestSignal({ signal: input.signal, timeoutMs: input.timeoutMs }),
      });
    } catch (error) {
      throw toGoogleTransportError(error);
    }

    if (!response.ok) {
      throw toGoogleStatusError(response);
    }

    try {
      return await response.json();
    } catch {
      throw new ApiError(502, 'ANALYST_UPSTREAM_ERROR', 'Google returned an unreadable response.');
    }
  }, input.retry);
}

export async function signServiceAccountAssertion(input: {
  serviceAccount: GoogleServiceAccount;
  scope: string;
  nowMs: number;
}): Promise<string> {
  let key: CryptoKey;

  try {
    key = await importPKCS8(input.serviceAccount.privateKey, 'RS256');
  } catch {
    throw new ApiError(422, 'ANALYST_CREDENTIAL_INVALID', 'The private key could not be read.', {
      field: 'private_key',
    });
  }

  const issuedAt = Math.floor(input.nowMs / 1000);

  return new SignJWT({ scope: input.scope })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(input.serviceAccount.clientEmail)
    .setAudience(GOOGLE_TOKEN_ENDPOINT)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + JWT_LIFETIME_SECONDS)
    .sign(key);
}

function isBadRequestError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.code === 'ANALYST_UPSTREAM_ERROR' &&
    typeof error.details === 'object' &&
    error.details !== null &&
    (error.details as { status?: unknown }).status === 400
  );
}

export async function exchangeServiceAccountForToken(
  input: {
    serviceAccount: GoogleServiceAccount;
    scope: string;
    nowMs?: number;
  } & GoogleRequestOptions,
): Promise<GoogleAccessToken> {
  const nowMs = input.nowMs ?? Date.now();
  const assertion = await signServiceAccountAssertion({
    serviceAccount: input.serviceAccount,
    scope: input.scope,
    nowMs,
  });
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  }).toString();

  let payload: unknown;
  try {
    payload = await fetchGoogleJson({
      url: GOOGLE_TOKEN_ENDPOINT,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      fetchImpl: input.fetchImpl,
      signal: input.signal,
      timeoutMs: input.timeoutMs,
      retry: input.retry,
    });
  } catch (error) {
    if (isBadRequestError(error)) {
      throw new ApiError(
        401,
        'ANALYST_CREDENTIALS_REJECTED',
        'Google rejected the service account credentials.',
      );
    }

    throw error;
  }

  const record = payload as Record<string, unknown>;
  const accessToken = typeof record.access_token === 'string' ? record.access_token : '';
  const expiresIn = typeof record.expires_in === 'number' ? record.expires_in : 0;

  if (!accessToken) {
    throw new ApiError(502, 'ANALYST_UPSTREAM_ERROR', 'Google returned no access token.');
  }

  return {
    accessToken,
    expiresAt: nowMs + Math.max(expiresIn, 60) * 1000,
  };
}

export interface ResolveGoogleAccessTokenInput extends GoogleRequestOptions {
  db: D1Database;
  source: AnalystGoogleSource;
  serviceAccount: GoogleServiceAccount;
  scope: string;
  now?: Date;
  keyMaterial?: string;
}

export async function resolveGoogleAccessToken(
  input: ResolveGoogleAccessTokenInput,
): Promise<string> {
  const now = input.now ?? new Date();
  const cached = await readCachedGoogleToken(input.db, input.source, input.keyMaterial);

  if (cached && isGoogleTokenFresh(cached, now.getTime())) {
    return cached.accessToken;
  }

  const token = await exchangeServiceAccountForToken({
    serviceAccount: input.serviceAccount,
    scope: input.scope,
    nowMs: now.getTime(),
    fetchImpl: input.fetchImpl,
    signal: input.signal,
    timeoutMs: input.timeoutMs,
    retry: input.retry,
  });

  await writeCachedGoogleToken(input.db, input.source, token, input.keyMaterial);

  return token.accessToken;
}
