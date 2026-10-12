export type AuditSeverity = 'error' | 'warning' | 'info';

export interface AuditIssue {
  code: string;
  severity: AuditSeverity;
  message: string;
}

export interface AuditInput {
  id: string;
  title: string;
  description: string;
  body: string;
  tags: string[];
  category: string | null;
  focusKeyword: string | null;
  targetIntent: string | null;
  coverUrl: string | null;
  coverAlt: string | null;
  status: string;
  pubDate: string | null;
  updatedDate: string | null;
  refreshAfterDays?: number;
  now?: Date;
}

export interface AuditResult {
  score: number;
  issues: AuditIssue[];
  wordCount: number;
  internalLinks: number;
  externalLinks: number;
  isRefreshCandidate: boolean;
}

export interface BodyHeading {
  depth: number;
  text: string;
}

export const TITLE_MIN_LENGTH = 10;
export const TITLE_MAX_LENGTH = 70;
export const DESCRIPTION_MIN_LENGTH = 50;
export const DESCRIPTION_MAX_LENGTH = 160;
export const MIN_WORDS = 900;
export const MIN_H2_HEADINGS = 4;
export const MIN_INTERNAL_LINKS = 2;
export const REFRESH_AFTER_DAYS = 180;

const MAX_SCORE = 100;
const ERROR_PENALTY = 15;
const WARNING_PENALTY = 5;
const INFO_PENALTY = 1;
const DAY_MS = 24 * 60 * 60 * 1000;

const HEADING_PATTERN = /^(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/gm;
const MARKDOWN_LINK_PATTERN = /\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+["'][^"']*["'])?\s*\)/g;
const HTML_LINK_PATTERN = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi;
const FAQ_HEADING_PATTERN = /^##[ \t]+frequently asked questions\??[ \t]*$/im;

