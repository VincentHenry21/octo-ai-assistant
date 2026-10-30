// Real AES-GCM encryption for local memory content, using Web Crypto.
// The passphrase is held only in memory for the session. It is never stored.
// If the passphrase is forgotten, encrypted memories cannot be recovered. That is stated in Settings.
const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: 100000, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}

export async function encryptText(plain: string, passphrase: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, encoder.encode(plain));
  const packed = new Uint8Array(salt.length + iv.length + cipher.byteLength);
  packed.set(salt, 0); packed.set(iv, salt.length); packed.set(new Uint8Array(cipher), salt.length + iv.length);
  return btoa(String.fromCharCode(...packed));
}

export async function decryptText(packedBase64: string, passphrase: string): Promise<string> {
  const packed = Uint8Array.from(atob(packedBase64), (c) => c.charCodeAt(0));
  const salt = packed.slice(0, 16);
  const iv = packed.slice(16, 28);
  const cipher = packed.slice(28);
  const key = await deriveKey(passphrase, salt);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, cipher as BufferSource);
  return decoder.decode(plain);
}

export function looksEncrypted(value: string): boolean {
  try { return value.length > 40 && atob(value).length > 28; } catch { return false; }
}
