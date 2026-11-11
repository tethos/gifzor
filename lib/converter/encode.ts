import GifWorker from './gif.worker?worker';
import type { WorkerRequest, WorkerResponse } from './gif.worker';
import { AbortError, ConvertError, throwIfAborted } from './errors';
import { frameDelays, scaledSize, selectFrames } from './sampler';
import type { Attempt } from './size-fit';
import type { DecodedClip } from './types';

/** Max pixels used to build the palette (keeps quantisation fast). */
const PALETTE_SAMPLE_PIXELS = 400_000;
const PALETTE_SAMPLE_FRAMES = 12;

class WorkerClient {
  private worker = new GifWorker();

  call(msg: WorkerRequest, transfer: Transferable[] = []): Promise<WorkerResponse> {
    return new Promise((resolve, reject) => {
      this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        if (e.data.type === 'error') reject(new ConvertError('generic', e.data.message));
        else resolve(e.data);
      };
      this.worker.onerror = (e) => reject(new ConvertError('generic', e.message || 'worker error'));
      this.worker.postMessage(msg, transfer);
    });
  }

  terminate() {
    this.worker.terminate();
  }
}

/** Encode the cached clip into a GIF with the given width / fps / colours. */
export async function encodeGif(
  clip: DecodedClip,
  attempt: Attempt,
  onProgress: (p: number) => void,
  signal?: AbortSignal,
): Promise<{ bytes: Uint8Array; width: number; height: number; frames: number }> {
  const { width, height } = scaledSize(clip.width, clip.height, attempt.width);
  const picked = selectFrames(clip.frames, attempt.fps).map((i) => clip.frames[i]);
  if (!picked.length) throw new ConvertError('decode', 'no frames');
  const delays = frameDelays(
    picked.map((f) => f.ts),
    clip.durationUs,
  );

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new ConvertError('generic', '2d context unavailable');
  ctx.imageSmoothingQuality = 'high';
  const draw = (bitmap: ImageBitmap) => {
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    return ctx.getImageData(0, 0, width, height).data;
  };

  const worker = new WorkerClient();
  const onAbort = () => worker.terminate();
  signal?.addEventListener('abort', onAbort);
  try {
    // Palette from evenly spaced sample frames, pixel-subsampled.
    const sampleFrames = Math.min(PALETTE_SAMPLE_FRAMES, picked.length);
    const stride = Math.max(1, Math.floor((width * height * sampleFrames) / PALETTE_SAMPLE_PIXELS));
    const perFrame = Math.ceil((width * height) / stride);
    const sample = new Uint8ClampedArray(perFrame * sampleFrames * 4);
    let o = 0;
    for (let s = 0; s < sampleFrames; s++) {
      const f = picked[Math.floor((s * picked.length) / sampleFrames)];
      const px = draw(f.bitmap);
      for (let i = 0; i < width * height; i += stride) {
        sample.set(px.subarray(i * 4, i * 4 + 4), o);
        o += 4;
      }
    }
    await worker.call({ type: 'init', sample: sample.subarray(0, o), colors: attempt.colors });

    for (let i = 0; i < picked.length; i++) {
      throwIfAborted(signal);
      const rgba = draw(picked[i].bitmap);
      await worker.call({ type: 'frame', rgba, width, height, delay: delays[i] }, [rgba.buffer]);
      onProgress((i + 1) / picked.length);
    }
    const res = await worker.call({ type: 'finish' });
    if (res.type !== 'done') throw new ConvertError('generic', 'unexpected worker response');
    return { bytes: res.bytes, width, height, frames: picked.length };
  } catch (e) {
    if (signal?.aborted) throw new AbortError();
    throw e;
  } finally {
    signal?.removeEventListener('abort', onAbort);
    worker.terminate();
  }
}
