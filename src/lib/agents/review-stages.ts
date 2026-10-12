export const REVIEW_STAGES = ['qc_passed', 'editorial_passed', 'fact_check_passed'] as const;

export type ReviewStage = (typeof REVIEW_STAGES)[number];

export type ReviewClaimStage = 'qc' | 'editorial' | 'fact_check';

export function resolveReviewClaimStage(
  role: string,
  autoPublish: boolean,
): ReviewClaimStage | null {
  if (role === 'qc') {
    return 'qc';
  }

  if (role === 'reviewer') {
    return autoPublish ? 'fact_check' : 'editorial';
  }

  return null;
}

export function reviewStageAfterPass(stage: ReviewClaimStage): ReviewStage {
  if (stage === 'qc') {
    return 'qc_passed';
  }

  if (stage === 'editorial') {
    return 'editorial_passed';
  }

  return 'fact_check_passed';
}

export function reviewStageFilter(stage: ReviewClaimStage): string {
  if (stage === 'qc') {
    return 'review_stage IS NULL';
  }

  if (stage === 'editorial') {
    return "review_stage = 'qc_passed'";
  }

  return "review_stage = 'editorial_passed'";
}
