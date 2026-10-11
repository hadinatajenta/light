import { describe, expect, it } from 'vitest';
import { buildScenePrompt, stripProductCodes, toSceneSubject } from './prompt';

describe('stripProductCodes', () => {
  it('removes an ASIN and a SKU', () => {
    expect(stripProductCodes('Monitor arm ASIN B08612WQZT for SKU MA-200')).toBe('Monitor arm for');
  });

  it('removes a bare B0 style identifier', () => {
    expect(stripProductCodes('Desk B08XYZ1234 clamp')).toBe('Desk clamp');
  });
});

describe('toSceneSubject', () => {
  it('drops instructional and guide wording', () => {
    expect(toSceneSubject('How to choose a desk for two monitors and a laptop')).toBe(
      'desk two monitors laptop',
    );
  });

  it('keeps the concrete nouns of a specification topic', () => {
    expect(toSceneSubject('Surge Protection and Power Planning for a Desk')).toBe(
      'surge protection power planning desk',
    );
  });

  it('returns an empty string when nothing meaningful remains', () => {
    expect(toSceneSubject('How to choose the best guide')).toBe('');
  });
});

describe('buildScenePrompt', () => {
  it('forbids text and branding in the image', () => {
    const prompt = buildScenePrompt('Laptop cooling: when a stand is enough');

    expect(prompt).toContain('Completely free of writing and branding');
    expect(prompt).toContain('no lettering');
    expect(prompt).toContain('logos or brand emblems');
    expect(prompt).toContain('Displays are dark and blank');
    expect(prompt).toContain('Do not include books');
    expect(prompt).not.toContain('buying guide');
    expect(prompt).not.toContain('Editorial');
  });

  it('never leaks a product code into the prompt', () => {
    expect(buildScenePrompt('MOUNTUP arm B08612WQZT')).not.toContain('B08612WQZT');
  });

  it('keeps the whole text free rule even for a long subject', () => {
    const prompt = buildScenePrompt('a'.repeat(500));

    expect(prompt.length).toBeLessThanOrEqual(2048);
    expect(prompt).toContain('Displays are dark and blank with a uniform bezel and no emblem.');
  });

  it('falls back to a plain scene when the subject is empty', () => {
    expect(buildScenePrompt('')).toContain('Photograph of a real, tidy home office.');
  });
});
