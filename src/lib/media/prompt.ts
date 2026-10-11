const TEXT_FREE_RULE =
  'Completely free of writing and branding: no lettering, words, numbers, captions, signage, posters, book covers, printed pages, sticky notes, packaging, screen interfaces, watermarks, logos or brand emblems. Do not include books, magazines, documents, notebooks, whiteboards or posters. Displays are dark and blank with a uniform bezel and no emblem.';

const SCENE_SHAPE =
  'Tight composition on a single piece of unbranded desk equipment on an empty surface, with a plain, empty, softly blurred wall behind. Only a few plain objects in frame. Natural window light, shallow depth of field, calm neutral palette, realistic materials, and a composition that survives a square crop.';

const SCENE_STOPWORDS = new Set([
  'and',
  'are',
  'best',
  'buy',
  'buying',
  'choose',
  'choosing',
  'for',
  'guide',
  'how',
  'into',
  'its',
  'review',
  'that',
  'the',
  'this',
  'versus',
  'vs',
  'what',
  'when',
  'why',
  'with',
  'your',
]);

const SUBJECT_MAX_LENGTH = 90;
const PROMPT_MAX_LENGTH = 2048;

const PRODUCT_CODE_PATTERNS = [
  /\bASIN[:\s-]*[A-Z0-9]+/gi,
  /\bSKU[:\s-]*[A-Z0-9-]+/gi,
  /\bB0[A-Z0-9]{8}\b/gi,
  /\b[A-Z0-9]{8,12}\b/g,
];

export function stripProductCodes(subject: string): string {
  return PRODUCT_CODE_PATTERNS.reduce((value, pattern) => value.replace(pattern, ' '), subject)
    .replace(/\s+/g, ' ')
    .trim();
}

export function toSceneSubject(subject: string): string {
  return stripProductCodes(subject)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && !SCENE_STOPWORDS.has(token))
    .join(' ')
    .slice(0, SUBJECT_MAX_LENGTH)
    .trim();
}

export function buildScenePrompt(subject: string): string {
  const scene = toSceneSubject(subject);
  const focus = scene.length > 0 ? ` The scene should suggest ${scene}.` : '';
  const prompt = `Photograph of a real, tidy home office.${focus} ${SCENE_SHAPE} ${TEXT_FREE_RULE}`;

  return prompt.slice(0, PROMPT_MAX_LENGTH);
}
