import { describe, expect, it, vi } from 'vitest';
import { loadCoverImage, resolveSameOriginCoverUrl } from './cover';

const REQUEST_URL = new URL('https://lightscripts.com/og/how-to-choose-a-monitor-arm.png');
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]).buffer;
const TEXT_BYTES = new TextEncoder().encode('<html>not an image</html>').buffer;

function createBucket(storedObjects: Record<string, ArrayBuffer>): R2Bucket {
  return {
    get: vi.fn(async (key: string) => {
      const storedBytes = storedObjects[key];
      return storedBytes ? { arrayBuffer: async () => storedBytes } : null;
    }),
  } as unknown as R2Bucket;
}

function createAssets(responseBody: ArrayBuffer | null): Fetcher {
  return {
    fetch: vi.fn(async () =>
      responseBody ? new Response(responseBody) : new Response('missing', { status: 404 }),
    ),
  } as unknown as Fetcher;
}

describe('resolveSameOriginCoverUrl', () => {
  it('resolves a root-relative cover against the request origin', () => {
    expect(resolveSameOriginCoverUrl('/media/a.jpg', REQUEST_URL)?.href).toBe(
      'https://lightscripts.com/media/a.jpg',
    );
  });

  it('rejects a cover on another origin', () => {
    expect(resolveSameOriginCoverUrl('https://example.com/a.jpg', REQUEST_URL)).toBeNull();
  });
});

describe('loadCoverImage', () => {
  it('reads the cover from the media bucket first', async () => {
    const assets = createAssets(null);
    const coverImage = await loadCoverImage({
      coverUrl: '/media/a.jpg',
      requestUrl: REQUEST_URL,
      bucket: createBucket({ 'media/a.jpg': JPEG_BYTES }),
      assets,
    });

    expect(coverImage).toBe(JPEG_BYTES);
    expect(assets.fetch).not.toHaveBeenCalled();
  });

  it('falls back to the static assets when the bucket has no object', async () => {
    const coverImage = await loadCoverImage({
      coverUrl: '/media/a.jpg',
      requestUrl: REQUEST_URL,
      bucket: createBucket({}),
      assets: createAssets(JPEG_BYTES),
    });

    expect(coverImage && new Uint8Array(coverImage)).toEqual(new Uint8Array(JPEG_BYTES));
  });

  it('returns null for a post without a cover', async () => {
    const assets = createAssets(JPEG_BYTES);
    const coverImage = await loadCoverImage({
      coverUrl: null,
      requestUrl: REQUEST_URL,
      bucket: null,
      assets,
    });

    expect(coverImage).toBeNull();
    expect(assets.fetch).not.toHaveBeenCalled();
  });

  it('returns null when the cover is missing everywhere', async () => {
    const coverImage = await loadCoverImage({
      coverUrl: '/media/a.jpg',
      requestUrl: REQUEST_URL,
      bucket: createBucket({}),
      assets: createAssets(null),
    });

    expect(coverImage).toBeNull();
  });

  it('returns null when the bytes are not a renderable image', async () => {
    const coverImage = await loadCoverImage({
      coverUrl: '/media/a.jpg',
      requestUrl: REQUEST_URL,
      bucket: createBucket({ 'media/a.jpg': TEXT_BYTES }),
      assets: null,
    });

    expect(coverImage).toBeNull();
  });

  it('returns null instead of throwing when loading fails', async () => {
    const failingBucket = {
      get: vi.fn(async () => {
        throw new Error('bucket offline');
      }),
    } as unknown as R2Bucket;
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const coverImage = await loadCoverImage({
      coverUrl: '/media/a.jpg',
      requestUrl: REQUEST_URL,
      bucket: failingBucket,
      assets: null,
    });

    expect(coverImage).toBeNull();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
