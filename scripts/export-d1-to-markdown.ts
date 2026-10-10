import { execFileSync } from 'node:child_process';
import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import YAML from 'yaml';

const BLOG_DIRECTORY = 'src/content/blog';
const DATABASE_NAME = 'light-content';

interface PostRow {
  id: string;
  title: string;
  description: string;
  seo_title: string | null;
  status: string;
  category: string | null;
  tags: string;
  body: string;
  cover_url: string | null;
  cover_alt: string | null;
  canonical: string | null;
  noindex: number;
  focus_keyword: string | null;
  affiliate: number;
  faq: string;
  pub_date: string | null;
  updated_date: string | null;
}

function fetchPostRows(): PostRow[] {
  const output = execFileSync(
    'npx',
    [
      'wrangler',
      'd1',
      'execute',
      DATABASE_NAME,
      '--remote',
      '--json',
      '--command',
      'SELECT * FROM posts ORDER BY id',
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  );

  const parsed = JSON.parse(output) as Array<{ results?: PostRow[] }>;
  return parsed[0]?.results ?? [];
}

function parseJsonArray(value: string): unknown[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function buildFrontmatter(row: PostRow): Record<string, unknown> {
  const frontmatter: Record<string, unknown> = {
    title: row.title,
    description: row.description,
    status: row.status,
    slug: row.id,
    tags: parseJsonArray(row.tags),
    pubDate: row.pub_date,
    noindex: row.noindex === 1,
    affiliate: row.affiliate === 1,
    faq: parseJsonArray(row.faq),
  };

  if (row.seo_title) {
    frontmatter.seoTitle = row.seo_title;
  }
  if (row.category) {
    frontmatter.category = row.category;
  }
  if (row.updated_date) {
    frontmatter.updatedDate = row.updated_date;
  }
  if (row.cover_url) {
    frontmatter.coverUrl = row.cover_url;
  }
  if (row.cover_alt) {
    frontmatter.coverAlt = row.cover_alt;
  }
  if (row.canonical) {
    frontmatter.canonical = row.canonical;
  }
  if (row.focus_keyword) {
    frontmatter.focusKeyword = row.focus_keyword;
  }

  return frontmatter;
}

function buildMarkdownFile(row: PostRow): string {
  const frontmatter = YAML.stringify(buildFrontmatter(row), { lineWidth: 0 }).trimEnd();
  return `---\n${frontmatter}\n---\n\n${row.body.trimEnd()}\n`;
}

async function writeIfChanged(path: string, next: string): Promise<boolean> {
  const current = await readFile(path, 'utf8').catch(() => null);
  if (current === next) {
    return false;
  }

  await writeFile(path, next);
  return true;
}

async function removeDeletedPosts(expected: Set<string>): Promise<number> {
  let removed = 0;

  for (const name of await readdir(BLOG_DIRECTORY)) {
    if (!/\.mdx?$/.test(name) || expected.has(name)) {
      continue;
    }

    await rm(join(BLOG_DIRECTORY, name));
    removed += 1;
  }

  return removed;
}

async function main(): Promise<void> {
  const rows = fetchPostRows();
  const expected = new Set(rows.map((row) => `${row.id}.md`));
  let changed = 0;

  for (const row of rows) {
    const path = join(BLOG_DIRECTORY, `${row.id}.md`);
    if (await writeIfChanged(path, buildMarkdownFile(row))) {
      changed += 1;
    }
  }

  changed += await removeDeletedPosts(expected);
  console.log(`Exported ${rows.length} post(s); ${changed} file(s) changed.`);
}

await main();
