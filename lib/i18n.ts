import { browser } from 'wxt/browser';
import type { MessageKey } from './i18n-keys';

/** Translate a message key from public/_locales, with optional $1…$9 substitutions. */
export function t(key: MessageKey, ...subs: Array<string | number>): string {
  const msg = browser.i18n.getMessage(key, subs.map(String));
  return msg || key;
}
