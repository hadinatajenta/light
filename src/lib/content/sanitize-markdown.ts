import type { Token } from 'marked';
import { decodeEntities } from '../net/html-text';

const UNSAFE_URL_SCHEMES = ['javascript:', 'data:', 'vbscript:', 'file:'];

const SPACE_CHARACTER_CODE = 0x20;
const DELETE_CHARACTER_CODE = 0x7f;

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
};

interface MarkdownTokenNode {
  type: string;
  block?: boolean;
  escaped?: boolean;
  href?: unknown;
  raw?: unknown;
  text?: unknown;
  tokens?: unknown;
  [property: string]: unknown;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>]/g, (character) => HTML_ESCAPES[character]);
}

function stripUrlWhitespaceAndControls(value: string): string {
  const keptCharacters = [...value].filter((character) => {
    const characterCode = character.charCodeAt(0);

    return characterCode > SPACE_CHARACTER_CODE && characterCode !== DELETE_CHARACTER_CODE;
  });

  return keptCharacters.join('');
}

function isUnsafeUrl(href: string): boolean {
  const normalizedHref = stripUrlWhitespaceAndControls(decodeEntities(href)).toLowerCase();

  return UNSAFE_URL_SCHEMES.some((scheme) => normalizedHref.startsWith(scheme));
}

function toTextNode(token: MarkdownTokenNode): MarkdownTokenNode {
  return { type: 'text', raw: readString(token.raw), text: readString(token.text) };
}

function neutralizeHtmlToken(token: MarkdownTokenNode): MarkdownTokenNode {
  const raw = readString(token.raw);
  const escapedText = escapeHtml(readString(token.text));

  if (token.block === true) {
    return {
      type: 'paragraph',
      raw,
      text: escapedText,
      tokens: [{ type: 'text', raw, text: escapedText, escaped: true }],
    };
  }

  return { type: 'text', raw, text: escapedText, escaped: true };
}

function neutralizeCollection(entries: unknown[]): void {
  entries.forEach((entry, index) => {
    if (Array.isArray(entry)) {
      neutralizeCollection(entry);
      return;
    }

    if (typeof entry !== 'object' || entry === null) {
      return;
    }

    const node = entry as MarkdownTokenNode;

    if (typeof node.type !== 'string') {
      neutralizeNestedCollections(node);
      return;
    }

    entries[index] = neutralizeToken(node);
  });
}

function neutralizeNestedCollections(node: MarkdownTokenNode): void {
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      neutralizeCollection(value);
    }
  }
}

function neutralizeToken(token: MarkdownTokenNode): MarkdownTokenNode {
  if (token.type === 'html') {
    return neutralizeHtmlToken(token);
  }

  if ((token.type === 'link' || token.type === 'image') && isUnsafeUrl(readString(token.href))) {
    return toTextNode(token);
  }

  neutralizeNestedCollections(token);

  return token;
}

export function sanitizeMarkdownTokens(tokens: Token[]): void {
  neutralizeCollection(tokens);
}
