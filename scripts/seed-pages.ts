import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const OUTPUT_FILE = 'dist/seed-pages.sql';

interface PageSource {
  id: string;
  file: string;
  sortOrder: number;
}

const PAGE_SOURCES: PageSource[] = [
  { id: 'about', file: 'src/pages/about.astro', sortOrder: 10 },
  { id: 'contact', file: 'src/pages/contact.astro', sortOrder: 20 },
  { id: 'affiliate-disclosure', file: 'src/pages/affiliate-disclosure.astro', sortOrder: 30 },
  { id: 'privacy-policy', file: 'src/pages/privacy-policy.astro', sortOrder: 40 },
  { id: 'cookie-policy', file: 'src/pages/cookie-policy.astro', sortOrder: 50 },
  { id: 'terms', file: 'src/pages/terms.astro', sortOrder: 60 },
];

const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
};

function sqlValue(value: string | number | boolean | null): string {
  if (value === null) {
    return 'NULL';
  }

  if (typeof value === 'number') {
    return String(value);
  }

  if (typeof value === 'boolean') {
    return value ? '1' : '0';
  }

  return `'${value.replace(/'/g, "''")}'`;
}

function decodeEntities(value: string): string {
  return value.replace(
    /&(?:amp|lt|gt|quot|#39|nbsp);/g,
    (entity) => HTML_ENTITIES[entity] ?? entity,
  );
}

function normalizeTags(html: string): string {
  return html.replace(
    /<(\/?[a-zA-Z][^>]*)>/g,
    (_match, inner: string) => `<${inner.replace(/\s+/g, ' ').trim()}>`,
  );
}

function renderInline(fragment: string): string {
  return decodeEntities(fragment.replace(/\s+/g, ' '))
    .trim()
    .replace(
      /<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g,
      (_match, href: string, text: string) => `[${renderInline(text)}](${href})`,
    )
    .replace(
      /<strong[^>]*>([\s\S]*?)<\/strong>/g,
      (_match, text: string) => `**${renderInline(text)}**`,
    )
    .replace(/<em[^>]*>([\s\S]*?)<\/em>/g, (_match, text: string) => `*${renderInline(text)}*`)
    .replace(
      /<code[^>]*>([\s\S]*?)<\/code>/g,
      (_match, text: string) => `\`${renderInline(text)}\``,
    )
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function renderListItems(innerHtml: string, isOrdered: boolean): string {
  const items = [...innerHtml.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)];

  return items
    .map((match, index) => `${isOrdered ? `${index + 1}.` : '-'} ${renderInline(match[1])}`)
    .join('\n');
}

function toMarkdown(html: string): string {
  return html
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/g, (_match, text: string) => `# ${renderInline(text)}\n\n`)
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/g, (_match, text: string) => `## ${renderInline(text)}\n\n`)
    .replace(
      /<h3[^>]*>([\s\S]*?)<\/h3>/g,
      (_match, text: string) => `### ${renderInline(text)}\n\n`,
    )
    .replace(
      /<ul[^>]*>([\s\S]*?)<\/ul>/g,
      (_match, inner: string) => `${renderListItems(inner, false)}\n\n`,
    )
    .replace(
      /<ol[^>]*>([\s\S]*?)<\/ol>/g,
      (_match, inner: string) => `${renderListItems(inner, true)}\n\n`,
    )
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/g, (_match, text: string) => `${renderInline(text)}\n\n`)
    .replace(/<[^>]+>/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/^[ \t]+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractAttribute(attributes: string, name: string): string | null {
  const match = attributes.match(new RegExp(`${name}="([^"]*)"`));
  return match ? decodeEntities(match[1]) : null;
}

async function buildPageStatement(source: PageSource): Promise<string> {
  const raw = await readFile(source.file, 'utf8');
  const withoutFrontmatter = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
  const layoutMatch = withoutFrontmatter.match(/<BaseLayout([\s\S]*?)>/);
  const articleMatch = withoutFrontmatter.match(/<article[^>]*>([\s\S]*)<\/article>/);

  if (!layoutMatch || !articleMatch) {
    throw new Error(`Could not parse ${source.file}`);
  }

  const seoTitle = extractAttribute(layoutMatch[1], 'title');
  const description = extractAttribute(layoutMatch[1], 'description') ?? '';
  const articleHtml = normalizeTags(articleMatch[1]);
  const headingMatch = articleHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  const title = headingMatch ? renderInline(headingMatch[1]) : (seoTitle ?? source.id);
  const body = toMarkdown(articleHtml.replace(/<h1[^>]*>[\s\S]*?<\/h1>/, ''));
  const now = new Date().toISOString();

  const columns = [
    'id',
    'title',
    'description',
    'body',
    'status',
    'seo_title',
    'canonical',
    'noindex',
    'show_in_footer',
    'sort_order',
    'created_at',
    'updated_at',
  ];

  const values = [
    sqlValue(source.id),
    sqlValue(title),
    sqlValue(description),
    sqlValue(body),
    sqlValue('published'),
    sqlValue(seoTitle),
    sqlValue(null),
    sqlValue(false),
    sqlValue(true),
    sqlValue(source.sortOrder),
    sqlValue(now),
    sqlValue(now),
  ];

  return `INSERT OR REPLACE INTO pages (${columns.join(', ')}) VALUES (${values.join(', ')});`;
}

async function main(): Promise<void> {
  const statements: string[] = [];

  for (const source of PAGE_SOURCES) {
    statements.push(await buildPageStatement(source));
  }

  await mkdir(dirname(OUTPUT_FILE), { recursive: true });
  await writeFile(OUTPUT_FILE, `${statements.join('\n')}\n`);
  console.log(`Wrote ${statements.length} page(s) to ${OUTPUT_FILE}`);
}

await main();
