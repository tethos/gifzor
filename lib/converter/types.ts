export interface ClipFrame {
  bitmap: ImageBitmap;
  /** presentation timestamp in µs, starting at 0 */
  ts: number;
}

/** Decoded, already sampled + scaled frames. Kept in memory so retries don't decode again. */
export interface DecodedClip {
  frames: ClipFrame[];
  durationUs: number;
  srcWidth: number;
  srcHeight: number;
  /** size of the cached frames */
  width: number;
  height: number;
}

export interface DecodeOptions {
  fps: number;
  /** 0 = original */
  targetWidth: number;
  /** 0 = unlimited */
  maxDurationSec: number;
  onProgress: (p: number) => void;
  signal?: AbortSignal;
}

/** Hard cap to keep memory bounded (~40 s at 15 fps). */
export const MAX_FRAMES = 600;
