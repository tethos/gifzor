import { ConvertError, throwIfAborted } from './errors';

/** Download a file and report progress (0..1). Never sends cookies or a referrer. */
export async function fetchWithProgress(
  url: string,
  onProgress: (p: number) => void,
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  let res: Response;
  try {
    res = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer', signal });
  } catch (e) {
    throwIfAborted(signal);
    throw new ConvertError('fetch', (e as Error).message || 'network error');
  }
  if (!res.ok) throw new ConvertError('fetch', `HTTP ${res.status}`);

  const total = Number(res.headers.get('content-length')) || 0;
  if (!res.body || !total) {
    const buf = await res.arrayBuffer();
    onProgress(1);
    return buf;
  }

  const reader = res.body.getReader();
  const out = new Uint8Array(total);
  let received = 0;
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (received + value.length <= total) out.set(value, received);
    else chunks.push(value); // content-length was wrong; fall back below
    received += value.length;
    onProgress(Math.min(1, received / total));
  }
  if (!chunks.length && received === total) return out.buffer;

  // Rare: content-length mismatch – reassemble.
  const all = new Uint8Array(received);
  all.set(out.subarray(0, Math.min(total, received)), 0);
  let offset = Math.min(total, received);
  for (const c of chunks) {
    all.set(c, offset);
    offset += c.length;
  }
  return all.buffer;
}
