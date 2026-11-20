const MEASURED_CHARACTERS =
  ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~’‘“”–—…·é';

const MEASURED_ADVANCES = [
  190, 306, 482, 732, 652, 786, 774, 268, 456, 456, 441, 551, 285, 486, 285, 445, 682, 385, 563,
  582, 622, 585, 623, 575, 606, 624, 285, 285, 551, 551, 551, 587, 874, 736, 649, 750, 756, 626,
  590, 763, 720, 254, 413, 722, 590, 894, 720, 798, 672, 815, 668, 652, 672, 700, 736, 1086, 716,
  712, 635, 456, 445, 456, 551, 486, 354, 571, 628, 562, 628, 574, 378, 628, 619, 270, 270, 569,
  270, 950, 619, 604, 628, 628, 398, 504, 421, 611, 543, 816, 605, 543, 522, 456, 230, 456, 551,
  285, 285, 502, 502, 606, 906, 765, 165, 574,
];

const UNKNOWN_CHARACTER_ADVANCE = 640;
const UNITS_PER_EM = 1000;

const ADVANCE_BY_CHARACTER = new Map(
  [...MEASURED_CHARACTERS].map((character, index) => [character, MEASURED_ADVANCES[index] ?? 0]),
);

export function measureBoldTextWidth(
  text: string,
  fontSize: number,
  letterSpacingEm: number,
): number {
  let advanceUnits = 0;
  let characterCount = 0;

  for (const character of text) {
    advanceUnits += ADVANCE_BY_CHARACTER.get(character) ?? UNKNOWN_CHARACTER_ADVANCE;
    characterCount += 1;
  }

  return (advanceUnits / UNITS_PER_EM + letterSpacingEm * characterCount) * fontSize;
}
