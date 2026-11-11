import { defineConfig } from 'wxt';

// https://wxt.dev/api/config.html
export default defineConfig({
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    permissions: [
      'storage',
      'downloads',
      'clipboardWrite',
      ...(browser === 'firefox' ? [] : ['offscreen']),
    ],
    host_permissions: ['https://video.twimg.com/*', 'https://cdn.syndication.twimg.com/*'],
    action: { default_title: '__MSG_extName__' },
    browser_specific_settings:
      browser === 'firefox'
        ? {
            gecko: {
              id: 'gifzor@tethos',
              strict_min_version: '140.0',
              data_collection_permissions: { required: ['none'] },
            },
            gecko_android: { strict_min_version: '142.0' },
          }
        : undefined,
  }),
});
