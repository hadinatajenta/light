import { ApiError } from '../errors';

const ALGORITHM = 'AES-GCM';
const INITIALIZATION_VECTOR_BYTES = 12;

interface EncryptedPayload {
  iv: string;
  data: string;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function resolveKeyMaterial(explicit?: string): Promise<string> {
  if (explicit) {
    return explicit;
  }

  const { env } = await import('cloudflare:workers');
  const material = (env as unknown as { AGENT_SECRET_KEY?: string }).AGENT_SECRET_KEY;

  if (!material) {
    throw new ApiError(500, 'SECRET_KEY_MISSING', 'The agent secret key is not configured.');
  }

  return material;
}

async function importKey(material: string): Promise<CryptoKey> {
  const bytes = fromBase64(material.trim());
  return crypto.subtle.importKey('raw', bytes, { name: ALGORITHM }, false, ['encrypt', 'decrypt']);
}

export async function encryptSecret(plaintext: string, keyMaterial?: string): Promise<string> {
  const key = await importKey(await resolveKeyMaterial(keyMaterial));
  const iv = crypto.getRandomValues(new Uint8Array(INITIALIZATION_VECTOR_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    new TextEncoder().encode(plaintext),
  );

  const payload: EncryptedPayload = {
    iv: toBase64(iv),
    data: toBase64(new Uint8Array(ciphertext)),
  };

  return JSON.stringify(payload);
}

export async function decryptSecret(payload: string, keyMaterial?: string): Promise<string> {
  let parsed: EncryptedPayload;
  try {
    parsed = JSON.parse(payload) as EncryptedPayload;
  } catch {
    throw new ApiError(500, 'SECRET_CORRUPT', 'The stored secret could not be read.');
  }

  if (!parsed.iv || !parsed.data) {
    throw new ApiError(500, 'SECRET_CORRUPT', 'The stored secret could not be read.');
  }

  const key = await importKey(await resolveKeyMaterial(keyMaterial));

  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: ALGORITHM, iv: fromBase64(parsed.iv) },
      key,
      fromBase64(parsed.data),
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new ApiError(
      500,
      'SECRET_DECRYPT_FAILED',
      'The stored secret could not be decrypted with the current key.',
    );
  }
}

export function maskSecret(value: string): string {
  if (value.length <= 8) {
    return '••••';
  }

  return `${value.slice(0, 3)}••••${value.slice(-4)}`;
}
