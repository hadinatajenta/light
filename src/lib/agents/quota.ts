import { getSetting } from '../settings/store';
import type { AgentRole } from './roles';

export const DEFAULT_PUBLISH_TARGET = 5;
export const PENDING_DRAFT_BRAKE = 3;
export const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
export const MIN_PUBLISH_GAP_MINUTES = 15;
export const PUBLISH_TARGET_SETTING = 'publish_daily_target';
export const PUBLISH_GAP_SETTING = 'publish_min_gap_minutes';

export function startOfWibDay(now: Date): Date {
  const shifted = now.getTime() + WIB_OFFSET_MS;
  const dayStart = Math.floor(shifted / 86_400_000) * 86_400_000;
  return new Date(dayStart - WIB_OFFSET_MS);
}

export interface DailyQuotaState {
  target: number;
  publishedToday: number;
  remaining: number;
  behind: boolean;
}

export function evaluateDailyQuota(publishedToday: number, target: number): DailyQuotaState {
  const remaining = Math.max(target - publishedToday, 0);

  return { target, publishedToday, remaining, behind: remaining > 0 };
}

export function nextPublishSlot(lastPublishedAt: Date | null, minGapMs: number, now: Date): Date {
  if (!lastPublishedAt) {
    return now;
  }

  const nextAllowed = lastPublishedAt.getTime() + minGapMs;

  return nextAllowed <= now.getTime() ? now : new Date(nextAllowed);
}

export function shouldPublishNow(
  lastPublishedAt: Date | null,
  minGapMs: number,
  now: Date,
): boolean {
  return nextPublishSlot(lastPublishedAt, minGapMs, now).getTime() <= now.getTime();
}

export interface QuotaWorkload {
  openTopics: number;
  researchedTopics: number;
  pendingDrafts: number;
  revisionDrafts: number;
  searchesRemaining: number;
}

export function selectCatchUpRoles(workload: QuotaWorkload): AgentRole[] {
  const roles: AgentRole[] = [];

  if (workload.openTopics > 0 && workload.searchesRemaining > 0) {
    roles.push('scrapper');
  }

  if (
    (workload.researchedTopics > 0 || workload.revisionDrafts > 0) &&
    workload.pendingDrafts < PENDING_DRAFT_BRAKE
  ) {
    roles.push('writer');
  }

  if (workload.pendingDrafts > 0) {
    roles.push('qc');
    roles.push('reviewer');
  }

  const hasNothingAtAll =
    workload.openTopics === 0 &&
    workload.researchedTopics === 0 &&
    workload.pendingDrafts === 0 &&
    workload.revisionDrafts === 0;

  if (roles.length === 0 && hasNothingAtAll) {
    roles.push('planner');
  }

  return roles;
}

export interface QuotaSettings {
  target: number;
  minGapMinutes: number;
}

function readCount(value: string | null, fallback: number): number {
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function readQuotaSettings(db: D1Database): Promise<QuotaSettings> {
  const [targetValue, gapValue] = await Promise.all([
    getSetting(db, PUBLISH_TARGET_SETTING),
    getSetting(db, PUBLISH_GAP_SETTING),
  ]);
  const target = readCount(targetValue, DEFAULT_PUBLISH_TARGET);
  const derivedGap = Math.max(Math.floor(1440 / target), MIN_PUBLISH_GAP_MINUTES);
  const minGapMinutes = readCount(gapValue, derivedGap);

  return { target, minGapMinutes };
}
