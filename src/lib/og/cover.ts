import { detectImageExtension, type ImageExtension } from '../media/image-type';

const MEDIA_PATH_PREFIX = '/media/';
const MAX_COVER_BYTES = 5 * 1024 * 1024;
const COVER_FETCH_TIMEOUT_MS = 5000;
const RENDERABLE_EXTENSIONS: ReadonlySet<ImageExtension> = new Set(['jpg', 'png']);

export interface CoverLoadOptions {
  coverUrl: string | null;
  requestUrl: URL;
  bucket: R2Bucket | null;
  assets: Fetcher | null;
}

type CoverFetcher = (url: string, init: RequestInit) => Promise<Response>;

function toRenderableCover(bytes: ArrayBuffer): ArrayBuffer | null {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_COVER_BYTES) {
    return null;
  }

  const extension = detectImageExtension(new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 16)));
  return extension && RENDERABLE_EXTENSIONS.has(extension) ? bytes : null;
}

async function readCoverFromBucket(
  bucket: R2Bucket,
  pathname: string,
): Promise<ArrayBuffer | null> {
  const coverObject = await bucket.get(pathname.replace(/^\/+/, ''));
  return coverObject ? coverObject.arrayBuffer() : null;
}

async function readCoverOverHttp(
  coverUrl: URL,
  fetchCover: CoverFetcher,
): Promise<ArrayBuffer | null> {
  const response = await fetchCover(coverUrl.toString(), {
    signal: AbortSignal.timeout(COVER_FETCH_TIMEOUT_MS),
  });
  return response.ok ? response.arrayBuffer() : null;
}

export function resolveSameOriginCoverUrl(coverUrl: string, requestUrl: URL): URL | null {
  try {
    const resolvedUrl = new URL(coverUrl, requestUrl.origin);
    return resolvedUrl.origin === requestUrl.origin ? resolvedUrl : null;
  } catch {
    return null;
  }
}

async function readCoverBytes(
  coverUrl: URL,
  bucket: R2Bucket | null,
  fetchCover: CoverFetcher,
): Promise<ArrayBuffer | null> {
  if (bucket && coverUrl.pathname.startsWith(MEDIA_PATH_PREFIX)) {
    const bucketCover = await readCoverFromBucket(bucket, coverUrl.pathname);
    if (bucketCover) {
      return bucketCover;
    }
  }

  return readCoverOverHttp(coverUrl, fetchCover);
}

export async function loadCoverImage(options: CoverLoadOptions): Promise<ArrayBuffer | null> {
  const coverUrl = options.coverUrl
    ? resolveSameOriginCoverUrl(options.coverUrl, options.requestUrl)
    : null;
  if (!coverUrl) {
    return null;
  }

  try {
    const { assets } = options;
    const fetchCover: CoverFetcher = assets
      ? (url, init) => assets.fetch(url, init)
      : (url, init) => fetch(url, init);
    const coverBytes = await readCoverBytes(coverUrl, options.bucket, fetchCover);
    return coverBytes ? toRenderableCover(coverBytes) : null;
  } catch (error) {
    console.error('Failed to load an OG card cover', error);
    return null;
  }
}
