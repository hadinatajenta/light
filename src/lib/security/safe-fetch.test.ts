import { describe, expect, it } from 'vitest';
import { assertAllowedUrl, isForbiddenHostname, isIpLiteral } from './safe-fetch';

describe('isIpLiteral', () => {
  it('treats ipv4, ipv6, decimal, and hex hosts as literals', () => {
    expect(isIpLiteral('10.0.0.1')).toBe(true);
    expect(isIpLiteral('[::1]')).toBe(true);
    expect(isIpLiteral('2130706433')).toBe(true);
    expect(isIpLiteral('0x7f000001')).toBe(true);
    expect(isIpLiteral('example.com')).toBe(false);
  });
});

describe('isForbiddenHostname', () => {
  it('rejects localhost, internal, and ip literals', () => {
    expect(isForbiddenHostname('localhost')).toBe(true);
    expect(isForbiddenHostname('api.localhost')).toBe(true);
    expect(isForbiddenHostname('db.internal')).toBe(true);
    expect(isForbiddenHostname('printer.local')).toBe(true);
    expect(isForbiddenHostname('127.0.0.1')).toBe(true);
    expect(isForbiddenHostname('example.com')).toBe(false);
  });
});

describe('assertAllowedUrl', () => {
  it('accepts a public https url', () => {
    expect(assertAllowedUrl('https://example.com/guide').hostname).toBe('example.com');
  });

  it('rejects a non-http protocol', () => {
    expect(() => assertAllowedUrl('ftp://example.com')).toThrow(/Only https/);
  });

  it('rejects credentials in the url', () => {
    expect(() => assertAllowedUrl('https://user:pass@example.com')).toThrow(/credentials/);
  });

  it('rejects internal hosts', () => {
    expect(() => assertAllowedUrl('https://localhost/x')).toThrow(/host is not allowed/);
  });

  it('rejects an unparseable url', () => {
    expect(() => assertAllowedUrl('not a url')).toThrow(/is not valid/);
  });

  it('uses the configured reject code and label', () => {
    try {
      assertAllowedUrl('ftp://example.com', {
        rejectCode: 'SOURCE_URL_REJECTED',
        label: 'source',
        allowedProtocols: ['https:'],
      });
      expect.unreachable('the guard should have thrown');
    } catch (error) {
      expect((error as { code: string }).code).toBe('SOURCE_URL_REJECTED');
      expect((error as Error).message).toContain('source');
    }
  });

  it('allows http when both protocols are configured', () => {
    const parsed = assertAllowedUrl('http://example.com', {
      allowedProtocols: ['http:', 'https:'],
    });
    expect(parsed.protocol).toBe('http:');
  });
});
