import { describe, expect, it } from 'vitest';
import { stripWriterEnvelope } from './envelope';

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
