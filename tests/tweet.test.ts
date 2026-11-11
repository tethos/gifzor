import { beforeEach, describe, expect, it } from 'vitest';
import html from './fixtures/tweet-gif.html?raw';
import { findActionBar, findGifMedia, getTweetInfo, mp4FromPoster, parseStatusPath } from '@/lib/tweet';

describe('tweet DOM helpers', () => {
  let gifTweet: Element;
  let videoTweet: Element;

  beforeEach(() => {
    document.body.innerHTML = html;
    [gifTweet, videoTweet] = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
  });

  it('parses status paths', () => {
    expect(parseStatusPath('/jack/status/20')).toEqual({ user: 'jack', id: '20' });
    expect(parseStatusPath('https://x.com/jack/status/20/photo/1')).toEqual({ user: 'jack', id: '20' });
    expect(parseStatusPath('/home')).toBeNull();
  });

  it('reads tweet id and author from the permalink', () => {
    expect(getTweetInfo(gifTweet)).toEqual({ user: 'example', id: '1234567890123456789' });
  });

  it('derives the MP4 URL from the poster', () => {
    expect(mp4FromPoster('https://pbs.twimg.com/tweet_video_thumb/AbC-123_x.jpg')).toBe(
      'https://video.twimg.com/tweet_video/AbC-123_x.mp4',
    );
    expect(mp4FromPoster('https://pbs.twimg.com/ext_tw_video_thumb/1/pu/img/x.jpg')).toBeNull();
  });

  it('finds GIF media (video + image poster) and ignores regular videos', () => {
    const media = findGifMedia(gifTweet);
    expect(media.map((m) => m.mp4Url)).toEqual([
      'https://video.twimg.com/tweet_video/AbC-123_x.mp4',
      'https://video.twimg.com/tweet_video/QuOtEd.mp4',
    ]);
    expect(findGifMedia(videoTweet)).toEqual([]);
  });

  it('picks the main action bar of the tweet', () => {
    expect(findActionBar(gifTweet)?.getAttribute('aria-label')).toContain('replies');
  });
});
