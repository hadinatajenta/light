import { describe, expect, it } from 'vitest';
import type { ImageSearchResult } from '../search';
import { toPexelsResult } from './pexels';
import { isImageProviderId, providerLabel, resolveImageProviderOrder } from './registry';

const PHOTO = {
  id: 12345,
  alt: 'A tidy desk',
  url: 'https://www.pexels.com/photo/12345/',
  photographer: 'Ada Lovelace',
  photographer_url: 'https://www.pexels.com/@ada',
  src: {
    original: 'https://images.pexels.com/photos/12345/original.jpg',
    large2x: 'https://images.pexels.com/photos/12345/large2x.jpg',
    large: 'https://images.pexels.com/photos/12345/large.jpg',
    medium: 'https://images.pexels.com/photos/12345/medium.jpg',
  },
};

describe('toPexelsResult', () => {
  it('maps a full photo entry', () => {
    const result = toPexelsResult(PHOTO) as ImageSearchResult;

    expect(result.id).toBe('pexels:12345');
    expect(result.title).toBe('A tidy desk');
    expect(result.imageUrl).toBe('https://images.pexels.com/photos/12345/large2x.jpg');
    expect(result.thumbnailUrl).toBe('https://images.pexels.com/photos/12345/large.jpg');
    expect(result.creator).toBe('Ada Lovelace');
    expect(result.creatorUrl).toBe('https://www.pexels.com/@ada');
    expect(result.license).toBe('Pexels License');
    expect(result.sourceUrl).toBe('https://www.pexels.com/photo/12345/');
    expect(result.provider).toBe('pexels');
  });

  it('falls back to a photographer title when alt is missing', () => {
    const result = toPexelsResult({ ...PHOTO, alt: null }) as ImageSearchResult;

    expect(result.title).toBe('Photo by Ada Lovelace on Pexels');
  });

  it('falls back to the original image and the image itself for the thumbnail', () => {
    const result = toPexelsResult({
      ...PHOTO,
      src: { original: 'https://images.pexels.com/photos/12345/original.jpg' },
    }) as ImageSearchResult;

    expect(result.imageUrl).toBe('https://images.pexels.com/photos/12345/original.jpg');
    expect(result.thumbnailUrl).toBe('https://images.pexels.com/photos/12345/original.jpg');
  });

  it('rejects entries without a usable source', () => {
    expect(toPexelsResult(null)).toBeNull();
    expect(toPexelsResult('nope')).toBeNull();
    expect(toPexelsResult({ id: 1 })).toBeNull();
    expect(
      toPexelsResult({ ...PHOTO, src: { tiny: 'https://images.pexels.com/tiny.jpg' } }),
    ).toBeNull();
  });
});

describe('resolveImageProviderOrder', () => {
  it('prefers Pexels when a key is configured', () => {
    expect(resolveImageProviderOrder(true)).toEqual(['pexels', 'openverse']);
  });

  it('uses Openverse alone without a key', () => {
    expect(resolveImageProviderOrder(false)).toEqual(['openverse']);
  });
});

describe('provider helpers', () => {
  it('recognises known provider ids', () => {
    expect(isImageProviderId('pexels')).toBe(true);
    expect(isImageProviderId('openverse')).toBe(true);
    expect(isImageProviderId('unsplash')).toBe(false);
  });

  it('labels providers', () => {
    expect(providerLabel('pexels')).toBe('Pexels');
    expect(providerLabel('openverse')).toBe('Openverse');
  });
});
