import { describe, expect, it } from 'vitest';
import { stripProductReferences, stripWriterEnvelope } from './envelope';

const ARTICLE = `## Why the clamp matters

A clamp that is too narrow will not hold under a heavy desk. Measure the desk thickness first.

## What to check before buying

Check the clamp range, the vertical travel, and the keyboard platform depth.`;

describe('stripWriterEnvelope', () => {
  it('removes a title and description envelope and keeps the article', () => {
    const body = `Title: How to choose a keyboard tray

Description: Measure your elbow height before you buy a tray.

${ARTICLE}`;

    expect(stripWriterEnvelope(body)).toBe(ARTICLE);
  });

  it('removes a body, tags, and editor notes label after the envelope', () => {
    const body = `Title: How to choose a keyboard tray

Description: Measure your elbow height before you buy a tray.

Body:

${ARTICLE}`;

    expect(stripWriterEnvelope(body)).toBe(ARTICLE);
  });

  it('removes an envelope whose description runs over several lines', () => {
    const body = `Title: How to choose a keyboard tray

Description: Measure your elbow height before you buy a tray, then check the clamp,
the travel, and the platform depth.

${ARTICLE}`;

    expect(stripWriterEnvelope(body)).toBe(ARTICLE);
  });

  it('leaves a body that already starts with a heading unchanged', () => {
    expect(stripWriterEnvelope(ARTICLE)).toBe(ARTICLE);
  });

  it('leaves a body that only mentions the word title unchanged', () => {
    const body = `## Choosing a title for your desk

A short paragraph that happens to use the word title, followed by enough text to
pass the length guard so the helper cannot mistake the sentence for an envelope.
${ARTICLE}`;

    expect(stripWriterEnvelope(body)).toBe(body);
  });

  it('keeps the original when stripping would leave too little text', () => {
    const body = 'Title: Short\n\nDescription: Too short to be a real article.';

    expect(stripWriterEnvelope(body)).toBe(body);
  });

  it('keeps the original when the description is missing', () => {
    const body = `Title: A heading that is not an envelope

${ARTICLE}`;

    expect(stripWriterEnvelope(body)).toBe(body);
  });
});

describe('stripProductReferences', () => {
  it('replaces a single product reference with its link text', () => {
    expect(stripProductReferences('Buy [the Aeron](product:aeron) today.')).toBe(
      'Buy the Aeron today.',
    );
  });

  it('replaces several references in one body', () => {
    const body = 'The [Aeron](product:aeron) and the [Embody](product:embody) both work.';

    expect(stripProductReferences(body)).toBe('The Aeron and the Embody both work.');
  });

  it('keeps the punctuation around a replaced reference', () => {
    expect(stripProductReferences('See [the clamp](product:desk-clamp), then measure.')).toBe(
      'See the clamp, then measure.',
    );
  });

  it('leaves an ordinary internal link untouched', () => {
    const body = 'Read [the monitor guide](/blog/monitor-distance-guide/).';

    expect(stripProductReferences(body)).toBe(body);
  });

  it('leaves an external link untouched', () => {
    const body = 'See [ISO 9241](https://www.iso.org/standard/16818.html).';

    expect(stripProductReferences(body)).toBe(body);
  });

  it('leaves a malformed or unterminated reference untouched without throwing', () => {
    const body = 'Maybe [the Aeron](product:aeron and [the Embody](product:) here.';

    expect(() => stripProductReferences(body)).not.toThrow();
    expect(stripProductReferences(body)).toBe(body);
  });

  it('is idempotent', () => {
    const body = 'Buy [the Aeron](product:aeron), not [a copy](product:aeron-clone).';
    const once = stripProductReferences(body);

    expect(stripProductReferences(once)).toBe(once);
  });
});
