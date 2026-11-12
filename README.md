# gifzor

Browser extension for **Chrome and Firefox** (Manifest V3) that saves animated "GIFs" from **x.com / Twitter** as **real `.gif` files** – e.g. for sharing on Discord.

X serves GIFs as MP4 videos. gifzor converts them to GIF **locally in your browser** – no server, no account, no daily limit.

## Features

- **GIF button right on the post** (next to reply/repost/like), also for posts loaded later in the feed
- **Popover with options**: width (240 / 320 / 480 px / original), frame rate (10 / 15 / 20 fps), **custom filename**
- **Shift + click** the button: convert immediately with your default settings
- **Size limit** (10 MB by default, for Discord): if the GIF is too large, frame rate / resolution / colors are reduced automatically and it is re-encoded
- **Progress indicator** on the button and in the popover, preview of the finished GIF
- Optional **clipboard** copy (see note below)
- **Save the original MP4** with one click
- English & German UI

## Privacy

- Conversion runs entirely locally (WebCodecs + [gifenc](https://github.com/mattdesl/gifenc) in a Web Worker).
- The extension **only** contacts:
  - `video.twimg.com` – the GIF's MP4 file
  - `cdn.syndication.twimg.com` – only if the video URL is not present on the page (public endpoint used for embedded posts)
- **No cookies, login tokens or other data** are read, stored or sent to third parties. The only stored data are your settings (`storage.sync`).
- No analytics, no tracking.

**Permissions:** `storage` (settings), `downloads` (save the file), `clipboardWrite` (optional copy), `offscreen` (Chrome only – background document for the conversion), host access only to the two domains above.

## Requirements

- Chrome / Edge / Brave **116+** or Firefox **140+**
- To build: [Node.js](https://nodejs.org/) 20+ (incl. npm). All dependencies are installed locally into `node_modules/`.

## Build

```bash
npm install
npm run build           # Chrome  → .output/chrome-mv3/
npm run build:firefox   # Firefox → .output/firefox-mv3/
npm run zip             # Chrome  ZIP for the Chrome Web Store
npm run zip:firefox     # Firefox ZIP + sources ZIP for AMO
```

## Installation from source

### Chrome / Edge / Brave (unpacked)

1. `npm run build`
2. Open `chrome://extensions` (Edge: `edge://extensions`)
3. Enable **Developer mode** (top right)
4. **Load unpacked** → select the `.output/chrome-mv3` folder
5. Optional: pin the extension via the puzzle icon. Clicking the icon opens the settings.

After code changes: rebuild and click "Reload" on the extensions page.

### Firefox – temporary (for testing)

1. `npm run build:firefox`
2. Open `about:debugging#/runtime/this-firefox`
3. **Load Temporary Add-on…** → select `.output/firefox-mv3/manifest.json`

Temporary add-ons are removed when Firefox quits. If no button appears on X, check `about:addons` → gifzor → *Permissions* and allow access to `x.com`.

## Usage

1. Open or scroll to a post with a GIF on x.com.
2. Click the **GIF button** in the action bar.
3. Choose width, frame rate and filename → **Convert**.
4. The GIF is saved to your downloads folder. The popover shows a preview and the file size, and lets you download it again.

**Shift + click** on the button skips the popover.

### Settings

Click the extension icon (or right-click → *Options*):

| Setting | Default | Description |
|---|---|---|
| Width | 480 px | target width (never larger than the original) |
| Frame rate | 15 fps | |
| Colors | 256 | fewer colors = smaller file |
| Max. clip length | 0 (unlimited) | longer clips are cut |
| Max. file size | 10 MB | 0 = no limit |
| Auto-shrink | on | reduces frame rate → resolution → colors until the file fits (max. 6 attempts) |
| Filename pattern | `{user}_{id}` | placeholders: `{user}`, `{id}`, `{date}`, `{n}` |
| Clipboard | off | see below |

### Note on the clipboard

Browsers' Clipboard API currently only supports PNG images and text – **not animated `image/gif`**. gifzor still tries to copy the GIF first. If that fails, the **MP4 link** is copied instead (Discord and others show it as a playable video). The file is always downloaded as well.

## How it works

```
Content script (x.com)      button + popover, finds GIF posts via MutationObserver,
        │                   resolves the MP4 URL (from <video>/poster or the syndication API)
        │ runtime.connect (progress back)
Background                  job queue, downloads
        │
Chrome: offscreen document ─┐
Firefox: background page   ─┴─ fetch MP4 → decode with mp4box.js + WebCodecs
                               → scale/sample frames → gifenc (Web Worker)
                               → too large? adjust parameters and re-encode
```

The encoder uses a global palette and writes unchanged pixels as transparent (lossless), which reduces the file size considerably. If WebCodecs can't decode a video, it falls back to a `<video>` element.

## Development

```bash
npm run dev            # Chrome with the extension loaded + hot reload
npm run dev:firefox    # same for Firefox
npm test               # unit tests (Vitest)
npm run compile        # TypeScript check
npm run lint:firefox   # Firefox build + web-ext lint (AMO rules)
npm run e2e            # headless Chrome test of the full conversion
```

Project structure:

```
entrypoints/
  background.ts        service worker / event page
  content/             button, popover, toast, clipboard
  offscreen/           Chrome offscreen document
  options/             settings page
lib/
  converter/           fetch, decoders (WebCodecs/<video>), sampler, GIF worker, size fitting
  tweet.ts             DOM selectors for x.com
  mp4url.ts            syndication API
  settings.ts, messages.ts, filename.ts, i18n.ts
scripts/               icon/locale generators, e2e test
tests/                 Vitest + HTML/JSON fixtures
```

UI strings are maintained in `scripts/gen-locales.mjs` (`node scripts/gen-locales.mjs` generates `public/_locales/*`).

## Troubleshooting

- **No button visible:** reload the page (required after installing/updating the extension). If X changes its HTML, the selectors in `lib/tweet.ts` may need an update.
- **"Connection to the extension lost":** the extension was reloaded – reload the page.
- **GIF larger than the limit:** for very long clips auto-shrink may not be enough. Set a max. clip length or choose a smaller width.
- **Save dialog appears every time:** that's a browser setting ("Ask where to save each file").

## Disclaimer

gifzor is an independent project and is not affiliated with or endorsed by X Corp. Only download content you have the right to use.

## License

[MIT](LICENSE) © tethos
