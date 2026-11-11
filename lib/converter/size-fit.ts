/** Strategy for shrinking a GIF that is larger than the size limit. */

export interface Attempt {
  width: number;
  fps: number;
  colors: number;
}

export const MIN_WIDTH = 160;
export const MIN_FPS = 8;
export const MIN_COLORS = 32;
export const MAX_ATTEMPTS = 6;
/** Aim a bit below the limit because GIF size is not perfectly predictable. */
const SAFETY = 0.9;

/**
 * Compute the next encode attempt after an attempt produced `actualBytes`.
 * GIF size scales roughly with width² × fps, and somewhat with the palette size.
 * Returns null when the result already fits or nothing can be reduced any further.
 */
export function nextAttempt(prev: Attempt, actualBytes: number, targetBytes: number): Attempt | null {
  if (targetBytes <= 0 || actualBytes <= targetBytes) return null;
  let need = (targetBytes / actualBytes) * SAFETY; // required size factor, < 1

  // 1) Frame rate: take at most a third of the reduction from fps (fewer frames = linear).
  let fps = prev.fps;
  if (fps > 10) {
    const factor = Math.max(10 / fps, Math.cbrt(need));
    fps = Math.max(10, Math.round(fps * factor));
  } else if (need < 0.5 && fps > MIN_FPS) {
    fps = MIN_FPS;
  }
  need /= fps / prev.fps;

  // 2) Resolution: size ~ area.
  let width = prev.width;
  if (need < 1 && width > MIN_WIDTH) {
    width = Math.max(MIN_WIDTH, Math.floor(width * Math.sqrt(need)));
    need /= (width / prev.width) ** 2;
  }

  // 3) Colors: only when resolution is exhausted.
  let colors = prev.colors;
  if (need < 0.98 && colors > MIN_COLORS) {
    colors = Math.max(MIN_COLORS, colors / 2);
  }

  if (width === prev.width && fps === prev.fps && colors === prev.colors) return null;
  return { width, fps, colors };
}
