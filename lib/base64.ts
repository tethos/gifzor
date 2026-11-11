/** Base64 helpers (runtime messages in Chrome are JSON, so binary data travels as base64). */

export function bytesToBase64(bytes: Uint8Array): string {
  const native = (bytes as Uint8Array & { toBase64?: () => string }).toBase64;
  if (typeof native === 'function') return native.call(bytes);
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const fromBase64 = (Uint8Array as unknown as { fromBase64?: (s: string) => Uint8Array<ArrayBuffer> })
    .fromBase64;
  if (typeof fromBase64 === 'function') return fromBase64(b64);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
