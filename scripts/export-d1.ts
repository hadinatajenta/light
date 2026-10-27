import { execFileSync } from 'node:child_process';
import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import YAML from 'yaml';

const BLOG_DIRECTORY = 'src/content/blog';
const CATEGORIES_PATH = 'src/data/categories.json';
const MEDIA_PATH = 'src/data/media.json';
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
  target_intent: string | null;
  affiliate: number;
  faq: string;
  pub_date: string | null;
  updated_date: string | null;
}

interface CategoryRow {
  slug: string;
  label: string;
  description: string;
}

interface MediaRow {
  id: string;
  path: string;
  url: string;
  alt: string;
  mime: string;
  bytes: number;
  created_at: string;
}

function queryRows<T>(command: string): T[] {
  const output = execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', DATABASE_NAME, '--remote', '--json', '--command', command],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 128 * 1024 * 1024 },
  );

  const parsed = JSON.parse(output) as Array<{ results?: T[] }>;
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
  if (row.target_intent) {
    frontmatter.targetIntent = row.target_intent;
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

async function exportPosts(): Promise<number> {
  const rows = queryRows<PostRow>('SELECT * FROM posts ORDER BY id');
  const expected = new Set(rows.map((row) => `${row.id}.md`));
  let changed = 0;

  for (const row of rows) {
    const path = join(BLOG_DIRECTORY, `${row.id}.md`);
    if (await writeIfChanged(path, buildMarkdownFile(row))) {
      changed += 1;
    }
  }

  for (const name of await readdir(BLOG_DIRECTORY)) {
    if (!/\.mdx?$/.test(name) || expected.has(name)) {
      continue;
    }

    await rm(join(BLOG_DIRECTORY, name));
    changed += 1;
  }

  return changed;
}

async function exportCategories(): Promise<number> {
  const rows = queryRows<CategoryRow>(
    'SELECT slug, label, description FROM categories ORDER BY rowid',
  );
  const categories = rows.map((row) => ({
    slug: row.slug,
    label: row.label,
    description: row.description,
  }));

  const changed = await writeIfChanged(CATEGORIES_PATH, `${JSON.stringify(categories, null, 2)}\n`);

  return changed ? 1 : 0;
}

async function exportMedia(): Promise<number> {
  const rows = queryRows<MediaRow>(
    'SELECT id, path, url, alt, mime, bytes, created_at FROM media ORDER BY created_at DESC',
  );
  const items = rows.map((row) => ({
    id: row.id,
    path: row.path,
    url: row.url,
    alt: row.alt,
    mime: row.mime,
    bytes: row.bytes,
    createdAt: row.created_at,
  }));

  const changed = await writeIfChanged(MEDIA_PATH, `${JSON.stringify(items, null, 2)}\n`);

  return changed ? 1 : 0;
}

async function main(): Promise<void> {
  const postChanges = await exportPosts();
  const categoryChanges = await exportCategories();
  const mediaChanges = await exportMedia();

  console.log(
    `Exported posts (${postChanges}), categories (${categoryChanges}), media (${mediaChanges}) file(s) changed.`,
  );
}

await main();
