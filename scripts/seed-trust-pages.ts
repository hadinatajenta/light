import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const SOURCE_DIRECTORY = 'scripts/data/trust-pages';
const OUTPUT_FILE = 'dist/seed-trust-pages.sql';

interface TrustPage {
  id: string;
  title: string;
  description: string;
  sortOrder: number;
}

const PAGES: TrustPage[] = [
  {
    id: 'about',
    title: 'About Light Scripts',
    description:
      'Light Scripts is an independent publication of buying guides for desk gear and work devices: chairs, desks, monitors, keyboards, audio, laptops, and tablets.',
    sortOrder: 10,
  },
  {
    id: 'editorial-standards',
    title: 'Editorial standards and research method',
    description:
      'How Light Scripts researches and checks its guides: cited sources, review roundups, AI assistance, editor approval, images, and corrections.',
    sortOrder: 15,
  },
  {
    id: 'contact',
    title: 'Contact',
    description:
      'Contact Light Scripts for corrections, editorial questions, topic suggestions, and press enquiries.',
    sortOrder: 20,
  },
];

function sqlValue(value: string | number | boolean): string {
  if (typeof value === 'number') {
    return String(value);
  }

  if (typeof value === 'boolean') {
    return value ? '1' : '0';
  }

  return `'${value.replace(/'/g, "''")}'`;
}

async function buildStatement(page: TrustPage): Promise<string> {
  const body = (await readFile(join(SOURCE_DIRECTORY, `${page.id}.md`), 'utf8')).trim();
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
    sqlValue(page.id),
    sqlValue(page.title),
    sqlValue(page.description),
    sqlValue(body),
    sqlValue('published'),
    sqlValue(page.title),
    'NULL',
    sqlValue(false),
    sqlValue(true),
    sqlValue(page.sortOrder),
    "datetime('now')",
    "datetime('now')",
  ];

  return `INSERT OR REPLACE INTO pages (${columns.join(', ')}) VALUES (${values.join(', ')});`;
}

async function main(): Promise<void> {
  const statements: string[] = [];

  for (const page of PAGES) {
    statements.push(await buildStatement(page));
  }

  await mkdir(dirname(OUTPUT_FILE), { recursive: true });
  await writeFile(OUTPUT_FILE, `${statements.join('\n')}\n`);
  console.log(`Wrote ${statements.length} trust page(s) to ${OUTPUT_FILE}`);
}

await main();
