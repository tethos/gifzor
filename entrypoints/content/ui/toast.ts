import { TOAST_CSS } from './styles';

let current: HTMLElement | null = null;

export function toast(text: string, kind: 'info' | 'warn' = 'info', ms = 4000): void {
  current?.remove();
  const host = document.createElement('gifzor-toast');
  const root = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = TOAST_CSS;
  const box = document.createElement('div');
  box.className = kind;
  box.setAttribute('role', 'status');
  box.textContent = text;
  root.append(style, box);
  document.body.append(host);
  current = host;
  setTimeout(() => {
    if (current === host) current = null;
    host.remove();
  }, ms);
}
