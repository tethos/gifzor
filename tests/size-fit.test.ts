import { describe, expect, it } from 'vitest';
import { MIN_COLORS, MIN_WIDTH, nextAttempt, type Attempt } from '@/lib/converter/size-fit';

const MB = 1024 * 1024;

/** Rough GIF size model (16:9, 15 s clip, ~0.35 bytes/pixel after LZW) to simulate the retry loop. */
const model = (a: Attempt) => a.width * ((a.width * 9) / 16) * a.fps * 15 * 0.35 * (0.6 + (0.4 * a.colors) / 256);

describe('nextAttempt', () => {
  it('returns null when the file already fits', () => {
    expect(nextAttempt({ width: 480, fps: 15, colors: 256 }, 5 * MB, 10 * MB)).toBeNull();
  });

  it('returns null when there is no limit', () => {
    expect(nextAttempt({ width: 480, fps: 15, colors: 256 }, 50 * MB, 0)).toBeNull();
  });

  it('reduces fps and width for a moderately too large file', () => {
    const next = nextAttempt({ width: 480, fps: 20, colors: 256 }, 14 * MB, 10 * MB)!;
    expect(next.fps).toBeLessThan(20);
    expect(next.fps).toBeGreaterThanOrEqual(10);
    expect(next.width).toBeLessThanOrEqual(480);
    expect(next.colors).toBe(256);
  });

  it('never goes below the minimum width / colours', () => {
    let a: Attempt = { width: 200, fps: 10, colors: 64 };
    for (let i = 0; i < 10; i++) {
      const n = nextAttempt(a, 100 * MB, 1 * MB);
      if (!n) break;
      a = n;
    }
    expect(a.width).toBeGreaterThanOrEqual(MIN_WIDTH);
    expect(a.colors).toBeGreaterThanOrEqual(MIN_COLORS);
    expect(nextAttempt({ width: MIN_WIDTH, fps: 8, colors: MIN_COLORS }, 100 * MB, MB)).toBeNull();
  });

  it('converges below the target in a few attempts (size model)', () => {
    let a: Attempt = { width: 640, fps: 20, colors: 256 };
    const target = 10 * MB;
    let size = model(a);
    let attempts = 1;
    while (size > target && attempts < 6) {
      const n = nextAttempt(a, size, target);
      if (!n) break;
      a = n;
      size = model(a);
      attempts++;
    }
    expect(size).toBeLessThanOrEqual(target);
    expect(attempts).toBeLessThanOrEqual(3);
  });
});
