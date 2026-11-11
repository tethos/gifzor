/**
 * Resolve the MP4 URL of a GIF via X's public syndication endpoint (used by embedded tweets).
 * No cookies, no login tokens: the "token" is a deterministic value derived from the tweet id.
 */

export const SYNDICATION_ENDPOINT = 'https://cdn.syndication.twimg.com/tweet-result';

export function syndicationToken(id: string): string {
  return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '');
}

export function syndicationUrl(id: string): string {
  return `${SYNDICATION_ENDPOINT}?id=${encodeURIComponent(id)}&lang=en&token=${syndicationToken(id)}`;
}

interface Variant {
  content_type?: string;
  type?: string;
  url?: string;
  src?: string;
  bitrate?: number;
}

interface MediaDetail {
  type?: string;
  video_info?: { variants?: Variant[] };
}

interface SyndicationTweet {
  mediaDetails?: MediaDetail[];
  quoted_tweet?: SyndicationTweet;
}

/** Pick the best MP4 variant of every animated GIF in a syndication response. */
export function pickGifMp4Urls(data: unknown): string[] {
  const tweet = data as SyndicationTweet | null;
  const media = [...(tweet?.mediaDetails ?? []), ...(tweet?.quoted_tweet?.mediaDetails ?? [])];
  const urls: string[] = [];
  for (const m of media) {
    if (m.type !== 'animated_gif') continue;
    const mp4 = (m.video_info?.variants ?? [])
      .filter((v) => (v.content_type ?? v.type) === 'video/mp4' && (v.url ?? v.src))
      .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
    const best = mp4[0]?.url ?? mp4[0]?.src;
    if (best) urls.push(best);
  }
  return urls;
}

export async function resolveGifMp4Urls(id: string): Promise<string[]> {
  if (!/^\d+$/.test(id)) throw new Error('invalid tweet id');
  const res = await fetch(syndicationUrl(id), { credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return pickGifMp4Urls(await res.json());
}
