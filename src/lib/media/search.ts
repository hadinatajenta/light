import { ApiError } from '../http';
import { assertAllowedUrl, readCappedBytes } from '../security/safe-fetch';
import { detectImageExtension } from './image-type';

export const OPENVERSE_ENDPOINT = 'https://api.openverse.org/v1/images/';
export const IMAGE_SEARCH_PAGE_SIZE = 24;

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_DOWNLOAD_BYTES = 5 * 1024 * 1024;
const USER_AGENT = 'LightMediaBot/1.0 (+https://lightscripts.com)';
const OPENVERSE_ANONYMOUS_PAGE_SIZE_MAX = 20;

const IMAGE_URL_GUARD = {
  allowedProtocols: ['https:'],
  rejectCode: 'IMAGE_URL_REJECTED',
  label: 'image',
};

export interface ImageSearchResult {
  id: string;
  title: string;
  thumbnailUrl: string;
  imageUrl: string;
  creator: string | null;
  creatorUrl: string | null;
  license: string;
  licenseUrl: string | null;
  sourceUrl: string | null;
}

interface OpenverseImage {
  id?: unknown;
  title?: unknown;
  thumbnail?: unknown;
  url?: unknown;
  creator?: unknown;
  creator_url?: unknown;
  license?: unknown;
  license_url?: unknown;
  foreign_landing_url?: unknown;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function toSearchResult(entry: OpenverseImage): ImageSearchResult | null {
  const imageUrl = readString(entry.url);
  if (!imageUrl) {
    return null;
  }

  return {
    id: readString(entry.id) ?? imageUrl,
    title: readString(entry.title) ?? 'Untitled image',
    thumbnailUrl: readString(entry.thumbnail) ?? imageUrl,
    imageUrl,
    creator: readString(entry.creator),
    creatorUrl: readString(entry.creator_url),
    license: readString(entry.license) ?? 'unknown',
    licenseUrl: readString(entry.license_url),
    sourceUrl: readString(entry.foreign_landing_url),
  };
}

export async function searchImages(
  query: string,
  page: number,
): Promise<{ results: ImageSearchResult[]; total: number }> {
  const endpoint = new URL(OPENVERSE_ENDPOINT);
  endpoint.searchParams.set('q', query);
  endpoint.searchParams.set('page', String(page));
  endpoint.searchParams.set(
    'page_size',
    String(Math.min(IMAGE_SEARCH_PAGE_SIZE, OPENVERSE_ANONYMOUS_PAGE_SIZE_MAX)),
  );
  endpoint.searchParams.set('license_type', 'commercial');
  endpoint.searchParams.set('mature', 'false');

  let response: Response;
  try {
    response = await fetch(endpoint, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new ApiError(502, 'IMAGE_SEARCH_FAILED', 'The image search service is unavailable.');
  }

  if (!response.ok) {
    throw new ApiError(502, 'IMAGE_SEARCH_FAILED', 'The image search service returned an error.');
  }

  let payload: { results?: unknown; result_count?: unknown };
  try {
    payload = (await response.json()) as { results?: unknown; result_count?: unknown };
  } catch {
    throw new ApiError(
      502,
      'IMAGE_SEARCH_FAILED',
      'The image search service returned invalid data.',
    );
  }

  const rawResults = Array.isArray(payload.results) ? (payload.results as OpenverseImage[]) : [];
  const results = rawResults
    .map(toSearchResult)
    .filter((result): result is ImageSearchResult => result !== null);

  const total = typeof payload.result_count === 'number' ? payload.result_count : results.length;

  return { results, total };
}

export async function downloadImageBytes(imageUrl: string): Promise<Uint8Array> {
  const initial = assertAllowedUrl(imageUrl, IMAGE_URL_GUARD);

  let response: Response;
  try {
    response = await fetch(initial, {
      redirect: 'follow',
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new ApiError(502, 'IMAGE_DOWNLOAD_FAILED', 'The image could not be downloaded.');
  }

  if (!response.ok) {
    throw new ApiError(502, 'IMAGE_DOWNLOAD_FAILED', 'The image could not be downloaded.');
  }

  assertAllowedUrl(response.url, IMAGE_URL_GUARD);

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.startsWith('image/')) {
    throw new ApiError(422, 'IMAGE_URL_REJECTED', 'The URL does not point to an image.');
  }

  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_DOWNLOAD_BYTES) {
    throw new ApiError(413, 'FILE_TOO_LARGE', 'Images must be 5 MB or smaller.');
  }

  const bytes = await readCappedBytes(response, MAX_DOWNLOAD_BYTES);
  if (!bytes) {
    throw new ApiError(413, 'FILE_TOO_LARGE', 'Images must be 5 MB or smaller.');
  }

  if (!detectImageExtension(bytes)) {
    throw new ApiError(422, 'IMAGE_URL_REJECTED', 'The downloaded file is not a supported image.');
  }

  return bytes;
}
