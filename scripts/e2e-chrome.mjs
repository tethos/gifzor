// E2E: load the built extension in headless Chrome via CDP pipe, run a conversion job and inspect the GIF.
// Usage: npm run build && node scripts/e2e-chrome.mjs [extensionDir] [workDir]
// Needs Chrome 126+ (set CHROME=<path> if it is not in the default location).
import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const extDir = resolve(process.argv[2] ?? '.output/chrome-mv3');
const work = resolve(process.argv[3] ?? '.e2e');
const profile = join(work, 'profile');
const downloads = join(work, 'downloads');
rmSync(work, { recursive: true, force: true });
mkdirSync(downloads, { recursive: true });

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--remote-debugging-pipe',
    '--enable-unsafe-extension-debugging',
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--autoplay-policy=no-user-gesture-required',
    'about:blank',
  ],
  { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] },
);
const toChrome = chrome.stdio[3];
const fromChrome = chrome.stdio[4];

let nextId = 1;
const pending = new Map();
const listeners = [];
let buf = '';
fromChrome.on('data', (d) => {
  buf += d.toString('utf8');
  let i;
  while ((i = buf.indexOf('\0')) >= 0) {
    const msg = JSON.parse(buf.slice(0, i));
    buf = buf.slice(i + 1);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    } else listeners.forEach((fn) => fn(msg));
  }
});
function send(method, params = {}, sessionId) {
  const id = nextId++;
  toChrome.write(JSON.stringify({ id, method, params, sessionId }) + '\0');
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseGif(bytes) {
  const header = bytes.subarray(0, 6).toString('latin1');
  const width = bytes.readUInt16LE(6);
  const height = bytes.readUInt16LE(8);
  const packed = bytes[10];
  let p = 13 + (packed & 0x80 ? 3 * (1 << ((packed & 7) + 1)) : 0);
  let frames = 0;
  let loop = false;
  let totalDelay = 0;
  while (p < bytes.length) {
    const b = bytes[p];
    if (b === 0x3b) break;
    if (b === 0x21) {
      const label = bytes[p + 1];
      if (label === 0xf9) totalDelay += bytes.readUInt16LE(p + 4) * 10;
      if (label === 0xff && bytes.subarray(p + 3, p + 14).toString('latin1') === 'NETSCAPE2.0') loop = true;
      p += 2;
      while (bytes[p]) p += bytes[p] + 1;
      p++;
    } else if (b === 0x2c) {
      frames++;
      const lp = bytes[p + 9];
      p += 10 + (lp & 0x80 ? 3 * (1 << ((lp & 7) + 1)) : 0);
      p++; // LZW min code size
      while (bytes[p]) p += bytes[p] + 1;
      p++;
    } else throw new Error(`bad block 0x${b.toString(16)} at ${p}`);
  }
  return { header, width, height, frames, loop, totalDelay, size: bytes.length };
}

const PAGE_SCRIPT = (job) => `
(async () => {
  // 1) generate a test MP4 (3 s, 30 fps, 640x360, moving content) with MediaRecorder
  const c = document.createElement('canvas'); c.width = 640; c.height = 360;
  const g = c.getContext('2d');
  const stream = c.captureStream(30);
  const mime = ['video/mp4;codecs=avc1.42E01E', 'video/mp4'].find((m) => MediaRecorder.isTypeSupported(m));
  if (!mime) return { error: 'MediaRecorder cannot write mp4' };
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2_000_000 });
  const chunks = []; rec.ondataavailable = (e) => chunks.push(e.data);
  const stopped = new Promise((r) => (rec.onstop = r));
  rec.start(500);
  const t0 = performance.now();
  await new Promise((done) => {
    const draw = () => {
      const t = (performance.now() - t0) / 1000;
      const grd = g.createLinearGradient(0, 0, 640, 360);
      grd.addColorStop(0, 'hsl(' + (t * 120) % 360 + ',80%,50%)'); grd.addColorStop(1, '#123');
      g.fillStyle = grd; g.fillRect(0, 0, 640, 360);
      g.fillStyle = '#fff'; g.beginPath(); g.arc(80 + t * 160, 180 + Math.sin(t * 4) * 100, 40, 0, 7); g.fill();
      g.font = 'bold 48px sans-serif'; g.fillText('gifzor ' + t.toFixed(1), 20, 60);
      if (t < 3) requestAnimationFrame(draw); else done();
    };
    draw();
  });
  rec.stop(); await stopped;
  const blob = new Blob(chunks, { type: 'video/mp4' });
  const dataUrl = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });

  // 2) run conversion through the extension (same path as the content script)
  const job = ${JSON.stringify(job)};
  job.mp4Url = dataUrl;
  const port = chrome.runtime.connect({ name: 'gifzor-convert' });
  const stages = new Set(); let maxAttempt = 1;
  const t1 = performance.now();
  const res = await new Promise((resolve) => {
    port.onMessage.addListener((m) => {
      if (m.type === 'progress') { stages.add(m.info.stage); maxAttempt = Math.max(maxAttempt, m.info.attempt); }
      else { resolve(m); port.disconnect(); }
    });
    port.onDisconnect.addListener(() => resolve({ type: 'error', message: 'disconnected' }));
    port.postMessage({ type: 'convert', job });
  });
  if (res.type === 'done') { res.result.b64len = res.result.dataB64?.length; delete res.result.dataB64; }
  return { mp4Bytes: blob.size, mime, ms: Math.round(performance.now() - t1), stages: [...stages], maxAttempt, res };
})()`;

try {
  const { id: extId } = await send('Extensions.loadUnpacked', { path: extDir });
  console.log('extension id', extId);
  await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads, eventsEnabled: true });
  const { targetId } = await send('Target.createTarget', { url: `chrome-extension://${extId}/options.html` });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Runtime.enable', {}, sessionId);
  listeners.push((m) => {
    if (m.method === 'Runtime.consoleAPICalled')
      console.log('[page]', m.params.type, m.params.args.map((a) => a.value ?? a.description).join(' '));
    if (m.method === 'Runtime.exceptionThrown') console.log('[page exception]', JSON.stringify(m.params.exceptionDetails).slice(0, 400));
  });
  await sleep(1000);

  const jobs = [
    { name: 'default 480/15', filename: 'e2e_default.gif', options: { width: 480, fps: 15, colors: 256, maxBytes: 10 * 1024 * 1024, autoFit: true, maxDurationSec: 0 } },
    { name: 'shrink to 400 KB', filename: 'e2e_shrink.gif', options: { width: 0, fps: 20, colors: 256, maxBytes: 400 * 1024, autoFit: true, maxDurationSec: 0 } },
    { name: 'max 1.5 s', filename: 'e2e_short.gif', options: { width: 320, fps: 10, colors: 128, maxBytes: 0, autoFit: false, maxDurationSec: 1.5 } },
  ];
  for (const j of jobs) {
    const job = { mp4Url: '', filename: j.filename, returnData: true, options: j.options };
    const r = await send('Runtime.evaluate', { expression: PAGE_SCRIPT(job), awaitPromise: true, returnByValue: true }, sessionId);
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 800));
    const v = r.result.value;
    console.log(`\n== ${j.name}`);
    console.log(JSON.stringify(v));
    await sleep(1500);
    // Headless Chrome names CDP-managed downloads by GUID, so take the newest file.
    const file = readdirSync(downloads)
      .filter((f) => f.endsWith('.gif'))
      .sort((a, b) => statSync(join(downloads, b)).mtimeMs - statSync(join(downloads, a)).mtimeMs)[0];
    if (!file) {
      console.log('!! no downloaded file', readdirSync(downloads));
      continue;
    }
    const bytes = readFileSync(join(downloads, file));
    const gif = parseGif(bytes);
    console.log('gif', JSON.stringify(gif));
    const ok = v.res?.type === 'done' && gif.header === 'GIF89a' && gif.frames > 1 && gif.loop && (!j.options.maxBytes || gif.size <= j.options.maxBytes);
    console.log(ok ? 'PASS' : 'FAIL');
    if (!ok) process.exitCode = 1;
  }
} catch (e) {
  console.error('E2E failed:', e);
  process.exitCode = 1;
} finally {
  try { await send('Browser.close'); } catch {}
  setTimeout(() => chrome.kill(), 1000);
}
