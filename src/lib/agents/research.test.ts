import { describe, expect, it } from 'vitest';
import {
  assessResearchQuality,
  computeUncoveredAngles,
  countDistinctQueries,
  dedupeNotesByQuote,
  dedupeQueries,
  RESEARCH_ANGLES,
  SOURCE_TYPES,
  sourceMatchKey,
} from './research';

describe('dedupeQueries', () => {
  it('normalizes each query and preserves first-occurrence order', () => {
    expect(
      dedupeQueries(['Standing Desk  Height', '  standing desk height ', 'Monitor arm values']),
    ).toEqual(['standing desk height', 'monitor arm values']);
  });

  it('drops empty and whitespace-only entries', () => {
    expect(dedupeQueries(['', '   ', 'desk load capacity'])).toEqual(['desk load capacity']);
  });
});

describe('dedupeNotesByQuote', () => {
  it('keeps the first note of a repeated quote and retains distinct quotes', () => {
    const notes = [
      { quote: 'Seat height adjusts from 16 to 21 inches.', detail: 'first' },
      { quote: 'seat height adjusts from 16 to 21 inches', detail: 'second' },
      { quote: 'Backrest reclines through 120 degrees.', detail: 'third' },
    ];

    expect(dedupeNotesByQuote(notes).map((note) => note.detail)).toEqual(['first', 'third']);
  });

  it('falls back to the detail when the quote is empty', () => {
    const notes = [
      { quote: '', detail: 'Same fact stated twice' },
      { quote: '   ', detail: 'same   fact stated twice' },
      { quote: '', detail: 'A different fact' },
    ];

    expect(dedupeNotesByQuote(notes).map((note) => note.detail)).toEqual([
      'Same fact stated twice',
      'A different fact',
    ]);
  });
});

describe('computeUncoveredAngles', () => {
  it('lists the angles absent from the covered set', () => {
    expect(computeUncoveredAngles(['specifications', 'durability'])).toEqual([
      'compatibility',
      'standards',
      'claims',
    ]);
  });

  it('returns nothing when every angle is covered', () => {
    expect(computeUncoveredAngles([...RESEARCH_ANGLES])).toEqual([]);
  });

  it('ignores unknown angle values', () => {
    expect(computeUncoveredAngles(['unknown', 'claims'])).toEqual([
      'specifications',
      'compatibility',
      'durability',
      'standards',
    ]);
  });
});

describe('research vocabularies', () => {
  it('exposes the expected angle and source-type values', () => {
    expect(RESEARCH_ANGLES).toEqual([
      'specifications',
      'compatibility',
      'durability',
      'standards',
      'claims',
    ]);
    expect(SOURCE_TYPES).toEqual([
      'manufacturer',
      'independent',
      'standard',
      'government',
      'retailer',
      'other',
    ]);
  });
});

describe('assessResearchQuality', () => {
  it('meets the bar only with enough notes and enough angle coverage', () => {
    const full = assessResearchQuality(12, [...RESEARCH_ANGLES]);

    expect(full.meetsBar).toBe(true);
    expect(full.coveredCount).toBe(5);
    expect(full.uncoveredAngles).toEqual([]);
  });

  it('fails the bar when the note count is below the minimum', () => {
    expect(assessResearchQuality(9, [...RESEARCH_ANGLES]).meetsBar).toBe(false);
  });

  it('fails the bar when coverage is too narrow and reports the missing angles', () => {
    const narrow = assessResearchQuality(12, ['specifications', 'compatibility', 'durability']);

    expect(narrow.meetsBar).toBe(false);
    expect(narrow.coveredCount).toBe(3);
    expect(narrow.uncoveredAngles).toEqual(['standards', 'claims']);
  });
});

describe('countDistinctQueries', () => {
  it('counts distinct normalized queries and ignores blank entries', () => {
    expect(countDistinctQueries(['Desk Load', 'desk load', null, '   ', 'Chair gas lift'])).toBe(2);
  });

  it('returns zero for an empty list', () => {
    expect(countDistinctQueries([])).toBe(0);
  });
});

describe('sourceMatchKey', () => {
  it('matches quotes regardless of case and punctuation', () => {
    expect(sourceMatchKey('Seat height adjusts.', 'ignored')).toBe(
      sourceMatchKey('seat  height adjusts', 'other'),
    );
  });

  it('falls back to the detail when the quote is empty', () => {
    expect(sourceMatchKey('', 'Same fact')).toBe(sourceMatchKey('   ', 'same   fact'));
  });
});
