import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import YAML from 'yaml';

const BLOG_DIRECTORY = 'src/content/blog';
const OUTPUT_FILE = 'migrations/seed.sql';

interface Frontmatter {
  title?: string;
  description?: string;
  seoTitle?: string;
  status?: string;
  category?: string;
  tags?: string[];
  cover?: string;
  coverUrl?: string;
  coverAlt?: string;
  canonical?: string;
  noindex?: boolean;
  focusKeyword?: string;
  affiliate?: boolean;
  faq?: Array<{ question: string; answer: string }>;
  pubDate?: string;
  updatedDate?: string;
}

function sqlValue(value: unknown): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }

  if (typeof value === 'number') {
    return String(value);
  }

  if (typeof value === 'boolean') {
    return value ? '1' : '0';
  }

  return `'${String(value).replace(/'/g, "''")}'`;
}

function resolveCoverUrl(data: Frontmatter): string | null {
  if (data.coverUrl) {
    return data.coverUrl;
  }

  if (data.cover?.startsWith('../../assets/blog/')) {
    return `/media/${data.cover.split('/').pop()}`;
  }

  return null;
}

async function main(): Promise<void> {
  const names = await readdir(BLOG_DIRECTORY);
  const statements: string[] = [];

  for (const name of names) {
    if (!/\.(md|mdx)$/.test(name)) {
      continue;
    }

    const raw = await readFile(join(BLOG_DIRECTORY, name), 'utf8');
    const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    if (!match) {
      continue;
    }

    const data = (YAML.parse(match[1]) ?? {}) as Frontmatter;
    const body = raw.slice(match[0].length).replace(/^\n+/, '').trimEnd();
    const id = name.replace(/\.(md|mdx)$/, '');
    const now = new Date().toISOString();

    const columns = [
      'id',
      'title',
      'description',
      'seo_title',
      'status',
      'category',
      'tags',
      'body',
      'cover_url',
      'cover_alt',
      'canonical',
      'noindex',
      'focus_keyword',
      'affiliate',
      'faq',
      'pub_date',
      'updated_date',
      'created_at',
      'updated_at',
    ];

    const values = [
      sqlValue(id),
      sqlValue(data.title ?? id),
      sqlValue(data.description ?? ''),
      sqlValue(data.seoTitle ?? null),
      sqlValue(data.status ?? 'draft'),
      sqlValue(data.category ?? null),
      sqlValue(JSON.stringify(data.tags ?? [])),
      sqlValue(body),
      sqlValue(resolveCoverUrl(data)),
      sqlValue(data.coverAlt ?? null),
      sqlValue(data.canonical ?? null),
      sqlValue(Boolean(data.noindex)),
      sqlValue(data.focusKeyword ?? null),
      sqlValue(Boolean(data.affiliate)),
      sqlValue(JSON.stringify(data.faq ?? [])),
      sqlValue(data.pubDate ?? null),
      sqlValue(data.updatedDate ?? null),
      sqlValue(now),
      sqlValue(now),
    ];

    statements.push(
      `INSERT OR REPLACE INTO posts (${columns.join(', ')}) VALUES (${values.join(', ')});`,
    );
  }

  await writeFile(OUTPUT_FILE, `${statements.join('\n')}\n`);
  console.log(`Wrote ${statements.length} post(s) to ${OUTPUT_FILE}`);
}

await main();
