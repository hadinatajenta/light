import { extractProductSlugs, listProductSlugs } from '../affiliate/store';

export type AuditSeverity = 'high' | 'medium' | 'low';

export const TITLE_MIN_LENGTH = 10;
export const TITLE_MAX_LENGTH = 70;
export const DESCRIPTION_MIN_LENGTH = 50;
export const DESCRIPTION_MAX_LENGTH = 160;
export const MIN_BODY_WORDS = 900;
export const MIN_H2_HEADINGS = 4;
export const STALE_AFTER_DAYS = 180;
export const HIGH_PENALTY = 20;
export const MEDIUM_PENALTY = 8;
export const LOW_PENALTY = 3;

const MAX_SCORE = 100;
const DAY_MS = 24 * 60 * 60 * 1000;
const AFFILIATE_LINK_MARKER = '](product:';
const INTERNAL_LINK_PATTERN = /\]\(\/blog\//;
const H2_PATTERN = /^##[ \t]+/gm;
const H1_PATTERN = /^#[ \t]+/;

export interface AuditFinding {
  rule: string;
  severity: AuditSeverity;
  message: string;
}

export interface AuditPostInput {
  id: string;
  title: string;
  description: string;
  body: string;
  coverUrl: string | null;
  focusKeyword: string | null;
  pubDate: string | null;
  updatedDate: string | null;
}

export interface AuditContext {
  now: Date;
  knownProductSlugs: ReadonlySet<string>;
  duplicateTitleIds: ReadonlySet<string>;
}

export interface AuditPostResult {
  id: string;
  title: string;
  score: number;
  findings: AuditFinding[];
}

export interface AuditReport {
  generatedAt: string;
  totals: {
    posts: number;
    clean: number;
    withHigh: number;
    averageScore: number;
  };
  byRule: Array<{ rule: string; severity: AuditSeverity; count: number }>;
  posts: AuditPostResult[];
}

interface PublishedPostRow {
  id: string;
  title: string;
  description: string;
  body: string;
  cover_url: string | null;
  focus_keyword: string | null;
  pub_date: string | null;
  updated_date: string | null;
}

function countWords(body: string): number {
  const trimmed = body.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

function normaliseTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, ' ');
}

function lastUpdatedAt(post: AuditPostInput): string | null {
  const updated = post.updatedDate?.trim();
  if (updated) {
    return updated;
  }

  const published = post.pubDate?.trim();
  return published ? published : null;
}

function lengthFinding(
  rule: string,
  severity: AuditSeverity,
  field: string,
  value: string,
  minLength: number,
  maxLength: number,
): AuditFinding | null {
  if (value.length >= minLength && value.length <= maxLength) {
    return null;
  }

  return {
    rule,
    severity,
    message: `${field} is ${value.length} characters; the range is ${minLength} to ${maxLength}.`,
  };
}

function findH1Heading(body: string): string | null {
  for (const line of body.split('\n')) {
    if (H1_PATTERN.test(line)) {
      return line.trim();
    }
  }

  return null;
}

function headingFinding(body: string): AuditFinding | null {
  const h2Count = body.match(H2_PATTERN)?.length ?? 0;
  const h1Heading = findH1Heading(body);
  const h1Label = h1Heading ? h1Heading.replace(H1_PATTERN, '').trim() || h1Heading : '';

  if (h1Heading && h2Count < MIN_H2_HEADINGS) {
    return {
      rule: 'heading-structure',
      severity: 'medium',
      message: `Body contains an H1 heading ("${h1Label}") and only ${h2Count} H2 headings. Use at least ${MIN_H2_HEADINGS} H2 headings and no H1.`,
    };
  }

  if (h1Heading) {
    return {
      rule: 'heading-structure',
      severity: 'medium',
      message: `Body contains an H1 heading ("${h1Label}"). The page title is already the H1, so start sections at H2.`,
    };
  }

  if (h2Count < MIN_H2_HEADINGS) {
    return {
      rule: 'heading-structure',
      severity: 'medium',
      message: `Body has ${h2Count} H2 headings; the minimum is ${MIN_H2_HEADINGS}.`,
    };
  }

  return null;
}

