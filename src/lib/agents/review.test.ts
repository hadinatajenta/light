import { describe, expect, it } from 'vitest';
import { resolveReviewClaimStage, reviewStageAfterPass } from './review-stages';

describe('resolveReviewClaimStage', () => {
  it('sends QC to the first stage', () => {
    expect(resolveReviewClaimStage('qc', false)).toBe('qc');
  });

  it('sends a reviewer without auto publish to the editorial stage', () => {
    expect(resolveReviewClaimStage('reviewer', false)).toBe('editorial');
  });

  it('sends a reviewer with auto publish to the final fact-check stage', () => {
    expect(resolveReviewClaimStage('reviewer', true)).toBe('fact_check');
  });

  it('claims nothing for roles outside review', () => {
    expect(resolveReviewClaimStage('writer', false)).toBeNull();
    expect(resolveReviewClaimStage('scrapper', true)).toBeNull();
    expect(resolveReviewClaimStage('planner', false)).toBeNull();
  });
});

describe('reviewStageAfterPass', () => {
  it('advances each claim stage to the stage it records', () => {
    expect(reviewStageAfterPass('qc')).toBe('qc_passed');
    expect(reviewStageAfterPass('editorial')).toBe('editorial_passed');
    expect(reviewStageAfterPass('fact_check')).toBe('fact_check_passed');
  });
});
