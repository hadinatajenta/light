import YAML from 'yaml';

export interface ParsedDocument {
  data: Record<string, unknown>;
  body: string;
}

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function parseDocument(raw: string): ParsedDocument {
  const match = raw.match(FRONTMATTER_PATTERN);

  if (!match) {
    return { data: {}, body: raw };
  }

  const data = (YAML.parse(match[1]) ?? {}) as Record<string, unknown>;
  const body = raw.slice(match[0].length).replace(/^\n+/, '');

  return { data, body };
}

export function serializeDocument(data: Record<string, unknown>, body: string): string {
  const frontmatter = YAML.stringify(data, { lineWidth: 0 }).trimEnd();
  return `---\n${frontmatter}\n---\n\n${body.replace(/\s+$/, '')}\n`;
}
