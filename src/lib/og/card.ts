import { topicLabel } from '../content/topics';
import { measureBoldTextWidth } from './title-metrics';

export const OG_CARD_WIDTH = 1200;
export const OG_CARD_HEIGHT = 630;
export const OG_CARD_FONT_FAMILY = 'Instrument Sans';

const INK_COLOR = '#0A0A0B';
const ACCENT_COLOR = '#2BB3A0';
const TITLE_MAX_WIDTH = 820;
const TITLE_MAX_LINES = 2;
const TITLE_LETTER_SPACING_EM = -0.01;
const TITLE_FONT_SIZES = [60, 56, 52, 48] as const;
const TITLE_FIT_SAFETY_RATIO = 0.96;
const ELLIPSIS = '…';
const COMPARISON_PATTERN = /\svs\.?\s/i;

const BOTTOM_SCRIM =
  'linear-gradient(180deg, rgba(10, 10, 11, 0) 35%, rgba(10, 10, 11, 0.55) 75%, rgba(10, 10, 11, 0.92) 100%)';
const LEFT_SCRIM = 'linear-gradient(90deg, rgba(10, 10, 11, 0.7) 0%, rgba(10, 10, 11, 0) 70%)';

export interface CardElement {
  type: string;
  props: {
    style?: Record<string, string | number>;
    children?: string | CardElement | CardElement[];
    [prop: string]: unknown;
  };
}

export interface CardKickerSource {
  title: string;
  category: string | null;
  tags: string[];
}

export interface CardContent {
  title: string;
  kicker: string;
  coverImage: ArrayBuffer | null;
}

export interface FittedTitle {
  text: string;
  fontSize: number;
}

export function buildCardKicker(post: CardKickerSource): string {
  const format = COMPARISON_PATTERN.test(post.title) ? 'COMPARISON' : 'BUYING GUIDE';
  const topicSlug = post.category ?? post.tags[0];

  return topicSlug ? `${format} · ${topicLabel(topicSlug).toUpperCase()}` : format;
}

function measureTitle(text: string, fontSize: number): number {
  return measureBoldTextWidth(text, fontSize, TITLE_LETTER_SPACING_EM);
}

function wrapTitleWords(words: string[], fontSize: number): string[] {
  const usableWidth = TITLE_MAX_WIDTH * TITLE_FIT_SAFETY_RATIO;
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const candidateLine = currentLine ? `${currentLine} ${word}` : word;
    if (!currentLine || measureTitle(candidateLine, fontSize) <= usableWidth) {
      currentLine = candidateLine;
      continue;
    }

    lines.push(currentLine);
    currentLine = word;
  }

  return currentLine ? [...lines, currentLine] : lines;
}

function fitsOnTitleLines(lines: string[], fontSize: number): boolean {
  const usableWidth = TITLE_MAX_WIDTH * TITLE_FIT_SAFETY_RATIO;
  return (
    lines.length <= TITLE_MAX_LINES &&
    lines.every((line) => measureTitle(line, fontSize) <= usableWidth)
  );
}

function truncateTitle(words: string[], fontSize: number): string {
  const keptWords = [...words];

  while (keptWords.length > 1) {
    keptWords.pop();
    const candidate = `${keptWords.join(' ').replace(/[\s,.;:–—-]+$/u, '')}${ELLIPSIS}`;
    if (fitsOnTitleLines(wrapTitleWords(candidate.split(' '), fontSize), fontSize)) {
      return candidate;
    }
  }

  return `${keptWords[0] ?? ''}${ELLIPSIS}`;
}

export function fitCardTitle(title: string): FittedTitle {
  const words = title.trim().split(/\s+/).filter(Boolean);

  for (const fontSize of TITLE_FONT_SIZES) {
    if (fitsOnTitleLines(wrapTitleWords(words, fontSize), fontSize)) {
      return { text: words.join(' '), fontSize };
    }
  }

  const smallestFontSize = TITLE_FONT_SIZES[TITLE_FONT_SIZES.length - 1];
  return { text: truncateTitle(words, smallestFontSize), fontSize: smallestFontSize };
}

function createElement(
  type: string,
  style: Record<string, string | number>,
  children?: string | CardElement | CardElement[],
): CardElement {
  return { type, props: children === undefined ? { style } : { style, children } };
}

const FULL_BLEED_STYLE = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: OG_CARD_WIDTH,
  height: OG_CARD_HEIGHT,
} as const;

function buildCoverLayers(coverImage: ArrayBuffer | null): CardElement[] {
  const scrims = [
    createElement('div', { ...FULL_BLEED_STYLE, backgroundImage: BOTTOM_SCRIM }),
    createElement('div', { ...FULL_BLEED_STYLE, backgroundImage: LEFT_SCRIM }),
  ];

  if (!coverImage) {
    return scrims;
  }

  const coverLayer: CardElement = {
    type: 'img',
    props: { src: coverImage, style: { ...FULL_BLEED_STYLE, objectFit: 'cover' } },
  };

  return [coverLayer, ...scrims];
}

function buildKickerRow(kicker: string): CardElement {
  return createElement('div', { display: 'flex', alignItems: 'center' }, [
    createElement('div', { width: 5, height: 22, backgroundColor: ACCENT_COLOR }),
    createElement(
      'div',
      { marginLeft: 12, color: ACCENT_COLOR, fontSize: 20, fontWeight: 600, letterSpacing: 3 },
      kicker,
    ),
  ]);
}

function buildTitleBlock(title: string): CardElement {
  const fittedTitle = fitCardTitle(title);

  return createElement(
    'div',
    {
      marginTop: 20,
      maxWidth: TITLE_MAX_WIDTH,
      color: '#FFFFFF',
      fontSize: fittedTitle.fontSize,
      fontWeight: 700,
      lineHeight: 1.05,
      letterSpacing: TITLE_LETTER_SPACING_EM * fittedTitle.fontSize,
      lineClamp: TITLE_MAX_LINES,
    },
    fittedTitle.text,
  );
}

function buildWordmark(): CardElement {
  return createElement(
    'div',
    { position: 'absolute', right: 32, bottom: 32, display: 'flex', fontSize: 22, fontWeight: 700 },
    [
      createElement('div', { color: 'rgba(255, 255, 255, 0.85)' }, 'Light Scripts'),
      createElement('div', { color: ACCENT_COLOR }, '.'),
    ],
  );
}

export function buildCardElement(content: CardContent): CardElement {
  const textBlock = createElement(
    'div',
    { position: 'absolute', left: 72, bottom: 64, display: 'flex', flexDirection: 'column' },
    [buildKickerRow(content.kicker), buildTitleBlock(content.title)],
  );

  return createElement(
    'div',
    {
      position: 'relative',
      display: 'flex',
      width: OG_CARD_WIDTH,
      height: OG_CARD_HEIGHT,
      backgroundColor: INK_COLOR,
      fontFamily: OG_CARD_FONT_FAMILY,
    },
    [...buildCoverLayers(content.coverImage), textBlock, buildWordmark()],
  );
}
