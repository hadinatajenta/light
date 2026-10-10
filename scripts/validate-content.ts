import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import matter from 'gray-matter';

const CONTENT_DIRECTORY = join(process.cwd(), 'src', 'content', 'blog');
const MINIMUM_WORD_COUNT = 300;
const MINIMUM_DESCRIPTION_LENGTH = 50;
const MAXIMUM_DESCRIPTION_LENGTH = 160;
const MINIMUM_TITLE_LENGTH = 10;
const MAXIMUM_TITLE_LENGTH = 70;
const PLACEHOLDER_PATTERN = /\b(TODO|TBD|FIXME|LOREM IPSUM|XXX)\b/i;

interface ContentViolation {
  file: string;
  message: string;
}

async function collectContentFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectContentFiles(entryPath)));
    } else if (entry.name.endsWith('.md') || entry.name.endsWith('.mdx')) {
      files.push(entryPath);
    }
  }

  return files;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function collectFrontmatterViolations(
  relativePath: string,
  data: Record<string, unknown>,
): ContentViolation[] {
  const violations: ContentViolation[] = [];
  const { title, description, pubDate, cover, coverAlt } = data;

  if (typeof title !== 'string' || title.length === 0) {
    violations.push({ file: relativePath, message: 'missing title' });
  } else if (title.length < MINIMUM_TITLE_LENGTH || title.length > MAXIMUM_TITLE_LENGTH) {
    violations.push({
      file: relativePath,
      message: `title must be between ${MINIMUM_TITLE_LENGTH} and ${MAXIMUM_TITLE_LENGTH} characters`,
    });
  }

  if (typeof description !== 'string' || description.length === 0) {
    violations.push({ file: relativePath, message: 'missing description' });
  } else if (
    description.length < MINIMUM_DESCRIPTION_LENGTH ||
    description.length > MAXIMUM_DESCRIPTION_LENGTH
  ) {
    violations.push({
      file: relativePath,
      message: `description must be between ${MINIMUM_DESCRIPTION_LENGTH} and ${MAXIMUM_DESCRIPTION_LENGTH} characters`,
    });
  }

  if (!pubDate) {
    violations.push({ file: relativePath, message: 'missing pubDate' });
  }

  if (cover && !coverAlt) {
    violations.push({ file: relativePath, message: 'cover image is missing coverAlt text' });
  }

  return violations;
}

function collectBodyViolations(
  relativePath: string,
  raw: string,
  body: string,
): ContentViolation[] {
  const violations: ContentViolation[] = [];
  const wordCount = countWords(body);

  if (wordCount < MINIMUM_WORD_COUNT) {
    violations.push({
      file: relativePath,
      message: `body has ${wordCount} words, minimum is ${MINIMUM_WORD_COUNT}`,
    });
  }

  if (PLACEHOLDER_PATTERN.test(raw)) {
    violations.push({ file: relativePath, message: 'contains a placeholder token' });
  }

  return violations;
}

async function main(): Promise<void> {
  const files = await collectContentFiles(CONTENT_DIRECTORY);
  const violations: ContentViolation[] = [];
  const slugOwners = new Map<string, string>();

  for (const file of files) {
    const relativePath = file.replace(`${process.cwd()}/`, '');
    const raw = await readFile(file, 'utf8');
    const parsed = matter(raw);
    const data = parsed.data as Record<string, unknown>;

    violations.push(...collectFrontmatterViolations(relativePath, data));
    violations.push(...collectBodyViolations(relativePath, raw, parsed.content));

    if (typeof data.slug === 'string') {
      const owner = slugOwners.get(data.slug);
      if (owner) {
        violations.push({ file: relativePath, message: `duplicate slug also used by ${owner}` });
      } else {
        slugOwners.set(data.slug, relativePath);
      }
    }
  }

  if (violations.length > 0) {
    for (const violation of violations) {
      console.error(`${violation.file}: ${violation.message}`);
    }
    process.exit(1);
  }

  console.log(`Validated ${files.length} content file(s).`);
}

await main();
