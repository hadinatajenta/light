const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '-',
  mdash: '-',
  hellip: '...',
  rsquo: "'",
  lsquo: "'",
  ldquo: '"',
  rdquo: '"',
  laquo: '"',
  raquo: '"',
  middot: '-',
  bull: '-',
  deg: ' degrees',
  times: 'x',
};

const REMOVED_ELEMENTS = [
  'script',
  'style',
  'noscript',
  'svg',
  'template',
  'head',
  'iframe',
  'object',
  'embed',
  'form',
];

const BLOCK_CLOSERS =
  /<\/(p|div|section|article|aside|header|footer|main|nav|li|h[1-6]|tr|table|thead|tbody|ul|ol|blockquote|pre|figure|figcaption|dd|dt|dl)>/gi;

function decodeCodePoint(value: number): string {
  if (!Number.isFinite(value) || value < 0 || value > 0x10ffff) {
    return ' ';
  }
  try {
    return String.fromCodePoint(value);
  } catch {
    return ' ';
  }
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) =>
      decodeCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_match, dec: string) => decodeCodePoint(Number.parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
}

export function htmlToText(html: string): string {
  let text = html;

  for (const tag of REMOVED_ELEMENTS) {
    text = text.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi'), ' ');
  }

  text = text.replace(/<!--[\s\S]*?-->/g, ' ');
  text = text.replace(/<(br|hr)\s*\/?>/gi, '\n');
  text = text.replace(BLOCK_CLOSERS, '\n');
  text = text.replace(/<li\b[^>]*>/gi, '\n- ');
  text = text.replace(/<[^>]+>/g, ' ');
  text = decodeEntities(text);
  text = text.replace(/[ \t\f\v]+/g, ' ');
  text = text.replace(/ *\n */g, '\n');
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}

export function extractHtmlTitle(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (match?.[1]) {
    return decodeEntities(match[1]).replace(/\s+/g, ' ').trim().slice(0, 200);
  }

  const ogMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  if (ogMatch?.[1]) {
    return decodeEntities(ogMatch[1]).replace(/\s+/g, ' ').trim().slice(0, 200);
  }

  return '';
}
