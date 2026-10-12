import { withAdmin } from '@/lib/api/handler';
import { requireContentDatabase } from '@/lib/content/database';
import { jsonOk } from '@/lib/http';
import { auditPost, findCannibalization, findOrphanPosts } from '@/lib/seo/audit';
import { readSeoRefreshDays } from '@/lib/seo/settings';

export const prerender = false;

interface SeoAuditRow {
  id: string;
  title: string;
  description: string;
  body: string;
  tags: string;
  category: string | null;
  status: string;
  focus_keyword: string | null;
  target_intent: string | null;
  cover_url: string | null;
  cover_alt: string | null;
  pub_date: string | null;
  updated_date: string | null;
}

interface BrokenLinkRow {
  url: string;
  status_code: number | null;
  error: string | null;
  checked_at: string;
}

function readTags(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === 'string')
      : [];
  } catch {
    return [];
  }
}

export const GET = withAdmin(async (_context, requestId) => {
  const database = await requireContentDatabase();
  const now = new Date();
  const refreshAfterDays = await readSeoRefreshDays(database);

  const [postsResult, brokenResult] = await Promise.all([
    database
      .prepare(
        `SELECT id, title, description, body, tags, category, status, focus_keyword,
                target_intent, cover_url, cover_alt, pub_date, updated_date
         FROM posts`,
      )
      .all<SeoAuditRow>(),
    database
      .prepare(
        `SELECT url, status_code, error, checked_at
         FROM seo_link_checks WHERE ok = 0 ORDER BY url`,
      )
      .all<BrokenLinkRow>(),
  ]);

  const rows = postsResult.results ?? [];

  const audited = rows.map((row) => ({
    row,
    result: auditPost({
      id: row.id,
      title: row.title,
      description: row.description,
      body: row.body,
      tags: readTags(row.tags),
      category: row.category,
      focusKeyword: row.focus_keyword,
      targetIntent: row.target_intent,
      coverUrl: row.cover_url,
      coverAlt: row.cover_alt,
      status: row.status,
      pubDate: row.pub_date,
      updatedDate: row.updated_date,
      refreshAfterDays,
      now,
    }),
  }));

  const cannibalization = findCannibalization(
    rows.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      focusKeyword: row.focus_keyword,
    })),
  );

  const orphans = findOrphanPosts(
    rows.map((row) => ({ id: row.id, title: row.title, status: row.status, body: row.body })),
  );

  const brokenLinks = (brokenResult.results ?? []).map((row) => ({
    url: row.url,
    statusCode: row.status_code,
    error: row.error,
    checkedAt: row.checked_at,
  }));

  const total = audited.length;
  const cannibalized = new Set(
    cannibalization.flatMap((group) => group.posts.map((post) => post.id)),
  ).size;

  const summary = {
    total,
    published: audited.filter((entry) => entry.row.status === 'published').length,
    withErrors: audited.filter((entry) =>
      entry.result.issues.some((issue) => issue.severity === 'error'),
    ).length,
    withWarnings: audited.filter((entry) =>
      entry.result.issues.some((issue) => issue.severity === 'warning'),
    ).length,
    averageScore:
      total === 0
        ? 0
        : Math.round(audited.reduce((sum, entry) => sum + entry.result.score, 0) / total),
    orphans: orphans.length,
    cannibalized,
    refreshCandidates: audited.filter((entry) => entry.result.isRefreshCandidate).length,
    brokenLinks: brokenLinks.length,
    refreshAfterDays,
  };

  const posts = audited.map(({ row, result }) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    targetKeyword: row.focus_keyword,
    intent: row.target_intent,
    score: result.score,
    issues: result.issues,
    wordCount: result.wordCount,
    internalLinks: result.internalLinks,
    externalLinks: result.externalLinks,
    updatedAt: row.updated_date,
    pubDate: row.pub_date,
    isRefreshCandidate: result.isRefreshCandidate,
  }));

  return jsonOk({ summary, posts, cannibalization, orphans, brokenLinks }, requestId);
});