export function stripCodeFences(body: string): string {
  const paired = body.replace(/^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^[ \t]*\1[^\n]*$/gm, '');

  return paired.replace(/^[ \t]*(`{3,}|~{3,})[^\n]*\n?[\s\S]*$/m, '');
}

export function extractHeadings(body: string): BodyHeading[] {
  const headings: BodyHeading[] = [];

  for (const match of stripCodeFences(body).matchAll(HEADING_PATTERN)) {
    headings.push({ depth: match[1].length, text: match[2].trim() });
  }

  return headings;
}

export function extractLinkHrefs(body: string): string[] {
  const hrefs: string[] = [];

  for (const match of body.matchAll(MARKDOWN_LINK_PATTERN)) {
    hrefs.push(match[2]);
  }

  for (const match of body.matchAll(HTML_LINK_PATTERN)) {
    hrefs.push(match[1]);
  }

  return hrefs;
}

export function isInternalHref(href: string): boolean {
  return href.startsWith('/') && !href.startsWith('//');
}

export function isExternalHref(href: string): boolean {
  return /^https?:\/\//i.test(href) || href.startsWith('//');
}

export function countWords(body: string): number {
  const source = stripCodeFences(body).trim();
  return source.length === 0 ? 0 : source.split(/\s+/).filter(Boolean).length;
}

export function extractFirstParagraph(body: string): string {
  for (const block of stripCodeFences(body).split(/\n{2,}/)) {
    const trimmed = block.trim();
    if (trimmed.length === 0) {
      continue;
    }

    const firstLine = trimmed.split('\n')[0].trim();
    if (firstLine.startsWith('#')) {
      continue;
    }

    return trimmed;
  }

  return '';
}

export function extractInternalPostIds(body: string): string[] {
  const ids: string[] = [];

  for (const href of extractLinkHrefs(body)) {
    if (!isInternalHref(href)) {
      continue;
    }

    const path = href.split(/[?#]/)[0];
    const segments = path.split('/').filter(Boolean);
    if (segments[0] === 'blog' && segments[1]) {
      ids.push(segments[1]);
    }
  }

  return ids;
}

export function normalizeFocusKeyword(value: string | null): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function parseDate(value: string | null): Date | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function isRefreshCandidate(
  input: Pick<AuditInput, 'status' | 'pubDate' | 'updatedDate'>,
  now: Date,
  refreshAfterDays: number = REFRESH_AFTER_DAYS,
): boolean {
  if (input.status !== 'published') {
    return false;
  }

  const dates = [parseDate(input.updatedDate), parseDate(input.pubDate)].filter(
    (date): date is Date => date !== null,
  );
  if (dates.length === 0) {
    return false;
  }

  const latest = Math.max(...dates.map((date) => date.getTime()));
  return now.getTime() - latest > refreshAfterDays * DAY_MS;
}

function includesKeyword(text: string, keyword: string): boolean {
  return text.toLowerCase().replace(/\s+/g, ' ').includes(keyword);
}

function clampScore(score: number): number {
  return Math.min(MAX_SCORE, Math.max(0, score));
}

export function auditPost(input: AuditInput): AuditResult {
  const now = input.now ?? new Date();
  const issues: AuditIssue[] = [];
  const title = input.title.trim();
  const description = input.description.trim();
  const body = input.body ?? '';

  if (title.length < TITLE_MIN_LENGTH || title.length > TITLE_MAX_LENGTH) {
    issues.push({
      code: 'title-length',
      severity: 'error',
      message: `Title is ${title.length} characters; keep it between ${TITLE_MIN_LENGTH} and ${TITLE_MAX_LENGTH}.`,
    });
  }

  if (description.length < DESCRIPTION_MIN_LENGTH || description.length > DESCRIPTION_MAX_LENGTH) {
    issues.push({
      code: 'description-length',
      severity: 'error',
      message: `Description is ${description.length} characters; keep it between ${DESCRIPTION_MIN_LENGTH} and ${DESCRIPTION_MAX_LENGTH}.`,
    });
  }

  if (body.trim().length === 0) {
    issues.push({
      code: 'body-empty',
      severity: 'error',
      message: 'The body is empty.',
    });
  }

  const headings = extractHeadings(body);
  const h2Headings = headings.filter((heading) => heading.depth === 2);

  if (headings.some((heading) => heading.depth === 1)) {
    issues.push({
      code: 'h1-in-body',
      severity: 'error',
      message: 'The body contains an H1 heading; start sections at H2.',
    });
  }

  if (h2Headings.length < MIN_H2_HEADINGS) {
    issues.push({
      code: 'few-h2',
      severity: 'warning',
      message: `The body has ${h2Headings.length} H2 headings; the minimum is ${MIN_H2_HEADINGS}.`,
    });
  }

  const wordCount = countWords(body);
  if (wordCount < MIN_WORDS) {
    issues.push({
      code: 'thin-content',
      severity: 'warning',
      message: `The body has ${wordCount} words; the minimum is ${MIN_WORDS}.`,
    });
  }

  const hrefs = extractLinkHrefs(body);
  const internalLinks = hrefs.filter(isInternalHref).length;
  const externalLinks = hrefs.filter(isExternalHref).length;

  if (internalLinks < MIN_INTERNAL_LINKS) {
    issues.push({
      code: 'few-internal-links',
      severity: 'warning',
      message: `The body has ${internalLinks} internal links; add at least ${MIN_INTERNAL_LINKS}.`,
    });
  }

  if (!input.coverUrl || input.coverUrl.trim().length === 0) {
    issues.push({
      code: 'missing-cover',
      severity: 'warning',
      message: 'No cover image is set.',
    });
  }

  const keyword = normalizeFocusKeyword(input.focusKeyword);

  if (keyword.length > 0) {
    if (!includesKeyword(title, keyword)) {
      issues.push({
        code: 'keyword-missing-title',
        severity: 'warning',
        message: `The focus keyword "${keyword}" is missing from the title.`,
      });
    }

    if (!includesKeyword(description, keyword)) {
      issues.push({
        code: 'keyword-missing-description',
        severity: 'warning',
        message: `The focus keyword "${keyword}" is missing from the description.`,
      });
    }

    if (!includesKeyword(extractFirstParagraph(body), keyword)) {
      issues.push({
        code: 'keyword-missing-intro',
        severity: 'warning',
        message: `The focus keyword "${keyword}" is missing from the first paragraph.`,
      });
    }

    if (!h2Headings.some((heading) => includesKeyword(heading.text, keyword))) {
      issues.push({
        code: 'keyword-missing-heading',
        severity: 'warning',
        message: `The focus keyword "${keyword}" is missing from every H2 heading.`,
      });
    }

    if (!includesKeyword(input.coverAlt ?? '', keyword)) {
      issues.push({
        code: 'keyword-missing-cover-alt',
        severity: 'warning',
        message: `The focus keyword "${keyword}" is missing from the cover alt text.`,
      });
    }
  }

  if (!FAQ_HEADING_PATTERN.test(stripCodeFences(body))) {
    issues.push({
      code: 'no-faq',
      severity: 'info',
      message: 'No "Frequently asked questions" section was found.',
    });
  }

  const penalty = issues.reduce((total, issue) => {
    if (issue.severity === 'error') {
      return total + ERROR_PENALTY;
    }

    if (issue.severity === 'warning') {
      return total + WARNING_PENALTY;
    }

    return total + INFO_PENALTY;
  }, 0);

  return {
    score: clampScore(MAX_SCORE - penalty),
    issues,
    wordCount,
    internalLinks,
    externalLinks,
    isRefreshCandidate: isRefreshCandidate(input, now, input.refreshAfterDays),
  };
}

export function findCannibalization(
  posts: Array<{ id: string; title: string; status: string; focusKeyword: string | null }>,
): Array<{ keyword: string; posts: Array<{ id: string; title: string }> }> {
  const groups = new Map<string, Array<{ id: string; title: string }>>();

  for (const post of posts) {
    if (post.status !== 'published') {
      continue;
    }

    const keyword = normalizeFocusKeyword(post.focusKeyword);
    if (keyword.length === 0) {
      continue;
    }

    const members = groups.get(keyword) ?? [];
    members.push({ id: post.id, title: post.title });
    groups.set(keyword, members);
  }

  return [...groups.entries()]
    .filter(([, members]) => members.length >= 2)
    .map(([keyword, members]) => ({ keyword, posts: members }))
    .sort((first, second) => first.keyword.localeCompare(second.keyword));
}

export function findOrphanPosts(
  posts: Array<{ id: string; title: string; status: string; body: string }>,
): Array<{ id: string; title: string }> {
  const linkedIds = new Set<string>();

  for (const post of posts) {
    for (const target of extractInternalPostIds(post.body)) {
      if (target !== post.id) {
        linkedIds.add(target);
      }
    }
  }

  return posts
    .filter((post) => post.status === 'published' && !linkedIds.has(post.id))
    .map((post) => ({ id: post.id, title: post.title }));
}
