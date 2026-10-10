import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, maskSecret } from './secrets';

const KEY_MATERIAL = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));

describe('encryptSecret and decryptSecret', () => {
  it('round-trips a value', async () => {
    const encrypted = await encryptSecret('sk-test-1234567890', KEY_MATERIAL);
    expect(encrypted).not.toContain('sk-test');
    await expect(decryptSecret(encrypted, KEY_MATERIAL)).resolves.toBe('sk-test-1234567890');
  });

  it('produces a different payload on each call', async () => {
    const first = await encryptSecret('same-value', KEY_MATERIAL);
    const second = await encryptSecret('same-value', KEY_MATERIAL);
    expect(first).not.toBe(second);
  });

  it('fails to decrypt with a different key', async () => {
    const otherKey = btoa(String.fromCharCode(...new Uint8Array(32).fill(9)));
    const encrypted = await encryptSecret('secret', KEY_MATERIAL);
    await expect(decryptSecret(encrypted, otherKey)).rejects.toMatchObject({
      code: 'SECRET_DECRYPT_FAILED',
    });
  });

  it('rejects a corrupt payload', async () => {
    await expect(decryptSecret('not-json', KEY_MATERIAL)).rejects.toMatchObject({
      code: 'SECRET_CORRUPT',
    });
    await expect(decryptSecret('{"iv":"x"}', KEY_MATERIAL)).rejects.toMatchObject({
      code: 'SECRET_CORRUPT',
    });
  });
});

describe('maskSecret', () => {
  it('keeps a short prefix and suffix only', () => {
    expect(maskSecret('sk-abcdefghijklmnop')).toBe('sk-••••mnop');
  });

  it('fully masks a short value', () => {
    expect(maskSecret('short')).toBe('••••');
  });
});
