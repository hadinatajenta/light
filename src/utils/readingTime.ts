const WORDS_PER_MINUTE = 200;

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function calculateReadingTimeMinutes(text: string): number {
  const wordCount = countWords(text);
  return Math.max(1, Math.ceil(wordCount / WORDS_PER_MINUTE));
}

export function formatReadingTime(minutes: number): string {
  return `${minutes} min read`;
}
