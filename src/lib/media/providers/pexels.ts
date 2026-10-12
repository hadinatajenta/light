import { ApiError } from '../../http';
import { type ImageSearchResult, MEDIA_USER_AGENT } from '../search';

export const PEXELS_ENDPOINT = 'https://api.pexels.com/v1/search';
export const PEXELS_LICENSE = 'Pexels License';
export const PEXELS_LICENSE_URL = 'https://www.pexels.com/license/';
export const PEXELS_PAGE_SIZE = 20;

const REQUEST_TIMEOUT_MS = 10_000;

interface PexelsPhoto {
  id?: unknown;
  alt?: unknown;
  url?: unknown;
  photographer?: unknown;
  photographer_url?: unknown;
  src?: unknown;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readIdentifier(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return readString(value);
}

function readSourceUrl(source: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = readString(source[key]);
    if (value) {
      return value;
    }
  }

  return null;
}

export function toPexelsResult(photo: unknown): ImageSearchResult | null {
  if (typeof photo !== 'object' || photo === null) {
    return null;
  }

  const entry = photo as PexelsPhoto;
  if (typeof entry.src !== 'object' || entry.src === null) {
    return null;
  }

  const source = entry.src as Record<string, unknown>;
  const imageUrl = readSourceUrl(source, ['large2x', 'large', 'original']);
  if (!imageUrl) {
    return null;
  }

  const thumbnailUrl = readSourceUrl(source, ['large', 'medium', 'small']) ?? imageUrl;
  const creator = readString(entry.photographer);
  const id = readIdentifier(entry.id);

  return {
    id: `pexels:${id ?? imageUrl}`,
    title: readString(entry.alt) ?? (creator ? `Photo by ${creator} on Pexels` : 'Photo on Pexels'),
    thumbnailUrl,
    imageUrl,
    creator,
    creatorUrl: readString(entry.photographer_url),
    license: PEXELS_LICENSE,
    licenseUrl: PEXELS_LICENSE_URL,
    sourceUrl: readString(entry.url),
    provider: 'pexels',
  };
}

export async function searchPexelsImages(
  query: string,
  page: number,
  apiKey: string,
): Promise<{ results: ImageSearchResult[]; total: number }> {
  const endpoint = new URL(PEXELS_ENDPOINT);
  endpoint.searchParams.set('query', query);
  endpoint.searchParams.set('page', String(page));
  endpoint.searchParams.set('per_page', String(PEXELS_PAGE_SIZE));

  let response: Response;
  try {
    response = await fetch(endpoint, {
      headers: {
        Authorization: apiKey,
        'User-Agent': MEDIA_USER_AGENT,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new ApiError(502, 'IMAGE_SEARCH_FAILED', 'The image search service is unavailable.');
  }

  if (response.status === 429) {
    throw new ApiError(
      502,
      'IMAGE_SEARCH_FAILED',
      'The Pexels rate limit was reached. Try again in a few minutes.',
    );
  }

  if (!response.ok) {
    throw new ApiError(502, 'IMAGE_SEARCH_FAILED', 'The image search service returned an error.');
  }

  let payload: { photos?: unknown; total_results?: unknown };
  try {
    payload = (await response.json()) as { photos?: unknown; total_results?: unknown };
  } catch {
    throw new ApiError(
      502,
      'IMAGE_SEARCH_FAILED',
      'The image search service returned invalid data.',
    );
  }

  const rawPhotos = Array.isArray(payload.photos) ? payload.photos : [];
  const results = rawPhotos
    .map(toPexelsResult)
    .filter((result): result is ImageSearchResult => result !== null);
  const total = typeof payload.total_results === 'number' ? payload.total_results : results.length;

  return { results, total };
}
