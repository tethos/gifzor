import { stripExtension } from '@/lib/filename';
import { t } from '@/lib/i18n';
import { FPS_CHOICES, WIDTH_CHOICES, type Settings } from '@/lib/settings';
import type { TweetController } from '../controller';
import { errorText, type JobState } from '../job';
import { POPOVER_CSS } from './styles';
import { themeClass } from './theme';

let open: { host: HTMLElement; close: () => void } | null = null;

export function closePopover() {
  open?.close();
}

function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Download a blob from the page (used for "download again" – no extension round trip needed). */
function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function openPopover(anchor: HTMLElement, ctrl: TweetController, settings: Settings): void {
  const reopenSame = open?.host.dataset.tweet === ctrl.info.id;
  closePopover();
  if (reopenSame) return; // second click on the button toggles

  const mediaCount = Math.max(1, ctrl.media().length);
  const st = {
    index: 0,
    width: (WIDTH_CHOICES as readonly number[]).includes(settings.width) ? settings.width : 480,
    fps: settings.fps,
    clipboard: settings.copyToClipboard,
  };

  const host = document.createElement('gifzor-popover');
  host.dataset.tweet = ctrl.info.id;
  const root = host.attachShadow({ mode: 'open' });
  const widthBtns = WIDTH_CHOICES.map(
    (w) => `<button type="button" data-width="${w}">${w === 0 ? esc(t('optOriginal')) : `${w}px`}</button>`,
  ).join('');
  const fpsBtns = FPS_CHOICES.map((f) => `<button type="button" data-fps="${f}">${f} fps</button>`).join('');
  const mediaBtns = Array.from({ length: mediaCount }, (_, i) => `<button type="button" data-media="${i}">${i + 1}</button>`).join('');
  const maxHint = settings.maxSizeMB > 0 ? `max. ${settings.maxSizeMB} MB${settings.autoFit ? ' · auto' : ''}` : '';

  root.innerHTML = `
  <style>${POPOVER_CSS}</style>
  <div class="panel ${themeClass()}" role="dialog" aria-label="${esc(t('popTitle'))}">
    <header><h2>${esc(t('popTitle'))}</h2>
      <button class="close" type="button" aria-label="${esc(t('actionClose'))}">
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M6 6l12 12M18 6 6 18"/></svg>
      </button></header>
    <div class="row ${mediaCount > 1 ? '' : 'hidden'}"><span class="label">${esc(t('labelMedia'))}</span><div class="seg media">${mediaBtns}</div></div>
    <div class="row"><span class="label">${esc(t('labelWidth'))}</span><div class="seg width">${widthBtns}</div></div>
    <div class="row"><span class="label">${esc(t('labelFps'))}</span><div class="seg fps">${fpsBtns}</div></div>
    <div class="row"><label class="label" for="gz-name">${esc(t('labelFilename'))}</label>
      <div class="name"><input id="gz-name" type="text" spellcheck="false" autocomplete="off"><span>.gif</span></div></div>
    <label class="check row"><input type="checkbox" class="clip"> ${esc(t('labelClipboard'))}</label>
    <div class="actions">
      <button type="button" class="btn primary convert">${esc(t('actionConvert'))}</button>
      <button type="button" class="btn mp4">${esc(t('actionMp4'))}</button>
    </div>
    <div class="hint">${esc(maxHint)}</div>
    <div class="status hidden"><span class="text"></span><div class="bar"><div></div></div></div>
    <div class="preview hidden"><img alt=""><div class="info"></div><div class="warn hidden"></div>
      <div class="actions"><button type="button" class="btn again">${esc(t('actionRedownload'))}</button></div></div>
  </div>`;

  const $ = <T extends Element>(sel: string) => root.querySelector<T>(sel)!;
  const nameInput = $<HTMLInputElement>('#gz-name');
  const clip = $<HTMLInputElement>('.clip');
  const convertBtn = $<HTMLButtonElement>('.convert');
  const status = $<HTMLElement>('.status');
  const statusText = $<HTMLElement>('.status .text');
  const statusBar = $<HTMLElement>('.status .bar > div');
  const preview = $<HTMLElement>('.preview');
  const img = $<HTMLImageElement>('.preview img');
  const info = $<HTMLElement>('.preview .info');
  const warn = $<HTMLElement>('.preview .warn');
  let previewUrl: string | null = null;

  nameInput.value = ctrl.defaultBaseName(0, settings);
  clip.checked = st.clipboard;

  const syncSeg = () => {
    root.querySelectorAll<HTMLButtonElement>('[data-width]').forEach((b) =>
      b.setAttribute('aria-pressed', String(Number(b.dataset.width) === st.width)),
    );
    root.querySelectorAll<HTMLButtonElement>('[data-fps]').forEach((b) =>
      b.setAttribute('aria-pressed', String(Number(b.dataset.fps) === st.fps)),
    );
    root.querySelectorAll<HTMLButtonElement>('[data-media]').forEach((b) =>
      b.setAttribute('aria-pressed', String(Number(b.dataset.media) === st.index)),
    );
  };
  syncSeg();

  root.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('button');
    if (!b) return;
    if (b.dataset.width) st.width = Number(b.dataset.width);
    else if (b.dataset.fps) st.fps = Number(b.dataset.fps);
    else if (b.dataset.media) {
      const prevDefault = ctrl.defaultBaseName(st.index, settings);
      st.index = Number(b.dataset.media);
      if (nameInput.value === prevDefault) nameInput.value = ctrl.defaultBaseName(st.index, settings);
    }
    syncSeg();
  });

  const filename = () => stripExtension(nameInput.value, 'gif') || ctrl.defaultBaseName(st.index, settings);

  convertBtn.addEventListener('click', () => {
    if (ctrl.job.running) {
      ctrl.job.cancel();
      return;
    }
    void ctrl.convert({ index: st.index, width: st.width, fps: st.fps, filename: filename(), clipboard: clip.checked }, settings);
  });
  nameInput.addEventListener('keydown', (e) => {
    e.stopPropagation(); // don't trigger X keyboard shortcuts
    if (e.key === 'Enter') convertBtn.click();
  });
  nameInput.addEventListener('keyup', (e) => e.stopPropagation());
  nameInput.addEventListener('keypress', (e) => e.stopPropagation());
  $<HTMLButtonElement>('.mp4').addEventListener('click', () => void ctrl.downloadMp4(st.index, filename()));
  $<HTMLButtonElement>('.again').addEventListener('click', () => {
    const s = ctrl.job.state;
    if (s.kind === 'done' && s.gif) saveBlob(s.gif, s.filename);
  });
  img.addEventListener('error', () => img.classList.add('hidden'));

  const render = (s: JobState) => {
    convertBtn.textContent = s.kind === 'running' ? t('actionCancel') : t('actionConvert');
    status.classList.toggle('hidden', s.kind === 'idle' || s.kind === 'done');
    status.classList.toggle('error', s.kind === 'error');
    if (s.kind === 'running') {
      statusText.textContent = s.label;
      statusBar.style.width = `${s.percent}%`;
      preview.classList.add('hidden');
    } else if (s.kind === 'error') {
      statusText.textContent = errorText(s.code, s.message);
      statusBar.style.width = '0';
    } else if (s.kind === 'done') {
      preview.classList.remove('hidden');
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = s.gif ? URL.createObjectURL(s.gif) : null;
      img.classList.toggle('hidden', !previewUrl);
      if (previewUrl) img.src = previewUrl;
      info.textContent = `${t('stageDone')} · ${t('resultInfo', formatBytes(s.result.bytes), s.result.width, s.result.fps, s.result.colors)}`;
      warn.classList.toggle('hidden', !s.result.overLimit);
      warn.textContent = s.result.overLimit ? t('warnOverLimit', settings.maxSizeMB) : '';
      $<HTMLButtonElement>('.again').disabled = !s.gif;
    }
  };
  const unsubscribe = ctrl.job.subscribe(render);

  // Position below the anchor (page coordinates so it scrolls with the timeline).
  document.body.append(host);
  const place = () => {
    const r = anchor.getBoundingClientRect();
    const w = host.offsetWidth || 320;
    const left = Math.min(Math.max(8, r.right - w), document.documentElement.clientWidth - w - 8);
    host.style.left = `${left + scrollX}px`;
    host.style.top = `${r.bottom + 6 + scrollY}px`;
  };
  place();
  nameInput.focus({ preventScroll: true });
  nameInput.select();

  const onDocPointer = (e: PointerEvent) => {
    const path = e.composedPath();
    if (!path.includes(host) && !path.includes(anchor)) close();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  const onResize = () => place();
  setTimeout(() => document.addEventListener('pointerdown', onDocPointer, true));
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', onResize);

  function close() {
    unsubscribe();
    document.removeEventListener('pointerdown', onDocPointer, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', onResize);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    host.remove();
    if (open?.host === host) open = null;
  }

  root.querySelector('.close')!.addEventListener('click', close);
  open = { host, close };
}
