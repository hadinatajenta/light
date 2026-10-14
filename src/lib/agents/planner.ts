import { ApiError } from '../errors';
import { isDuplicateTopicTitle, TOPIC_INTENTS } from './topics';

export const MAX_PLANNED_TOPICS = 8;
export const PLANNER_INTENT_FALLBACK = 'informational';
export const MIN_PLANNED_KEYWORDS = 2;
export const MAX_PLANNED_KEYWORDS = 5;

export interface PlannerTopic {
  title: string;
  category: string;
  intent: string;
  keywords: string[];
  sourceFindingId?: string;
}

export interface PlannerFindingRef {
  id: string;
  title: string;
  detail: string;
  score: number;
  actionType: string;
}

export interface ParsedPlannerTopics {
  topics: PlannerTopic[];
  skipped: number;
}

function readIntent(value: unknown): string {
  if (typeof value === 'string') {
    const candidate = value.trim().toLowerCase();

    if ((TOPIC_INTENTS as readonly string[]).includes(candidate)) {
      return candidate;
    }
  }

  return PLANNER_INTENT_FALLBACK;
}

function readKeywords(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const keywords: string[] = [];

  for (const entry of value) {
    if (typeof entry !== 'string') {
      continue;
    }

    const keyword = entry.trim().toLowerCase();

    if (!keyword || seen.has(keyword)) {
      continue;
    }

    seen.add(keyword);
    keywords.push(keyword);

    if (keywords.length >= MAX_PLANNED_KEYWORDS) {
      break;
    }
  }

  return keywords;
}

function readSourceFindingId(value: unknown, allowed: ReadonlySet<string>): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const id = value.trim();

  return id.length > 0 && allowed.has(id) ? id : null;
}

export function parsePlannerTopics(
  payload: Record<string, unknown>,
  allowedCategories: readonly string[],
  knownTitles: readonly string[],
  allowedFindingIds: readonly string[] = [],
): ParsedPlannerTopics {
  const entries = payload.topics;

  if (!Array.isArray(entries) || entries.length === 0) {
    throw new ApiError(502, 'MODEL_OUTPUT_INVALID', 'The planner did not return any topics.', {
      snippet: JSON.stringify(payload).slice(0, 200),
      length: JSON.stringify(payload).length,
    });
  }

  const allowed = new Set(allowedCategories.map((category) => category.trim().toLowerCase()));
  const allowedFindings = new Set(allowedFindingIds);
  const accepted: PlannerTopic[] = [];
  const acceptedTitles: string[] = [];
  let skipped = 0;

  for (const entry of entries) {
    if (accepted.length >= MAX_PLANNED_TOPICS) {
      break;
    }

    if (!entry || typeof entry !== 'object') {
      skipped += 1;
      continue;
    }

    const record = entry as Record<string, unknown>;
    const title = typeof record.title === 'string' ? record.title.trim() : '';
    const category = typeof record.category === 'string' ? record.category.trim() : '';

    if (!title || !category || !allowed.has(category.toLowerCase())) {
      skipped += 1;
      continue;
    }

    if (isDuplicateTopicTitle(title, [...knownTitles, ...acceptedTitles])) {
      skipped += 1;
      continue;
    }

    const keywords = readKeywords(record.keywords);

    if (keywords.length < MIN_PLANNED_KEYWORDS) {
      skipped += 1;
      continue;
    }

    const sourceFindingId = readSourceFindingId(record.sourceFindingId, allowedFindings);
    const topic: PlannerTopic = {
      title,
      category,
      intent: readIntent(record.intent),
      keywords,
    };

    if (sourceFindingId) {
      topic.sourceFindingId = sourceFindingId;
    }

    accepted.push(topic);
    acceptedTitles.push(title);
  }

  return { topics: accepted, skipped };
}
