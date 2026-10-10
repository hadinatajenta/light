export type ImageExtension = 'jpg' | 'png' | 'gif' | 'webp' | 'avif';

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return signature.every((value, index) => bytes[offset + index] === value);
}

function asciiAt(bytes: Uint8Array, offset: number, text: string): boolean {
  return [...text].every((character, index) => bytes[offset + index] === character.charCodeAt(0));
}

export function detectImageExtension(bytes: Uint8Array): ImageExtension | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return 'jpg';
  }

  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) {
    return 'png';
  }

  if (asciiAt(bytes, 0, 'GIF8')) {
    return 'gif';
  }

  if (asciiAt(bytes, 0, 'RIFF') && asciiAt(bytes, 8, 'WEBP')) {
    return 'webp';
  }

  if (asciiAt(bytes, 4, 'ftyp') && (asciiAt(bytes, 8, 'avif') || asciiAt(bytes, 8, 'avis'))) {
    return 'avif';
  }

  return null;
}

export const IMAGE_CONTENT_TYPES: Record<ImageExtension, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
};
