import { buildBaseName } from '@/lib/filename';
import { t } from '@/lib/i18n';
import type { MessageKey } from '@/lib/i18n-keys';
import {
  COLOR_CHOICES,
  FPS_CHOICES,
  WIDTH_CHOICES,
  getSettings,
  resetSettings,
  saveSettings,
  type Settings,
} from '@/lib/settings';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

document.title = t('optionsTitle');
document.documentElement.lang = navigator.language.split('-')[0] || 'en';
document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
  el.textContent = t(el.dataset.i18n as MessageKey);
});

type SegKey = 'width' | 'fps' | 'colors';
const SEGMENTS: Record<SegKey, { choices: readonly number[]; label: (v: number) => string }> = {
  width: { choices: WIDTH_CHOICES, label: (v) => (v === 0 ? t('optOriginal') : `${v} px`) },
  fps: { choices: FPS_CHOICES, label: (v) => `${v} fps` },
  colors: { choices: COLOR_CHOICES, label: (v) => String(v) },
};

let settings: Settings;
let savedTimer: ReturnType<typeof setTimeout> | undefined;

function showSaved() {
  const el = $('saved');
  el.textContent = t('optionsSaved');
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => (el.textContent = ''), 1500);
}

async function update(patch: Partial<Settings>) {
  settings = await saveSettings(patch);
  render();
  showSaved();
}

function renderPatternPreview() {
  $('patternPreview').textContent =
    buildBaseName($<HTMLInputElement>('filenamePattern').value || '{user}_{id}', {
      user: 'jack',
      id: '20',
      n: 1,
    }) + '.gif';
}

function render() {
  for (const key of Object.keys(SEGMENTS) as SegKey[]) {
    $(key)
      .querySelectorAll<HTMLButtonElement>('button')
      .forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.value) === settings[key])));
  }
  const num = (id: 'maxSizeMB' | 'maxDurationSec') => {
    const el = $<HTMLInputElement>(id);
    if (document.activeElement !== el) el.value = String(settings[id]);
  };
  num('maxSizeMB');
  num('maxDurationSec');
  $<HTMLInputElement>('autoFit').checked = settings.autoFit;
  $<HTMLInputElement>('copyToClipboard').checked = settings.copyToClipboard;
  const pattern = $<HTMLInputElement>('filenamePattern');
  if (document.activeElement !== pattern) pattern.value = settings.filenamePattern;
  renderPatternPreview();
}

async function init() {
  settings = await getSettings();

  for (const key of Object.keys(SEGMENTS) as SegKey[]) {
    const { choices, label } = SEGMENTS[key];
    const container = $(key);
    for (const v of choices) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.value = String(v);
      b.textContent = label(v);
      b.addEventListener('click', () => update({ [key]: v } as Partial<Settings>));
      container.append(b);
    }
  }

  const clampNumber = (id: 'maxSizeMB' | 'maxDurationSec', min: number, max: number) => {
    const el = $<HTMLInputElement>(id);
    el.addEventListener('change', () => {
      const v = Math.min(max, Math.max(min, Number(el.value) || 0));
      el.value = String(v);
      void update({ [id]: v } as Partial<Settings>);
    });
  };
  clampNumber('maxSizeMB', 0, 500);
  clampNumber('maxDurationSec', 0, 120);

  $<HTMLInputElement>('autoFit').addEventListener('change', (e) =>
    update({ autoFit: (e.target as HTMLInputElement).checked }),
  );
  $<HTMLInputElement>('copyToClipboard').addEventListener('change', (e) =>
    update({ copyToClipboard: (e.target as HTMLInputElement).checked }),
  );

  const pattern = $<HTMLInputElement>('filenamePattern');
  pattern.addEventListener('input', renderPatternPreview);
  pattern.addEventListener('change', () => update({ filenamePattern: pattern.value.trim() || '{user}_{id}' }));

  $('reset').addEventListener('click', async () => {
    settings = await resetSettings();
    (document.activeElement as HTMLElement | null)?.blur();
    render();
    showSaved();
  });

  $('form').addEventListener('submit', (e) => e.preventDefault());
  render();
}

void init();
