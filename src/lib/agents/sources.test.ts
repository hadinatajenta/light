import { describe, expect, it } from 'vitest';
import { renderSourcesForPrompt, type SourceRecord } from './sources';

function buildSource(overrides: Partial<SourceRecord> = {}): SourceRecord {
  return {
    id: 'source-1',
    topicId: 'topic-1',
    agentId: null,
    kind: 'source',
    heading: 'Seat height range',
    detail: 'Seat height adjusts from 16 to 21 inches.',
    reference: null,
    url: null,
    quote: null,
    verified: true,
    accessedAt: null,
    sourceType: null,
    angle: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('renderSourcesForPrompt', () => {
  it('returns an empty string when there are no sources', () => {
    expect(renderSourcesForPrompt([])).toBe('');
  });

  it('includes the url, source type, and angle when present', () => {
    const rendered = renderSourcesForPrompt([
      buildSource({
        url: 'https://example.com/report',
        sourceType: 'government',
        angle: 'ergonomic standards',
      }),
    ]);

    expect(rendered).toContain('https://example.com/report');
    expect(rendered).toContain('type: government');
    expect(rendered).toContain('angle: ergonomic standards');
  });

  it('renders a gap row readably', () => {
    const rendered = renderSourcesForPrompt([
      buildSource({
        kind: 'gap',
        heading: 'Recycled content threshold',
        detail: 'No verified source covered the recycled content angle.',
        url: null,
        reference: null,
        sourceType: null,
        angle: null,
        verified: false,
      }),
    ]);

    expect(rendered).toBe(
      '- [gap] Recycled content threshold: No verified source covered the recycled content angle.',
    );
  });

  it('omits the metadata segment when source type and angle are absent', () => {
    const rendered = renderSourcesForPrompt([buildSource({ url: 'https://example.com/a' })]);

    expect(rendered).not.toContain('type:');
    expect(rendered).not.toContain('angle:');
  });
});
