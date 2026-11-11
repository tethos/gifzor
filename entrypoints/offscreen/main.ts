/**
 * Chrome offscreen document: has DOM, Worker and blob URL access, which the MV3 service worker lacks.
 * Only chrome.runtime messaging is available here.
 */
import { browser } from 'wxt/browser';
import { bytesToBase64 } from '@/lib/base64';
import { convert, toErrorPayload } from '@/lib/converter';
import type { OffscreenMessage } from '@/lib/messages';

const controllers = new Map<string, AbortController>();

const send = (msg: OffscreenMessage) => browser.runtime.sendMessage(msg).catch(() => undefined);

browser.runtime.onMessage.addListener((raw: unknown) => {
  const msg = raw as OffscreenMessage;
  if (msg?.target !== 'offscreen') return;

  if (msg.type === 'cancel') {
    controllers.get(msg.jobId)?.abort();
    controllers.delete(msg.jobId);
    return;
  }
  if (msg.type === 'revoke') {
    URL.revokeObjectURL(msg.url);
    return;
  }
  if (msg.type !== 'convert') return;

  const { jobId, job } = msg;
  const ctrl = new AbortController();
  controllers.set(jobId, ctrl);
  let lastSent = 0;

  convert(
    job,
    (info) => {
      // Throttle progress messages (~10/s), but always send stage starts/ends.
      const now = performance.now();
      if (now - lastSent < 100 && info.progress > 0 && info.progress < 1) return;
      lastSent = now;
      send({ target: 'background', type: 'progress', jobId, info });
    },
    ctrl.signal,
  )
    .then(({ gif, result }) => {
      if (ctrl.signal.aborted) return;
      const blobUrl = URL.createObjectURL(new Blob([gif as Uint8Array<ArrayBuffer>], { type: 'image/gif' }));
      if (job.returnData) result.dataB64 = bytesToBase64(gif);
      send({ target: 'background', type: 'done', jobId, result, blobUrl });
    })
    .catch((e) => {
      if (ctrl.signal.aborted) return;
      send({ target: 'background', type: 'error', jobId, ...toErrorPayload(e) });
    })
    .finally(() => controllers.delete(jobId));
});
