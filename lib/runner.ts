/**
 * Runs conversion jobs in a context that has DOM + Worker access:
 * - Chrome: an offscreen document (service workers have no DOM)
 * - Firefox: the background event page itself
 */
import { browser } from 'wxt/browser';
import { bytesToBase64 } from './base64';
import type { ConvertJob, ConvertResult, ErrorCode, OffscreenMessage, ProgressInfo } from './messages';

export interface JobHandle {
  /** Resolves with the result and a blob: URL that can be passed to downloads.download(). */
  promise: Promise<{ result: ConvertResult; blobUrl: string }>;
  cancel(): void;
}

export interface Runner {
  start(jobId: string, job: ConvertJob, onProgress: (info: ProgressInfo) => void): JobHandle;
  /** Release resources for a finished job (blob URL). */
  release(blobUrl: string): void;
}

export class JobError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/* ------------------------------------------------------------------ Firefox */

export function createLocalRunner(): Runner {
  return {
    start(_jobId, job, onProgress) {
      const ctrl = new AbortController();
      const promise = (async () => {
        const { convert, toErrorPayload } = await import('./converter');
        try {
          const { gif, result } = await convert(job, onProgress, ctrl.signal);
          const blobUrl = URL.createObjectURL(new Blob([gif as Uint8Array<ArrayBuffer>], { type: 'image/gif' }));
          if (job.returnData) result.dataB64 = bytesToBase64(gif);
          return { result, blobUrl };
        } catch (e) {
          const p = toErrorPayload(e);
          throw new JobError(p.code, p.message);
        }
      })();
      return { promise, cancel: () => ctrl.abort() };
    },
    release(blobUrl) {
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    },
  };
}

/* ------------------------------------------------------------------- Chrome */

const OFFSCREEN_URL = 'offscreen.html';
const OFFSCREEN_IDLE_MS = 90_000;

export function createOffscreenRunner(): Runner {
  const jobs = new Map<
    string,
    {
      onProgress: (info: ProgressInfo) => void;
      resolve: (v: { result: ConvertResult; blobUrl: string }) => void;
      reject: (e: Error) => void;
    }
  >();
  let creating: Promise<void> | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;

  async function ensureDocument() {
    clearTimeout(idleTimer);
    if (await browser.offscreen.hasDocument()) return;
    creating ??= browser.offscreen
      .createDocument({
        url: browser.runtime.getURL(`/${OFFSCREEN_URL}`),
        reasons: ['WORKERS', 'BLOBS'],
        justification: 'Decode the MP4 and encode the GIF locally in a worker.',
      })
      .finally(() => {
        creating = null;
      });
    await creating;
  }

  function scheduleClose() {
    clearTimeout(idleTimer);
    if (jobs.size) return;
    idleTimer = setTimeout(async () => {
      if (!jobs.size && (await browser.offscreen.hasDocument())) await browser.offscreen.closeDocument();
    }, OFFSCREEN_IDLE_MS);
  }

  browser.runtime.onMessage.addListener((raw: unknown) => {
    const msg = raw as OffscreenMessage;
    if (msg?.target !== 'background') return;
    const job = jobs.get(msg.jobId);
    if (!job) return;
    if (msg.type === 'progress') job.onProgress(msg.info);
    else if (msg.type === 'done') {
      jobs.delete(msg.jobId);
      job.resolve({ result: msg.result, blobUrl: msg.blobUrl });
    } else if (msg.type === 'error') {
      jobs.delete(msg.jobId);
      job.reject(new JobError(msg.code, msg.message));
    }
    scheduleClose();
  });

  const send = (msg: OffscreenMessage) => browser.runtime.sendMessage(msg).catch(() => undefined);

  return {
    start(jobId, job, onProgress) {
      const promise = new Promise<{ result: ConvertResult; blobUrl: string }>((resolve, reject) => {
        jobs.set(jobId, { onProgress, resolve, reject });
        ensureDocument()
          .then(() => send({ target: 'offscreen', type: 'convert', jobId, job }))
          .catch((e) => {
            jobs.delete(jobId);
            reject(new JobError('generic', (e as Error).message));
          });
      });
      return {
        promise,
        cancel() {
          const pending = jobs.get(jobId);
          jobs.delete(jobId);
          pending?.reject(new JobError('generic', 'cancelled'));
          send({ target: 'offscreen', type: 'cancel', jobId });
          scheduleClose();
        },
      };
    },
    release(blobUrl) {
      setTimeout(() => send({ target: 'offscreen', type: 'revoke', url: blobUrl }), 60_000);
    },
  };
}
