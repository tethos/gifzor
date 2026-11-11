/**
 * DOM helpers for X/Twitter. Selectors live here so they can be updated in one place
 * when X changes its markup (see tests/fixtures for reference HTML).
 */

export const SELECTORS = {
  tweet: 'article[data-testid="tweet"]',
  actionBar: '[role="group"]',
  permalink: 'a[href*="/status/"]',
  gifMedia: [
    'video[src*="video.twimg.com/tweet_video/"]',
    'video[poster*="/tweet_video_thumb/"]',
    'img[src*="/tweet_video_thumb/"]',
  ].join(','),
} as const;

export interface TweetInfo {
  id: string;
  user: string;
}

export interface GifMedia {
  element: HTMLVideoElement | HTMLImageElement;
  /** Direct MP4 URL if it can be derived from the DOM. */
  mp4Url: string | null;
  posterUrl: string | null;
}

const STATUS_RE = /^\/([A-Za-z0-9_]{1,15})\/status\/(\d+)/;

export function parseStatusPath(href: string): TweetInfo | null {
  try {
    const url = new URL(href, 'https://x.com');
    const m = STATUS_RE.exec(url.pathname);
    return m ? { user: m[1], id: m[2] } : null;
  } catch {
    return null;
  }
}

/** Read tweet id + author from the permalink (the status link that wraps the timestamp). */
export function getTweetInfo(article: Element): TweetInfo | null {
  const links = Array.from(article.querySelectorAll<HTMLAnchorElement>(SELECTORS.permalink));
  const withTime = links.find((a) => a.querySelector('time'));
  for (const a of withTime ? [withTime, ...links] : links) {
    const info = parseStatusPath(a.getAttribute('href') ?? '');
    if (info) return info;
  }
  // Detail page: the main tweet may not link to itself.
  return parseStatusPath(location.pathname);
}

/** https://pbs.twimg.com/tweet_video_thumb/ABC.jpg → https://video.twimg.com/tweet_video/ABC.mp4 */
export function mp4FromPoster(posterUrl: string): string | null {
  const m = /\/tweet_video_thumb\/([A-Za-z0-9_-]+)\.\w+/.exec(posterUrl);
  return m ? `https://video.twimg.com/tweet_video/${m[1]}.mp4` : null;
}

export function isDirectGifMp4(url: string | null | undefined): url is string {
  return !!url && /^https:\/\/video\.twimg\.com\/tweet_video\/[^?#]+\.mp4/.test(url);
}

/** Find all GIF media elements of a tweet (deduplicated by MP4 URL). */
export function findGifMedia(article: Element): GifMedia[] {
  const seen = new Set<string>();
  const out: GifMedia[] = [];
  for (const el of Array.from(
    article.querySelectorAll<HTMLVideoElement | HTMLImageElement>(SELECTORS.gifMedia),
  )) {
    let mp4Url: string | null = null;
    let posterUrl: string | null = null;
    if (el instanceof HTMLVideoElement) {
      posterUrl = el.poster || null;
      const src = el.currentSrc || el.src || el.querySelector('source')?.src;
      mp4Url = isDirectGifMp4(src) ? src : posterUrl ? mp4FromPoster(posterUrl) : null;
    } else {
      posterUrl = el.src;
      mp4Url = mp4FromPoster(el.src);
    }
    const key = mp4Url ?? posterUrl ?? String(out.length);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ element: el, mp4Url, posterUrl });
  }
  return out;
}

/** The action bar (reply/retweet/like/…) of the tweet itself, not of a quoted tweet. */
export function findActionBar(article: Element): Element | null {
  const groups = article.querySelectorAll(SELECTORS.actionBar);
  return groups.length ? groups[groups.length - 1] : null;
}
