import { describe, expect, it } from 'vitest';
import {
  buildCardElement,
  buildCardKicker,
  type CardElement,
  fitCardTitle,
  OG_CARD_HEIGHT,
  OG_CARD_WIDTH,
} from './card';
import { measureBoldTextWidth } from './title-metrics';

function listChildren(element: CardElement): CardElement[] {
  const { children } = element.props;
  if (Array.isArray(children)) {
    return children;
  }

  return children && typeof children === 'object' ? [children] : [];
}

function collectTexts(element: CardElement): string[] {
  const { children } = element.props;
  if (typeof children === 'string') {
    return [children];
  }

  return listChildren(element).flatMap(collectTexts);
}

describe('buildCardKicker', () => {
  it('labels a guide with its category topic', () => {
    expect(
      buildCardKicker({ title: 'How to choose a monitor arm', category: 'monitors', tags: [] }),
    ).toBe('BUYING GUIDE · MONITORS');
  });

  it('falls back to the first tag when the category is missing', () => {
    expect(
      buildCardKicker({ title: 'Plan a desk you keep', category: null, tags: ['desk-setup'] }),
    ).toBe('BUYING GUIDE · DESK SETUP');
  });

  it('switches to comparison for a versus title', () => {
    expect(
      buildCardKicker({
        title: 'M6 MacBook Pro vs M5 Pro ProLED: which to buy',
        category: 'laptops',
        tags: [],
      }),
    ).toBe('COMPARISON · LAPTOPS');
  });

  it('does not treat a word containing vs as a comparison', () => {
    expect(
      buildCardKicker({ title: 'Canvs and covers explained', category: null, tags: ['audio'] }),
    ).toBe('BUYING GUIDE · AUDIO');
  });

  it('drops the topic when the post has no category or tags', () => {
    expect(buildCardKicker({ title: 'Untitled guide', category: null, tags: [] })).toBe(
      'BUYING GUIDE',
    );
  });
});

describe('fitCardTitle', () => {
  it('keeps a short title at the largest size', () => {
    expect(fitCardTitle('How to choose a monitor arm')).toEqual({
      text: 'How to choose a monitor arm',
      fontSize: 60,
    });
  });

  it('steps the size down before truncating a long title', () => {
    const title = 'Which 27-inch 4K OLED monitor is best for office work';
    const fittedTitle = fitCardTitle(title);

    expect(fittedTitle.text).toBe(title);
    expect(fittedTitle.fontSize).toBeLessThan(60);
    expect(fittedTitle.fontSize).toBeGreaterThanOrEqual(48);
  });

  it('truncates with an ellipsis at the smallest size when nothing fits', () => {
    const title = Array.from({ length: 12 }, () => 'Ergonomic adjustable').join(' ');
    const fittedTitle = fitCardTitle(title);

    expect(fittedTitle.fontSize).toBe(48);
    expect(fittedTitle.text.endsWith('…')).toBe(true);
    expect(fittedTitle.text.length).toBeLessThan(title.length);
    expect(measureBoldTextWidth(fittedTitle.text, 48, -0.01)).toBeLessThanOrEqual(820 * 2);
  });

  it('strips trailing punctuation before the ellipsis', () => {
    const title = `${Array.from({ length: 6 }, () => 'Standing desk frames,').join(' ')} and more`;

    expect(fitCardTitle(title).text).not.toMatch(/[,\s]…$/);
  });
});

describe('measureBoldTextWidth', () => {
  it('scales linearly with the font size', () => {
    const smallWidth = measureBoldTextWidth('Monitor', 30, 0);

    expect(measureBoldTextWidth('Monitor', 60, 0)).toBeCloseTo(smallWidth * 2);
  });

  it('measures unknown characters with a fallback advance', () => {
    expect(measureBoldTextWidth('漢', 100, 0)).toBeGreaterThan(0);
  });
});

describe('buildCardElement', () => {
  const content = { title: 'How to choose a monitor arm', kicker: 'BUYING GUIDE · MONITORS' };

  it('renders a full-size card with the kicker, title and wordmark', () => {
    const card = buildCardElement({ ...content, coverImage: new ArrayBuffer(8) });

    expect(card.props.style).toMatchObject({ width: OG_CARD_WIDTH, height: OG_CARD_HEIGHT });
    expect(collectTexts(card)).toEqual([
      'BUYING GUIDE · MONITORS',
      'How to choose a monitor arm',
      'Light Scripts',
      '.',
    ]);
  });

  it('places the cover image underneath both scrims', () => {
    const coverImage = new ArrayBuffer(8);
    const layers = listChildren(buildCardElement({ ...content, coverImage }));

    expect(layers[0]?.type).toBe('img');
    expect(layers[0]?.props.src).toBe(coverImage);
    expect(layers[1]?.props.style?.backgroundImage).toContain('180deg');
    expect(layers[2]?.props.style?.backgroundImage).toContain('90deg');
  });

  it('falls back to the solid ink background without a cover', () => {
    const card = buildCardElement({ ...content, coverImage: null });
    const layers = listChildren(card);

    expect(card.props.style?.backgroundColor).toBe('#0A0A0B');
    expect(layers.some((layer) => layer.type === 'img')).toBe(false);
    expect(layers).toHaveLength(4);
  });
});