function staleFinding(post: AuditPostInput, now: Date): AuditFinding | null {
  const updatedDate = post.updatedDate?.trim();
  const raw = lastUpdatedAt(post);

  if (!raw) {
    return null;
  }

  const timestamp = new Date(raw).getTime();
  if (Number.isNaN(timestamp)) {
    return null;
  }

  const ageInDays = Math.floor((now.getTime() - timestamp) / DAY_MS);
  if (ageInDays <= STALE_AFTER_DAYS) {
    return null;
  }

  const field = updatedDate ? 'Last updated' : 'Last published';
  const date = new Date(timestamp).toISOString().slice(0, 10);

  return {
    rule: 'stale',
    severity: 'low',
    message: `${field} ${ageInDays} days ago (${date}). Refresh articles older than ${STALE_AFTER_DAYS} days.`,
  };
}

function describeUnknownSlugs(slugs: string[]): string {
  const quoted = slugs.map((slug) => `"${slug}"`).join(', ');

  if (slugs.length === 1) {
    return `Product link points to ${quoted}, which is not in the catalog. Fix the link or add the product.`;
  }

  return `${slugs.length} product links point to unknown products: ${quoted}. Fix them or add the products.`;
}

export function evaluatePost(post: AuditPostInput, context: AuditContext): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const title = post.title.trim();
  const description = post.description.trim();

  const titleFinding = lengthFinding(
    'title-length',
    'high',
    'Title',
    title,
    TITLE_MIN_LENGTH,
    TITLE_MAX_LENGTH,
  );
  if (titleFinding) {
    findings.push(titleFinding);
  }

  const descriptionFinding = lengthFinding(
    'description-length',
    'high',
    'Description',
    description,
    DESCRIPTION_MIN_LENGTH,
    DESCRIPTION_MAX_LENGTH,
  );
  if (descriptionFinding) {
    findings.push(descriptionFinding);
  }

  const wordCount = countWords(post.body);
  if (wordCount < MIN_BODY_WORDS) {
    findings.push({
      rule: 'thin-content',
      severity: 'high',
      message: `Body is ${wordCount} words; the minimum is ${MIN_BODY_WORDS}.`,
    });
  }

  if (!post.coverUrl || post.coverUrl.trim().length === 0) {
    findings.push({
      rule: 'missing-cover',
      severity: 'medium',
      message: 'No cover image set. Add one in the Cover field so the article has a thumbnail.',
    });
  }

  if (!post.body.includes(AFFILIATE_LINK_MARKER)) {
    findings.push({
      rule: 'no-affiliate-link',
      severity: 'medium',
      message: 'No product link found. Add at least one affiliate product link.',
    });
  }

  const unknownSlugs = extractProductSlugs(post.body).filter(
    (slug) => !context.knownProductSlugs.has(slug),
  );
  if (unknownSlugs.length > 0) {
    findings.push({
      rule: 'broken-product-reference',
      severity: 'high',
      message: describeUnknownSlugs(unknownSlugs),
    });
  }

  if (!INTERNAL_LINK_PATTERN.test(post.body)) {
    findings.push({
      rule: 'no-internal-links',
      severity: 'medium',
      message: 'No link to another article. Add at least one link to a related post.',
    });
  }

  const heading = headingFinding(post.body);
  if (heading) {
    findings.push(heading);
  }

  const stale = staleFinding(post, context.now);
  if (stale) {
    findings.push(stale);
  }

  if (context.duplicateTitleIds.has(post.id)) {
    findings.push({
      rule: 'duplicate-title',
      severity: 'high',
      message: `Title "${post.title}" is also used by another published article. Give one of them a distinct title.`,
    });
  }

  const focusKeyword = post.focusKeyword?.trim() ?? '';
  if (focusKeyword.length > 0 && !title.toLowerCase().includes(focusKeyword.toLowerCase())) {
    findings.push({
      rule: 'keyword-not-in-title',
      severity: 'low',
      message: `Focus keyword "${focusKeyword}" does not appear in the title. Add it or clear the keyword.`,
    });
  }

  return findings;
}

