import { describe, expect, it } from 'vitest';
import { frameDelays, scaledSize, selectFrames } from '@/lib/converter/sampler';

const frames = (fps: number, seconds: number) =>
  Array.from({ length: Math.round(fps * seconds) }, (_, i) => ({ ts: Math.round((i * 1e6) / fps) }));

describe('selectFrames', () => {
  it('keeps every second frame for 30 → 15 fps', () => {
    const idx = selectFrames(frames(30, 2), 15);
    expect(idx).toHaveLength(30);
    expect(idx.slice(0, 4)).toEqual([0, 2, 4, 6]);
  });

  it('keeps all frames when the target fps is higher than the source', () => {
    expect(selectFrames(frames(10, 1), 20)).toHaveLength(10);
  });

  it('handles 24 → 10 fps', () => {
    const n = selectFrames(frames(24, 3), 10).length;
    expect(n).toBeGreaterThanOrEqual(29);
    expect(n).toBeLessThanOrEqual(31);
  });
});

describe('frameDelays', () => {
  it('keeps the total duration accurate despite centisecond rounding', () => {
    const ts = frames(15, 4).map((f) => f.ts);
    const delays = frameDelays(ts, 4e6);
    const total = delays.reduce((a, b) => a + b, 0);
    expect(Math.abs(total - 4000)).toBeLessThanOrEqual(10);
    delays.forEach((d) => expect(d % 10).toBe(0));
  });

  it('never produces delays below 20 ms', () => {
    frameDelays([0, 1000, 2000], 3000).forEach((d) => expect(d).toBeGreaterThanOrEqual(20));
  });
});

describe('scaledSize', () => {
  it('scales proportionally', () => {
    expect(scaledSize(1280, 720, 480)).toEqual({ width: 480, height: 270 });
  });
  it('never upscales', () => {
    expect(scaledSize(320, 240, 480)).toEqual({ width: 320, height: 240 });
  });
  it('uses the original size for width 0', () => {
    expect(scaledSize(498, 280, 0)).toEqual({ width: 498, height: 280 });
  });
});
