import type { ConvertJob, ConvertResult, ProgressInfo } from '../messages';
import { decodeWithVideoElement } from './decode-video';
import { decodeWithWebCodecs } from './decode-webcodecs';
import { encodeGif } from './encode';
import { AbortError, ConvertError } from './errors';
import { fetchWithProgress } from './fetch';
import { MAX_ATTEMPTS, nextAttempt, type Attempt } from './size-fit';
import type { DecodedClip, DecodeOptions } from './types';

export { AbortError, ConvertError };

async function decode(buf: ArrayBuffer, o: DecodeOptions): Promise<DecodedClip> {
  try {
    return await decodeWithWebCodecs(buf, o);
  } catch (e) {
    if (e instanceof AbortError) throw e;
    console.warn('[gifzor] WebCodecs decoding failed, falling back to <video>:', e);
    return decodeWithVideoElement(buf, o);
  }
}

/**
 * Full pipeline: download MP4 → decode/sample/scale → encode GIF → shrink until it fits.
 * Must run in a context with DOM + Worker (offscreen document / Firefox background page).
 */
export async function convert(
  job: ConvertJob,
  onProgress: (info: ProgressInfo) => void,
  signal?: AbortSignal,
): Promise<{ gif: Uint8Array; result: ConvertResult }> {
  const o = job.options;
  onProgress({ stage: 'fetch', progress: 0, attempt: 1 });
  const mp4 = await fetchWithProgress(
    job.mp4Url,
    (p) => onProgress({ stage: 'fetch', progress: p, attempt: 1 }),
    signal,
  );

  const clip = await decode(mp4, {
    fps: o.fps,
    targetWidth: o.width,
    maxDurationSec: o.maxDurationSec,
    signal,
    onProgress: (p) => onProgress({ stage: 'decode', progress: p, attempt: 1 }),
  });

  try {
    let attempt: Attempt = { width: clip.width, fps: o.fps, colors: o.colors };
    let n = 1;
    for (;;) {
      const enc = await encodeGif(
        clip,
        attempt,
        (p) => onProgress({ stage: 'encode', progress: p, attempt: n }),
        signal,
      );
      const fits = !o.maxBytes || enc.bytes.length <= o.maxBytes;
      const next = !fits && o.autoFit && n < MAX_ATTEMPTS ? nextAttempt(attempt, enc.bytes.length, o.maxBytes) : null;
      if (!next) {
        return {
          gif: enc.bytes,
          result: {
            bytes: enc.bytes.length,
            width: enc.width,
            height: enc.height,
            fps: attempt.fps,
            colors: attempt.colors,
            frames: enc.frames,
            attempts: n,
            overLimit: !fits,
          },
        };
      }
      attempt = next;
      n++;
    }
  } finally {
    clip.frames.forEach((f) => f.bitmap.close());
  }
}

export function toErrorPayload(e: unknown): { code: ConvertError['code']; message: string } {
  if (e instanceof ConvertError) return { code: e.code, message: e.message };
  return { code: 'generic', message: (e as Error)?.message || String(e) };
}
