import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  env: { AGENT_CRON_TOKEN: 'sekret-token' } as Record<string, string | undefined>,
}));

vi.mock('cloudflare:workers', () => ({ env: state.env }));

import { isAuthorized, requireCronAuthorization, tokensMatch } from './cron-auth';

function requestWith(token: string | null): Request {
  const headers = new Headers();
  if (token !== null) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return new Request('https://lightscripts.com/api/agents/share-due', {
    method: 'POST',
    headers,
  });
}

describe('tokensMatch', () => {
  it('matches equal tokens and rejects different ones', async () => {
    await expect(tokensMatch('abc', 'abc')).resolves.toBe(true);
    await expect(tokensMatch('abc', 'abd')).resolves.toBe(false);
    await expect(tokensMatch('abc', 'abcd')).resolves.toBe(false);
  });
});

describe('isAuthorized', () => {
  it('accepts a matching bearer token', async () => {
    await expect(isAuthorized(requestWith('sekret-token'), 'sekret-token')).resolves.toBe(true);
  });

  it('rejects a missing or malformed header', async () => {
    await expect(isAuthorized(requestWith(null), 'sekret-token')).resolves.toBe(false);
    const raw = new Request('https://lightscripts.com/x', {
      method: 'POST',
      headers: { Authorization: 'Token sekret-token' },
    });
    await expect(isAuthorized(raw, 'sekret-token')).resolves.toBe(false);
  });

  it('rejects an empty token after the prefix', async () => {
    const raw = new Request('https://lightscripts.com/x', {
      method: 'POST',
      headers: { Authorization: 'Bearer    ' },
    });
    await expect(isAuthorized(raw, 'sekret-token')).resolves.toBe(false);
  });

  it('rejects a wrong token', async () => {
    await expect(isAuthorized(requestWith('wrong'), 'sekret-token')).resolves.toBe(false);
  });
});

describe('requireCronAuthorization', () => {
  it('resolves for a valid token', async () => {
    state.env.AGENT_CRON_TOKEN = 'sekret-token';
    await expect(requireCronAuthorization(requestWith('sekret-token'))).resolves.toBeUndefined();
  });

  it('rejects an invalid token with a 401', async () => {
    state.env.AGENT_CRON_TOKEN = 'sekret-token';
    await expect(requireCronAuthorization(requestWith('nope'))).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHENTICATED',
    });
  });

  it('rejects with a 503 when the token is not configured', async () => {
    state.env.AGENT_CRON_TOKEN = undefined;
    await expect(requireCronAuthorization(requestWith('anything'))).rejects.toMatchObject({
      status: 503,
      code: 'CRON_TOKEN_MISSING',
    });
  });
});
