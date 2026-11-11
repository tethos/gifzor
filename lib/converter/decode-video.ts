import { ConvertError, throwIfAborted } from './errors';
import { scaledSize } from './sampler';
import { MAX_FRAMES, type ClipFrame, type DecodedClip, type DecodeOptions } from './types';

function waitFor(el: HTMLMediaElement, event: string, timeoutMs = 10_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => done(new ConvertError('decode', `timeout waiting for ${event}`)), timeoutMs);
    const onEvent = () => done();
    const onError = () => done(new ConvertError('decode', el.error?.message || 'media error'));
    function done(err?: Error) {
      clearTimeout(timer);
      el.removeEventListener(event, onEvent);
      el.removeEventListener('error', onError);
      if (err) reject(err);
      else resolve();
    }
    el.addEventListener(event, onEvent);
    el.addEventListener('error', onError);
  });
}

/** Fallback decoder: seeks a <video> element frame by frame. Slower, but works everywhere. */
export async function decodeWithVideoElement(buf: ArrayBuffer, o: DecodeOptions): Promise<DecodedClip> {
  const url = URL.createObjectURL(new Blob([buf], { type: 'video/mp4' }));
  const video = document.createElement('video');
  video.muted = true;
  video.preload = 'auto';
  video.playsInline = true;
  const frames: ClipFrame[] = [];
  try {
    const loaded = waitFor(video, 'loadeddata');
    video.src = url;
    await loaded;

    const srcWidth = video.videoWidth;
    const srcHeight = video.videoHeight;
    if (!srcWidth || !srcHeight) throw new ConvertError('decode', 'video has no dimensions');
    const { width, height } = scaledSize(srcWidth, srcHeight, o.targetWidth);
    const maxSec = o.maxDurationSec > 0 ? o.maxDurationSec : Infinity;
    const duration = Math.min(video.duration || 0, maxSec);
    if (!Number.isFinite(duration) || duration <= 0) throw new ConvertError('decode', 'unknown duration');

    const step = 1 / o.fps;
    const count = Math.min(MAX_FRAMES, Math.max(1, Math.floor(duration / step + 1e-6)));
    for (let i = 0; i < count; i++) {
      throwIfAborted(o.signal);
      const t = i * step;
      const seeked = waitFor(video, 'seeked');
      video.currentTime = t;
      await seeked;
      const bitmap = await createImageBitmap(video, {
        resizeWidth: width,
        resizeHeight: height,
        resizeQuality: 'high',
      });
      frames.push({ bitmap, ts: Math.round(t * 1e6) });
      o.onProgress((i + 1) / count);
    }
    const durationUs = Math.round(Math.min(duration, count * step) * 1e6);
    return { frames, durationUs, srcWidth, srcHeight, width, height };
  } catch (e) {
    frames.forEach((f) => f.bitmap.close());
    throw e;
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}
