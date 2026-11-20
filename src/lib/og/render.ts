import { Resvg } from '@cf-wasm/resvg/legacy';
import { type Font, satori } from '@cf-wasm/satori';
import boldFontDataUrl from '@/assets/fonts/instrument-sans-bold.ttf?inline';
import semiboldFontDataUrl from '@/assets/fonts/instrument-sans-semibold.ttf?inline';
import { type CardElement, OG_CARD_FONT_FAMILY, OG_CARD_HEIGHT, OG_CARD_WIDTH } from './card';

let cachedCardFonts: Font[] | null = null;

function decodeFontDataUrl(fontDataUrl: string): ArrayBuffer {
  const base64Payload = fontDataUrl.slice(fontDataUrl.indexOf(',') + 1);
  return Uint8Array.from(atob(base64Payload), (character) => character.charCodeAt(0)).buffer;
}

function loadCardFonts(): Font[] {
  cachedCardFonts ??= [
    {
      name: OG_CARD_FONT_FAMILY,
      data: decodeFontDataUrl(semiboldFontDataUrl),
      weight: 600,
      style: 'normal',
    },
    {
      name: OG_CARD_FONT_FAMILY,
      data: decodeFontDataUrl(boldFontDataUrl),
      weight: 700,
      style: 'normal',
    },
  ];

  return cachedCardFonts;
}

export async function renderCardPng(cardElement: CardElement): Promise<Uint8Array<ArrayBuffer>> {
  const cardSvg = await satori(cardElement, {
    width: OG_CARD_WIDTH,
    height: OG_CARD_HEIGHT,
    fonts: loadCardFonts(),
  });

  const renderer = await Resvg.async(cardSvg, { fitTo: { mode: 'width', value: OG_CARD_WIDTH } });
  const renderedImage = renderer.render();
  const pngBytes = renderedImage.asPng();
  renderedImage.free();
  renderer.free();

  return new Uint8Array(pngBytes);
}
