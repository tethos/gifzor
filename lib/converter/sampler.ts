/**
 * Frame sampling: picks source frames for a target frame rate and computes GIF frame delays.
 * All times are in microseconds.
 */

export interface TimedFrame {
  /** presentation timestamp in µs */
  ts: number;
}

/** Streaming sampler used while decoding: keep(ts) says whether a frame should be kept. */
export class FrameSampler {
  private next = 0;
  private readonly step: number;

  constructor(fps: number) {
    this.step = 1e6 / fps;
  }

  keep(ts: number): boolean {
    // Small tolerance so 30→15 fps reliably keeps every second frame.
    if (ts + this.step * 0.1 < this.next) return false;
    this.next = Math.max(this.next + this.step, ts + this.step * 0.5);
    return true;
  }
}

/** Select indices of frames (sorted by ts) for a target fps. */
export function selectFrames(frames: TimedFrame[], fps: number): number[] {
  const sampler = new FrameSampler(fps);
  const out: number[] = [];
  frames.forEach((f, i) => {
    if (sampler.keep(f.ts)) out.push(i);
  });
  return out;
}

/**
 * GIF delays in ms (multiples of 10, since GIF stores centiseconds) for the selected frames.
 * Rounding error is carried forward so the total length stays accurate.
 */
export function frameDelays(timestamps: number[], durationUs: number): number[] {
  const delays: number[] = [];
  let carry = 0;
  for (let i = 0; i < timestamps.length; i++) {
    const end = i + 1 < timestamps.length ? timestamps[i + 1] : durationUs;
    const exactCs = Math.max(0, end - timestamps[i]) / 1e4 + carry;
    let cs = Math.round(exactCs);
    // Browsers render delays < 2cs as ~10cs, so never go below 2.
    cs = Math.max(2, cs);
    carry = exactCs - cs;
    delays.push(cs * 10);
  }
  return delays;
}

/** Output size for a target width (0 = original), never upscaling. */
export function scaledSize(srcW: number, srcH: number, targetW: number): { width: number; height: number } {
  const width = Math.max(1, Math.round(targetW > 0 ? Math.min(targetW, srcW) : srcW));
  const height = Math.max(1, Math.round((srcH * width) / srcW));
  return { width, height };
}
