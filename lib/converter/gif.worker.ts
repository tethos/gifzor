/// <reference lib="webworker" />
/**
 * GIF encoding worker (gifenc).
 * - one global palette per GIF (computed from sample frames) → no flicker, smaller files
 * - inter-frame optimisation: pixels that did not change are written as transparent,
 *   which compresses much better with LZW (lossless, because the palette index is identical)
 */
import { GIFEncoder, applyPalette, quantize, type Encoder, type Palette } from 'gifenc';

export type WorkerRequest =
  | { type: 'init'; sample: Uint8ClampedArray; colors: number }
  | { type: 'frame'; rgba: Uint8ClampedArray; width: number; height: number; delay: number }
  | { type: 'finish' };

export type WorkerResponse =
  | { type: 'ok' }
  | { type: 'done'; bytes: Uint8Array }
  | { type: 'error'; message: string };

const FORMAT = 'rgb565';

let encoder: Encoder | null = null;
let palette: Palette = [];
let fullPalette: Palette = [];
let transparentIndex = 0;
let prevIndex: Uint8Array | null = null;
let first = true;

function reply(msg: WorkerResponse, transfer: Transferable[] = []) {
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg, transfer);
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  try {
    const m = e.data;
    switch (m.type) {
      case 'init': {
        // Reserve one palette slot for the transparent "unchanged pixel" colour.
        const colors = Math.max(2, Math.min(256, m.colors));
        palette = quantize(m.sample, colors - 1, { format: FORMAT });
        transparentIndex = palette.length;
        fullPalette = [...palette, [0, 0, 0]];
        encoder = GIFEncoder();
        prevIndex = null;
        first = true;
        reply({ type: 'ok' });
        break;
      }
      case 'frame': {
        if (!encoder) throw new Error('encoder not initialised');
        const index = applyPalette(m.rgba, palette, FORMAT);
        let out = index;
        let transparent = false;
        if (prevIndex && prevIndex.length === index.length) {
          out = new Uint8Array(index.length);
          for (let i = 0; i < index.length; i++) {
            out[i] = index[i] === prevIndex[i] ? transparentIndex : index[i];
          }
          transparent = true;
        }
        encoder.writeFrame(out, m.width, m.height, {
          palette: first ? fullPalette : undefined,
          delay: m.delay,
          repeat: 0, // loop forever
          dispose: 1, // keep previous frame (needed for the transparency trick)
          transparent,
          transparentIndex,
        });
        prevIndex = index;
        first = false;
        reply({ type: 'ok' });
        break;
      }
      case 'finish': {
        if (!encoder) throw new Error('encoder not initialised');
        encoder.finish();
        const bytes = encoder.bytes();
        encoder = null;
        prevIndex = null;
        reply({ type: 'done', bytes }, [bytes.buffer]);
        break;
      }
    }
  } catch (err) {
    reply({ type: 'error', message: (err as Error).message || String(err) });
  }
};
