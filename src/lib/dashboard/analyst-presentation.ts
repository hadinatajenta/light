import type { AnalystFindingStatus } from '../agents/analyst/findings';
import type {
  AnalystActionEffort,
  AnalystActionType,
  AnalystCandidateRuleId,
} from '../agents/analyst/rules';
import type { AnalystSource, AnalystSourceState } from '../agents/analyst/sources';

export const ANALYST_SOURCE_LABELS: Record<AnalystSource, string> = {
  clicks: 'Affiliate clicks',
  post_views: 'Article views',
  gsc: 'Search Console',
  ga4: 'GA4',
  affiliate_report: 'Affiliate network report',
};

export const ANALYST_SOURCE_STATE_LABELS: Record<AnalystSourceState | 'unknown', string> = {
  ok: 'Connected',
  missing: 'Not connected',
  error: 'Read failed',
  unknown: 'Not checked yet',
};

export const ANALYST_RULE_LABELS: Record<AnalystCandidateRuleId, string> = {
  no_affiliate_link: 'Traffic without product links',
  dead_target: 'Product link cannot resolve',
  broken_placement: 'Clicks cannot earn',
  redirect_misses: 'Go link returned 404',
  zero_views: 'No views since publishing',
  new_topic: 'Topic gap',
  title_meta: 'Title and meta earn no clicks',
  refresh: 'Article needs a refresh',
  product_check: 'Clicks earned no commission',
};

export const ANALYST_FINDING_STATUS_LABELS: Record<AnalystFindingStatus, string> = {
  open: 'Open',
  actioned: 'Action taken',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
  expired: 'Expired',
};

export const ANALYST_FINDING_STATUS_FILTERS: AnalystFindingStatus[] = Object.keys(
  ANALYST_FINDING_STATUS_LABELS,
) as AnalystFindingStatus[];

export const ANALYST_ACTION_LABELS: Record<AnalystActionType, string> = {
  add_links: 'Add product links',
  swap_product: 'Swap the product',
  investigate: 'Investigate',
};

export const ANALYST_EFFORT_LABELS: Record<AnalystActionEffort, string> = {
  S: 'Small effort',
  M: 'Medium effort',
  L: 'Large effort',
};

export function describeAnalystRule(ruleId: string): string {
  return ANALYST_RULE_LABELS[ruleId as AnalystCandidateRuleId] ?? ruleId;
}

export function describeAnalystSource(source: string): string {
  return ANALYST_SOURCE_LABELS[source as AnalystSource] ?? source;
}

export function describeAnalystAction(actionType: string): string {
  return ANALYST_ACTION_LABELS[actionType as AnalystActionType] ?? actionType;
}

export function describeAnalystEffort(effort: string): string {
  return ANALYST_EFFORT_LABELS[effort as AnalystActionEffort] ?? effort;
}

export function describeAnalystSourceState(value: string): string {
  return ANALYST_SOURCE_STATE_LABELS[value as AnalystSourceState | 'unknown'] ?? value;
}

export interface AnalystSubjectLink {
  href: string;
  linkLabel: string;
  detail: string | null;
}

export function resolveAnalystSubject(
  subjectType: string,
  subjectId: string,
): AnalystSubjectLink | null {
  if (subjectType === 'post') {
    return {
      href: `/dashboard/posts/${encodeURIComponent(subjectId)}/edit`,
      linkLabel: 'Open the article editor',
      detail: null,
    };
  }

  if (subjectType === 'product') {
    return {
      href: '/dashboard/monetization/catalog',
      linkLabel: 'Open the product catalog',
      detail: subjectId,
    };
  }

  if (subjectType === 'redirect') {
    return {
      href: '/dashboard/redirects',
      linkLabel: 'Open the redirect list',
      detail: `/go/${subjectId}`,
    };
  }

  return null;
}

export function formatAnalystConfidence(confidence: number): string {
  const bounded = Math.min(Math.max(confidence, 0), 1);
  return `${Math.round(bounded * 100)}%`;
}

export function humanizeEvidenceKey(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
  const words = spaced.split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    return key;
  }

  const [first, ...rest] = words;
  const lead = `${first.charAt(0).toUpperCase()}${first.slice(1).toLowerCase()}`;
  const tail = rest.map((word) => ` ${word.toLowerCase()}`).join('');

  return `${lead}${tail}`;
}

export interface EvidenceEntry {
  key: string;
  label: string;
  value: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function formatEvidenceValue(value: unknown): string {
  if (value === null || value === undefined) {
    return 'Not recorded';
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value.toLocaleString('en-US') : 'Not a number';
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  if (typeof value === 'string') {
    return value.trim() === '' ? 'Empty' : value;
  }

  if (Array.isArray(value)) {
    return value.length === 0
      ? 'None'
      : value.map((entry) => formatEvidenceValue(entry)).join(', ');
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    return entries.length === 0
      ? 'None'
      : entries
          .map(([key, entry]) => `${humanizeEvidenceKey(key)}: ${formatEvidenceValue(entry)}`)
          .join('; ');
  }

  return String(value);
}

export function buildEvidenceEntries(evidence: Record<string, unknown>): EvidenceEntry[] {
  return Object.entries(evidence).map(([key, value]) => ({
    key,
    label: humanizeEvidenceKey(key),
    value: formatEvidenceValue(value),
  }));
}

export function formatAnalystSourceList(labels: readonly string[]): string {
  if (labels.length === 0) {
    return '';
  }

  if (labels.length === 1) {
    return labels[0];
  }

  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}
