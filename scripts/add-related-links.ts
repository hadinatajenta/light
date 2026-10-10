import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import matter from 'gray-matter';

const BLOG_DIRECTORY = 'src/content/blog';
const MAX_RELATED = 3;
const RELATED_HEADING = '## Related guides';
const SOURCES_HEADING = '## Sources and further reading';

interface Article {
  id: string;
  path: string;
  raw: string;
  title: string;
  status: string;
  category: string;
  tags: string[];
  body: string;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readTags(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function similarity(source: Article, candidate: Article): number {
  const sharedTags = source.tags.filter((tag) => candidate.tags.includes(tag)).length;
  const sameCategory = source.category && source.category === candidate.category ? 1 : 0;
  return sharedTags * 2 + sameCategory;
}

function buildRelatedSection(related: Article[]): string {
  const lines = related.map((article) => `- [${article.title}](/blog/${article.id}/)`);
  return `${RELATED_HEADING}\n\n${lines.join('\n')}`;
}

function insertRelated(body: string, section: string): string {
  const sourcesIndex = body.indexOf(SOURCES_HEADING);

  if (sourcesIndex === -1) {
    return `${body.trimEnd()}\n\n${section}\n`;
  }

  const before = body.slice(0, sourcesIndex).trimEnd();
  const after = body.slice(sourcesIndex).trimEnd();
  return `${before}\n\n${section}\n\n${after}\n`;
}

async function loadArticles(): Promise<Article[]> {
  const names = await readdir(BLOG_DIRECTORY);
  const articles: Article[] = [];

  for (const name of names) {
    if (!name.endsWith('.md')) {
      continue;
    }

    const path = join(BLOG_DIRECTORY, name);
    const raw = await readFile(path, 'utf8');
    const parsed = matter(raw);

    articles.push({
      id: name.replace(/\.md$/, ''),
      path,
      raw,
      title: readString(parsed.data.title),
      status: readString(parsed.data.status),
      category: readString(parsed.data.category),
      tags: readTags(parsed.data.tags),
      body: parsed.content,
    });
  }

  return articles;
}

async function main(): Promise<void> {
  const articles = await loadArticles();
  const published = articles.filter((article) => article.status === 'published');
  let updated = 0;

  for (const article of published) {
    const related = published
      .filter((candidate) => candidate.id !== article.id)
      .map((candidate) => ({ candidate, score: similarity(article, candidate) }))
      .filter((entry) => entry.score > 0)
      .sort((first, second) => second.score - first.score)
      .slice(0, MAX_RELATED)
      .map((entry) => entry.candidate);

    if (related.length === 0) {
      continue;
    }

    const withoutExisting = article.body.replace(
      new RegExp(`\\n*${RELATED_HEADING}[\\s\\S]*?(?=\\n## |$)`),
      '',
    );

    const nextBody = insertRelated(withoutExisting, buildRelatedSection(related));
    if (nextBody === article.body) {
      continue;
    }

    const nextRaw = article.raw.replace(article.body, nextBody);
    await writeFile(article.path, nextRaw);
    updated += 1;
  }

  console.log(`Updated ${updated} of ${published.length} published article(s) with related links.`);
}

await main();