export function scoreFindings(findings: AuditFinding[]): number {
  const penalty = findings.reduce((total, finding) => {
    if (finding.severity === 'high') {
      return total + HIGH_PENALTY;
    }

    if (finding.severity === 'medium') {
      return total + MEDIUM_PENALTY;
    }

    return total + LOW_PENALTY;
  }, 0);

  return Math.max(0, MAX_SCORE - penalty);
}

export function findDuplicateTitleIds(
  posts: Array<Pick<AuditPostInput, 'id' | 'title'>>,
): Set<string> {
  const idsByTitle = new Map<string, string[]>();

  for (const post of posts) {
    const key = normaliseTitle(post.title);
    const ids = idsByTitle.get(key) ?? [];
    ids.push(post.id);
    idsByTitle.set(key, ids);
  }

  const duplicateIds = new Set<string>();

  for (const ids of idsByTitle.values()) {
    if (ids.length < 2) {
      continue;
    }

    for (const id of ids) {
      duplicateIds.add(id);
    }
  }

  return duplicateIds;
}

export function buildAuditReport(
  entries: Array<{ id: string; title: string; findings: AuditFinding[] }>,
  generatedAt: string,
): AuditReport {
  const posts = entries
    .map((entry) => ({ ...entry, score: scoreFindings(entry.findings) }))
    .sort((first, second) => first.score - second.score || first.title.localeCompare(second.title));

  const ruleCounts = new Map<string, { rule: string; severity: AuditSeverity; count: number }>();

  for (const post of posts) {
    for (const finding of post.findings) {
      const entry = ruleCounts.get(finding.rule) ?? {
        rule: finding.rule,
        severity: finding.severity,
        count: 0,
      };
      entry.count += 1;
      ruleCounts.set(finding.rule, entry);
    }
  }

  const totalScore = posts.reduce((sum, post) => sum + post.score, 0);

  return {
    generatedAt,
    totals: {
      posts: posts.length,
      clean: posts.filter((post) => post.findings.length === 0).length,
      withHigh: posts.filter((post) => post.findings.some((finding) => finding.severity === 'high'))
        .length,
      averageScore: posts.length === 0 ? 0 : Math.round(totalScore / posts.length),
    },
    byRule: [...ruleCounts.values()].sort(
      (first, second) => second.count - first.count || first.rule.localeCompare(second.rule),
    ),
    posts,
  };
}

export async function scanContentAudit(
  db: D1Database,
  now: Date = new Date(),
): Promise<AuditReport> {
  const [result, knownProductSlugs] = await Promise.all([
    db
      .prepare(
        `SELECT id, title, description, body, category, tags, cover_url, seo_title, focus_keyword,
                pub_date, updated_date
         FROM posts WHERE status = 'published'`,
      )
      .all<PublishedPostRow>(),
    listProductSlugs(db),
  ]);

  const posts: AuditPostInput[] = (result.results ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    body: row.body,
    coverUrl: row.cover_url,
    focusKeyword: row.focus_keyword,
    pubDate: row.pub_date,
    updatedDate: row.updated_date,
  }));

  const context: AuditContext = {
    now,
    knownProductSlugs,
    duplicateTitleIds: findDuplicateTitleIds(posts),
  };

  return buildAuditReport(
    posts.map((post) => ({
      id: post.id,
      title: post.title,
      findings: evaluatePost(post, context),
    })),
    now.toISOString(),
  );
}
