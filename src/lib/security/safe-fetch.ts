import { ApiError } from '../errors';

const IPV4_PATTERN = /^\d{1,3}(\.\d{1,3}){3}$/;
const DECIMAL_HOST_PATTERN = /^\d+$/;
const HEX_HOST_PATTERN = /^0x[0-9a-f]+$/;

export interface UrlGuardConfig {
  allowedProtocols: readonly string[];
  rejectCode: string;
  label: string;
}

const DEFAULT_URL_GUARD: UrlGuardConfig = {
  allowedProtocols: ['https:'],
  rejectCode: 'URL_REJECTED',
  label: 'URL',
};

export function isIpLiteral(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host.startsWith('[') || host.includes(':')) {
    return true;
  }
  if (IPV4_PATTERN.test(host)) {
    return true;
  }
  if (DECIMAL_HOST_PATTERN.test(host)) {
    return true;
  }
  return HEX_HOST_PATTERN.test(host);
}

export function isForbiddenHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost')) {
    return true;
  }
  if (host.endsWith('.local') || host.endsWith('.internal')) {
    return true;
  }
  return isIpLiteral(host);
}

export function assertAllowedUrl(rawUrl: string, config: Partial<UrlGuardConfig> = {}): URL {
  const { allowedProtocols, rejectCode, label } = { ...DEFAULT_URL_GUARD, ...config };

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new ApiError(422, rejectCode, `The ${label} URL is not valid.`);
  }

  if (!allowedProtocols.includes(parsed.protocol)) {
    const schemes = allowedProtocols.map((protocol) => protocol.replace(':', '')).join(' or ');
    throw new ApiError(422, rejectCode, `Only ${schemes} ${label} URLs are allowed.`);
  }

  if (parsed.username.length > 0 || parsed.password.length > 0) {
    throw new ApiError(422, rejectCode, `${label} URLs with credentials are not allowed.`);
  }

  if (isForbiddenHostname(parsed.hostname)) {
    throw new ApiError(422, rejectCode, `That ${label} host is not allowed.`);
  }

  return parsed;
}

export async function readCappedBytes(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array | null> {
  const body = response.body;

  if (!body) {
    const buffer = new Uint8Array(await response.arrayBuffer());
    return buffer.byteLength > maxBytes ? null : buffer;
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (!value) {
      continue;
    }
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return merged;
}
