import { defineContentScript } from 'wxt/utils/define-content-script';
import { getSettings } from '@/lib/settings';
import { SELECTORS, findActionBar, findGifMedia, getTweetInfo } from '@/lib/tweet';
import { TweetController } from './controller';
import { createGifButton } from './ui/button';
import { closePopover, openPopover } from './ui/popover';

const MARK = 'data-gifzor';

export default defineContentScript({
  matches: ['https://x.com/*', 'https://twitter.com/*', 'https://mobile.x.com/*', 'https://mobile.twitter.com/*'],
  runAt: 'document_idle',

  main(ctx) {
    const controllers = new WeakMap<Element, TweetController>();

    function attach(article: Element) {
      const info = getTweetInfo(article);
      if (!info) return;
      // X recycles DOM nodes while scrolling – re-attach when the tweet changed.
      if (article.getAttribute(MARK) === info.id && article.querySelector('gifzor-button')) return;
      if (!findGifMedia(article).length) return;
      const bar = findActionBar(article);
      if (!bar) return;

      article.querySelector('gifzor-button')?.remove();
      controllers.get(article)?.job.cancel();
      const ctrl = new TweetController(article, info);
      controllers.set(article, ctrl);
      article.setAttribute(MARK, info.id);

      const iconColor = getComputedStyle(bar.querySelector('svg') ?? bar).color;
      const btn = createGifButton(iconColor, async (e) => {
        const settings = await getSettings();
        if (e.shiftKey) {
          // Quick mode: convert immediately with the defaults.
          if (!ctrl.job.running) {
            void ctrl.convert(
              {
                index: 0,
                width: settings.width,
                fps: settings.fps,
                filename: ctrl.defaultBaseName(0, settings),
                clipboard: settings.copyToClipboard,
              },
              settings,
            );
          }
          return;
        }
        openPopover(btn.host, ctrl, settings);
      });
      ctrl.job.subscribe((s) => btn.update(s));
      bar.append(btn.host);
    }

    function scan(root: ParentNode = document) {
      root.querySelectorAll(SELECTORS.tweet).forEach(attach);
    }

    // X renders the timeline dynamically: watch for changes, but batch the work.
    let queued = false;
    const observer = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      const run = () => {
        queued = false;
        scan();
      };
      if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 300 });
      else setTimeout(run, 150);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    scan();

    ctx.onInvalidated(() => {
      observer.disconnect();
      closePopover();
      document.querySelectorAll('gifzor-button').forEach((el) => el.remove());
      document.querySelectorAll(`[${MARK}]`).forEach((el) => el.removeAttribute(MARK));
    });
  },
});
