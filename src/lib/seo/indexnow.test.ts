import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  env: {} as Record<string, string | undefined>,
}));

vi.mock('cloudflare:workers', () => ({ env: state.env }));

import { buildIndexNowPayload, notifyIndexNow, toIndexNowUrl } from './indexnow';

afterEach(() => {
  vi.restoreAllMocks();
  state.env.INDEXNOW_KEY = undefined;
});

describe('buildIndexNowPayload', () => {
  it('serializes the host, key, key location, and url list', () => {
    const payload = buildIndexNowPayload(
      'lightscripts.com',
      'abc123',
      'https://lightscripts.com/indexnow.txt',
      ['https://lightscripts.com/blog/a/'],
    );

    expect(JSON.parse(payload)).toEqual({
      host: 'lightscripts.com',
      key: 'abc123',
      keyLocation: 'https://lightscripts.com/indexnow.txt',
      urlList: ['https://lightscripts.com/blog/a/'],
    });
  });
});

describe('toIndexNowUrl', () => {
  it('joins an absolute path onto the origin', () => {
    expect(toIndexNowUrl('https://lightscripts.com', '/blog/a/')).toBe(
      'https://lightscripts.com/blog/a/',
    );
  });

  it('adds the missing separator when the path has no leading slash', () => {
    expect(toIndexNowUrl('https://lightscripts.com', 'blog/a/')).toBe(
      'https://lightscripts.com/blog/a/',
    );
  });
});

describe('notifyIndexNow', () => {
  it('returns false without calling fetch when no key is configured', async () => {
    const fetchMock = vi.fn();

    await expect(
      notifyIndexNow(['/blog/a/'], { fetchImpl: fetchMock as unknown as typeof fetch }),
    ).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts the payload to the endpoint and returns true on a 2xx', async () => {
    state.env.INDEXNOW_KEY = 'abc123';
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) => new Response('', { status: 200 }),
    );

    const result = await notifyIndexNow(['/blog/a/'], {
      origin: 'https://lightscripts.com',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(result).toBe(true);
    const call = fetchMock.mock.calls[0];
    expect(call?.[0]).toBe('https://api.indexnow.org/indexnow');
    const body = JSON.parse(String(call?.[1]?.body)) as Record<string, unknown>;
    expect(body.host).toBe('lightscripts.com');
    expect(body.key).toBe('abc123');
    expect(body.keyLocation).toBe('https://lightscripts.com/indexnow.txt');
    expect(body.urlList).toEqual(['https://lightscripts.com/blog/a/']);
  });

  it('returns false on a non-2xx response', async () => {
    state.env.INDEXNOW_KEY = 'abc123';
    const fetchMock = vi.fn(async () => new Response('', { status: 500 }));

    await expect(
      notifyIndexNow(['/blog/a/'], { fetchImpl: fetchMock as unknown as typeof fetch }),
    ).resolves.toBe(false);
  });

  it('returns false without throwing when the request fails', async () => {
    state.env.INDEXNOW_KEY = 'abc123';
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchMock = vi.fn(async () => {
      throw new Error('network down');
    });

    await expect(
      notifyIndexNow(['/blog/a/'], { fetchImpl: fetchMock as unknown as typeof fetch }),
    ).resolves.toBe(false);
  });

  it('returns false for a non-https path', async () => {
    state.env.INDEXNOW_KEY = 'abc123';
    const fetchMock = vi.fn(async () => new Response('', { status: 200 }));

    await expect(
      notifyIndexNow(['http://insecure.test/x'], {
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    ).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
