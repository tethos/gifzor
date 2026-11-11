import { browser, type Browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { CONVERT_PORT, type PortRequest, type PortResponse, type RuntimeRequest } from '@/lib/messages';
import { resolveGifMp4Urls } from '@/lib/mp4url';
import { createLocalRunner, createOffscreenRunner, JobError, type JobHandle, type Runner } from '@/lib/runner';

const MAX_PARALLEL = 2;

export default defineBackground(() => {
  const runner: Runner = import.meta.env.FIREFOX ? createLocalRunner() : createOffscreenRunner();

  /* Simple FIFO queue so that many clicks don't exhaust memory. */
  let active = 0;
  const waiting: Array<() => void> = [];
  async function slot<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= MAX_PARALLEL) await new Promise<void>((r) => waiting.push(r));
    active++;
    try {
      return await fn();
    } finally {
      active--;
      waiting.shift()?.();
    }
  }

  browser.action.onClicked.addListener(() => browser.runtime.openOptionsPage());

  browser.runtime.onMessage.addListener((raw: unknown, _sender, sendResponse) => {
    const msg = raw as RuntimeRequest;
    if (msg?.type === 'resolve-mp4') {
      resolveGifMp4Urls(msg.tweetId).then(
        (urls) => sendResponse({ urls }),
        (e: Error) => sendResponse({ urls: [], error: e.message }),
      );
      return true; // async response
    }
    if (msg?.type === 'open-options') {
      browser.runtime.openOptionsPage();
    }
    return undefined;
  });

  browser.runtime.onConnect.addListener((port: Browser.runtime.Port) => {
    if (port.name !== CONVERT_PORT) return;
    let connected = true;
    let handle: JobHandle | null = null;
    const post = (m: PortResponse) => {
      if (connected) port.postMessage(m);
    };

    port.onDisconnect.addListener(() => {
      connected = false;
      handle?.cancel();
    });

    port.onMessage.addListener(async (raw: unknown) => {
      const msg = raw as PortRequest;
      if (msg.type === 'cancel') {
        handle?.cancel();
        return;
      }
      if (msg.type === 'download-mp4') {
        try {
          await browser.downloads.download({ url: msg.mp4Url, filename: msg.filename, conflictAction: 'uniquify' });
        } catch (e) {
          post({ type: 'error', code: 'generic', message: (e as Error).message });
        }
        return;
      }
      if (msg.type !== 'convert') return;

      await slot(async () => {
        if (!connected) return;
        const jobId = crypto.randomUUID();
        handle = runner.start(jobId, msg.job, (info) => post({ type: 'progress', info }));
        try {
          const { result, blobUrl } = await handle.promise;
          try {
            await browser.downloads.download({
              url: blobUrl,
              filename: msg.job.filename,
              conflictAction: 'uniquify',
            });
          } finally {
            runner.release(blobUrl);
          }
          post({ type: 'done', result });
        } catch (e) {
          if (e instanceof JobError) post({ type: 'error', code: e.code, message: e.message });
          else post({ type: 'error', code: 'generic', message: (e as Error).message || String(e) });
        } finally {
          handle = null;
        }
      });
    });
  });
});
