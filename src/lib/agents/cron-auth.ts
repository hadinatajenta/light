import { ApiError } from '../errors';

const BEARER_PREFIX = 'Bearer ';

interface TimingSafeSubtleCrypto extends SubtleCrypto {
  timingSafeEqual?: (first: BufferSource, second: BufferSource) => boolean;
}

export async function readCronToken(): Promise<string | null> {
  try {
    const { env } = await import('cloudflare:workers');
    return (env as unknown as { AGENT_CRON_TOKEN?: string }).AGENT_CRON_TOKEN ?? null;
  } catch {
    return null;
  }
}

async function sha256(value: string): Promise<Uint8Array<ArrayBuffer>> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return new Uint8Array(digest);
}

function compareBytes(first: Uint8Array, second: Uint8Array): boolean {
  let mismatch = 0;
  for (let index = 0; index < first.length; index += 1) {
    mismatch |= first[index] ^ second[index];
  }

  return mismatch === 0;
}

export async function tokensMatch(provided: string, expected: string): Promise<boolean> {
  const [providedDigest, expectedDigest] = await Promise.all([sha256(provided), sha256(expected)]);

  const subtle = crypto.subtle as TimingSafeSubtleCrypto;
  if (typeof subtle.timingSafeEqual === 'function') {
    return subtle.timingSafeEqual(providedDigest, expectedDigest);
  }

  return compareBytes(providedDigest, expectedDigest);
}

export async function isAuthorized(request: Request, expectedToken: string): Promise<boolean> {
  const header = request.headers.get('Authorization');
  if (!header?.startsWith(BEARER_PREFIX)) {
    return false;
  }

  const providedToken = header.slice(BEARER_PREFIX.length).trim();
  if (!providedToken) {
    return false;
  }

  return tokensMatch(providedToken, expectedToken);
}

export async function requireCronAuthorization(request: Request): Promise<void> {
  const expectedToken = await readCronToken();
  if (!expectedToken) {
    throw new ApiError(503, 'CRON_TOKEN_MISSING', 'The agent cron token is not configured.');
  }

  if (!(await isAuthorized(request, expectedToken))) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'A valid bearer token is required.');
  }
}
