import { browser } from 'wxt/browser';
import { buildBaseName, finalizeFilename } from '@/lib/filename';
import { t } from '@/lib/i18n';
import type { ResolveMp4Response, RuntimeRequest } from '@/lib/messages';
import { getSettings, type Settings } from '@/lib/settings';
import { findGifMedia, type GifMedia, type TweetInfo } from '@/lib/tweet';
import { copyGif } from './clipboard';
import { ConversionJob, errorText, type JobState } from './job';
import { toast } from './ui/toast';

export interface ConvertParams {
  index: number;
  width: number;
  fps: number;
  filename: string;
  clipboard: boolean;
}

/** State + actions for one tweet (article) that contains at least one GIF. */
export class TweetController {
  readonly job = new ConversionJob();
  private resolved = new Map<number, string>();
  /** mp4 URL of the most recent conversion (clipboard fallback). */
  lastMp4Url: string | null = null;

  constructor(
    public article: Element,
    public info: TweetInfo,
  ) {}

  media(): GifMedia[] {
    return findGifMedia(this.article);
  }

  defaultBaseName(index: number, settings: Settings): string {
    return buildBaseName(settings.filenamePattern, { user: this.info.user, id: this.info.id, n: index + 1 });
  }

  /** MP4 URL from the DOM, falling back to the public syndication API. */
  async mp4Url(index: number): Promise<string> {
    const fromDom = this.media()[index]?.mp4Url;
    if (fromDom) return fromDom;
    const cached = this.resolved.get(index);
    if (cached) return cached;
    const res = (await browser.runtime.sendMessage({
      type: 'resolve-mp4',
      tweetId: this.info.id,
    } satisfies RuntimeRequest)) as ResolveMp4Response | undefined;
    const url = res?.urls[index] ?? res?.urls[0];
    if (!url) throw new Error(res?.error || t('errNoMedia'));
    this.resolved.set(index, url);
    return url;
  }

  async convert(p: ConvertParams, settings?: Settings): Promise<JobState> {
    const s = settings ?? (await getSettings());
    let mp4Url: string;
    try {
      mp4Url = await this.mp4Url(p.index);
    } catch (e) {
      const msg = (e as Error).message;
      toast(msg, 'warn');
      return { kind: 'error', code: 'generic', message: msg };
    }
    this.lastMp4Url = mp4Url;
    const state = await this.job.start({
      mp4Url,
      filename: finalizeFilename(p.filename, 'gif'),
      returnData: true,
      options: {
        width: p.width,
        fps: p.fps,
        colors: s.colors,
        maxBytes: Math.round(s.maxSizeMB * 1024 * 1024),
        autoFit: s.autoFit,
        maxDurationSec: s.maxDurationSec,
      },
    });
    if (state.kind === 'error') toast(errorText(state.code, state.message), 'warn', 6000);
    else if (state.kind === 'done') await this.afterDone(state, p.clipboard, mp4Url);
    return state;
  }

  private async afterDone(state: Extract<JobState, { kind: 'done' }>, clipboard: boolean, mp4Url: string) {
    if (!clipboard) return;
    const outcome = await copyGif(state.gif, mp4Url);
    if (outcome === 'gif') toast(t('toastCopied'));
    else if (outcome === 'link') toast(t('toastCopiedLink'), 'info', 6000);
    else toast(t('toastCopyFailed'), 'warn');
  }

  async downloadMp4(index: number, filename: string): Promise<void> {
    try {
      const mp4Url = await this.mp4Url(index);
      const res = (await browser.runtime.sendMessage({
        type: 'download-mp4',
        mp4Url,
        filename: finalizeFilename(filename, 'mp4'),
      } satisfies RuntimeRequest)) as { ok: boolean; error?: string } | undefined;
      if (!res?.ok) throw new Error(res?.error || 'download failed');
    } catch (e) {
      toast(t('errGeneric', (e as Error).message), 'warn');
    }
  }
}
