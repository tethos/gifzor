import { describe, expect, it } from 'vitest';
import fixture from './fixtures/syndication-gif.json';
import { pickGifMp4Urls, syndicationToken, syndicationUrl } from '@/lib/mp4url';

describe('syndication', () => {
  it('computes a deterministic token without zeros or dots', () => {
    const a = syndicationToken('1234567890123456789');
    expect(a).toBe(syndicationToken('1234567890123456789'));
    expect(a).toMatch(/^[1-9a-z]+$/);
    expect(syndicationToken('1800000000000000000')).not.toBe(a);
  });

  it('builds the request URL', () => {
    const url = new URL(syndicationUrl('20'));
    expect(url.host).toBe('cdn.syndication.twimg.com');
    expect(url.searchParams.get('id')).toBe('20');
    expect(url.searchParams.get('token')).toBe(syndicationToken('20'));
  });

  it('picks the best MP4 of every animated GIF', () => {
    expect(pickGifMp4Urls(fixture)).toEqual([
      'https://video.twimg.com/tweet_video/AbC-123_x.mp4',
      'https://video.twimg.com/tweet_video/high.mp4',
    ]);
  });

  it('copes with unexpected payloads', () => {
    expect(pickGifMp4Urls(null)).toEqual([]);
    expect(pickGifMp4Urls({ mediaDetails: [{ type: 'video' }] })).toEqual([]);
  });
});
