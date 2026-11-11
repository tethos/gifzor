import { stripExtension } from '@/lib/filename';
import { t } from '@/lib/i18n';
import { FPS_CHOICES, WIDTH_CHOICES, type Settings } from '@/lib/settings';
import type { TweetController } from '../controller';
import { errorText, type JobState } from '../job';
import { h, s, styleEl } from './dom';
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
  const maxHint = settings.maxSizeMB > 0 ? `max. ${settings.maxSizeMB} MB${settings.autoFit ? ' · auto' : ''}` : '';
  const seg = (cls: string, buttons: HTMLElement[]) => h('div', { class: `seg ${cls}` }, ...buttons);
  const row = (label: string, content: HTMLElement, hidden = false) =>
    h('div', { class: hidden ? 'row hidden' : 'row' }, h('span', { class: 'label' }, label), content);

  const nameInput = h('input', { id: 'gz-name', type: 'text', spellcheck: 'false', autocomplete: 'off' });
  const clip = h('input', { type: 'checkbox', class: 'clip' });
  const closeBtn = h(
    'button',
    { class: 'close', type: 'button', 'aria-label': t('actionClose') },
    s(
      'svg',
      { width: 18, height: 18, viewBox: '0 0 24 24', 'aria-hidden': 'true' },
      s('path', {
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': 2,
        'stroke-linecap': 'round',
        d: 'M6 6l12 12M18 6 6 18',
      }),
    ),
  );
  const convertBtn = h('button', { type: 'button', class: 'btn primary convert' }, t('actionConvert'));
  const mp4Btn = h('button', { type: 'button', class: 'btn mp4' }, t('actionMp4'));
  const statusText = h('span', { class: 'text' });
  const statusBar = h('div');
  const status = h('div', { class: 'status hidden' }, statusText, h('div', { class: 'bar' }, statusBar));
  const img = h('img', { alt: '' });
  const info = h('div', { class: 'info' });
  const warn = h('div', { class: 'warn hidden' });
  const againBtn = h('button', { type: 'button', class: 'btn again' }, t('actionRedownload'));
  const preview = h('div', { class: 'preview hidden' }, img, info, warn, h('div', { class: 'actions' }, againBtn));

  const panel = h(
    'div',
    { class: `panel ${themeClass()}`, role: 'dialog', 'aria-label': t('popTitle') },
    h('header', {}, h('h2', {}, t('popTitle')), closeBtn),
    row(
      t('labelMedia'),
      seg(
        'media',
        Array.from({ length: mediaCount }, (_, i) => h('button', { type: 'button', 'data-media': i }, i + 1)),
      ),
      mediaCount < 2,
    ),
    row(
      t('labelWidth'),
      seg(
        'width',
        WIDTH_CHOICES.map((w) => h('button', { type: 'button', 'data-width': w }, w === 0 ? t('optOriginal') : `${w}px`)),
      ),
    ),
    row(
      t('labelFps'),
      seg(
        'fps',
        FPS_CHOICES.map((f) => h('button', { type: 'button', 'data-fps': f }, `${f} fps`)),
      ),
    ),
    h(
      'div',
      { class: 'row' },
      h('label', { class: 'label', for: 'gz-name' }, t('labelFilename')),
      h('div', { class: 'name' }, nameInput, h('span', {}, '.gif')),
    ),
    h('label', { class: 'check row' }, clip, ` ${t('labelClipboard')}`),
    h('div', { class: 'actions' }, convertBtn, mp4Btn),
    h('div', { class: 'hint' }, maxHint),
    status,
    preview,
  );
  root.append(styleEl(POPOVER_CSS), panel);
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
  mp4Btn.addEventListener('click', () => void ctrl.downloadMp4(st.index, filename()));
  againBtn.addEventListener('click', () => {
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
      againBtn.disabled = !s.gif;
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

  closeBtn.addEventListener('click', close);
  open = { host, close };
}
