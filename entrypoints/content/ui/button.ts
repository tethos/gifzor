import { t } from '@/lib/i18n';
import type { JobState } from '../job';
import { BUTTON_CSS } from './styles';

const R = 8;
const CIRC = 2 * Math.PI * R;

const ICON = `
<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19.5h14"/></svg>
<svg class="ring" viewBox="0 0 20 20" aria-hidden="true"><circle class="track" cx="10" cy="10" r="${R}"/><circle class="bar" cx="10" cy="10" r="${R}" stroke-dasharray="${CIRC}" stroke-dashoffset="${CIRC}"/></svg>`;

export interface GifButton {
  host: HTMLElement;
  button: HTMLButtonElement;
  update(state: JobState): void;
}

export function createGifButton(color: string, onClick: (e: MouseEvent) => void): GifButton {
  const host = document.createElement('gifzor-button');
  host.dataset.state = 'idle';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${BUTTON_CSS}</style><button type="button">${ICON}<span class="pct">GIF</span></button>`;
  host.style.setProperty('--gz-color', color);
  const button = root.querySelector('button')!;
  const pct = root.querySelector<HTMLElement>('.pct')!;
  const bar = root.querySelector<SVGCircleElement>('.bar')!;
  button.title = t('btnTitle');
  button.setAttribute('aria-label', t('btnTitle'));

  const stop = (e: Event) => {
    // Keep X from opening the tweet when clicking our button.
    e.stopPropagation();
  };
  button.addEventListener('click', (e) => {
    e.preventDefault();
    stop(e);
    onClick(e);
  });
  for (const ev of ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'keydown'] as const) {
    button.addEventListener(ev, stop);
  }

  let resetTimer: ReturnType<typeof setTimeout> | undefined;
  return {
    host,
    button,
    update(state) {
      clearTimeout(resetTimer);
      host.dataset.state = state.kind;
      if (state.kind === 'running') {
        const p = Math.max(0, Math.min(100, state.percent));
        bar.style.strokeDashoffset = String(CIRC * (1 - p / 100));
        pct.textContent = `${Math.round(p)}%`;
        button.title = state.label;
      } else {
        pct.textContent = 'GIF';
        button.title =
          state.kind === 'done' ? t('stageDone') : state.kind === 'error' ? `${t('stageError')}: ${state.message}` : t('btnTitle');
        if (state.kind === 'done' || state.kind === 'error') {
          resetTimer = setTimeout(() => {
            host.dataset.state = 'idle';
            button.title = t('btnTitle');
          }, 6000);
        }
      }
    },
  };
}
