import { browser, type Browser } from 'wxt/browser';
import { base64ToBytes } from '@/lib/base64';
import { t } from '@/lib/i18n';
import {
  CONVERT_PORT,
  type ConvertJob,
  type ConvertResult,
  type ErrorCode,
  type PortRequest,
  type PortResponse,
  type ProgressInfo,
} from '@/lib/messages';

export type JobState =
  | { kind: 'idle' }
  | { kind: 'running'; percent: number; label: string }
  | { kind: 'done'; result: ConvertResult; gif: Blob | null; filename: string }
  | { kind: 'error'; code: ErrorCode; message: string };

/** Overall progress: fetch 0–15 %, decode 15–45 %, encode 45–100 % (shrink attempts restart encode). */
export function describeProgress(info: ProgressInfo): { percent: number; label: string } {
  const pct = (x: number) => Math.round(x * 100);
  switch (info.stage) {
    case 'fetch':
      return { percent: 15 * info.progress, label: t('stageFetch', pct(info.progress)) };
    case 'decode':
      return { percent: 15 + 30 * info.progress, label: t('stageDecode', pct(info.progress)) };
    case 'encode':
      if (info.attempt > 1) {
        return {
          percent: 45 + 55 * info.progress,
          label: t('stageFit', info.attempt, pct(info.progress)),
        };
      }
      return { percent: 45 + 55 * info.progress, label: t('stageEncode', pct(info.progress)) };
  }
}

export function errorText(code: ErrorCode, message: string): string {
  if (code === 'fetch') return t('errFetch', message);
  if (code === 'decode') return t('errDecode');
  return t('errGeneric', message);
}

/** One conversion, talking to the background over a port. */
export class ConversionJob {
  state: JobState = { kind: 'idle' };
  private listeners = new Set<(s: JobState) => void>();
  private port: Browser.runtime.Port | null = null;

  subscribe(fn: (s: JobState) => void): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  private set(s: JobState) {
    this.state = s;
    this.listeners.forEach((fn) => fn(s));
  }

  get running() {
    return this.state.kind === 'running';
  }

  start(job: ConvertJob): Promise<JobState> {
    this.cancel();
    this.set({ kind: 'running', percent: 0, label: t('stageFetch', 0) });
    return new Promise((resolve) => {
      let port: Browser.runtime.Port;
      try {
        port = browser.runtime.connect({ name: CONVERT_PORT });
      } catch {
        this.set({ kind: 'error', code: 'generic', message: t('errDisconnected') });
        resolve(this.state);
        return;
      }
      this.port = port;
      let finished = false;
      port.onMessage.addListener((raw: unknown) => {
        const msg = raw as PortResponse;
        if (msg.type === 'progress') {
          this.set({ kind: 'running', ...describeProgress(msg.info) });
        } else if (msg.type === 'done') {
          finished = true;
          const { dataB64, ...result } = msg.result;
          const gif = dataB64 ? new Blob([base64ToBytes(dataB64)], { type: 'image/gif' }) : null;
          this.set({ kind: 'done', result, gif, filename: job.filename });
          port.disconnect();
          this.port = null;
          resolve(this.state);
        } else if (msg.type === 'error') {
          finished = true;
          this.set({ kind: 'error', code: msg.code, message: msg.message });
          port.disconnect();
          this.port = null;
          resolve(this.state);
        }
      });
      port.onDisconnect.addListener(() => {
        this.port = null;
        if (!finished) {
          this.set({ kind: 'error', code: 'generic', message: t('errDisconnected') });
          resolve(this.state);
        }
      });
      port.postMessage({ type: 'convert', job } satisfies PortRequest);
    });
  }

  cancel() {
    if (this.port) {
      this.port.postMessage({ type: 'cancel' } satisfies PortRequest);
      this.port.disconnect();
      this.port = null;
    }
    if (this.state.kind === 'running') this.set({ kind: 'idle' });
  }
}
