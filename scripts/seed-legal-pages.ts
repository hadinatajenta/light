import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const SOURCE_DIRECTORY = 'scripts/data/pages';
const OUTPUT_FILE = 'dist/seed-legal-pages.sql';

function sqlValue(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

async function main(): Promise<void> {
  const names = await readdir(SOURCE_DIRECTORY);
  const statements: string[] = [];

  for (const name of names) {
    if (!name.endsWith('.md')) {
      continue;
    }

    const id = name.replace(/\.md$/, '');
    const body = (await readFile(join(SOURCE_DIRECTORY, name), 'utf8')).trimEnd();

    statements.push(
      `UPDATE pages SET body = ${sqlValue(body)}, updated_at = datetime('now') WHERE id = ${sqlValue(id)};`,
    );
  }

  await mkdir(dirname(OUTPUT_FILE), { recursive: true });
  await writeFile(OUTPUT_FILE, `${statements.join('\n')}\n`);
  console.log(`Wrote ${statements.length} legal page update(s) to ${OUTPUT_FILE}`);
}

await main();
