/** Detect X's colour scheme (Default / Dim / Lights out) from the page background. */
export function isDarkPage(): boolean {
  const bg = getComputedStyle(document.body).backgroundColor;
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(bg);
  if (!m) return matchMedia('(prefers-color-scheme: dark)').matches;
  const [r, g, b] = [m[1], m[2], m[3]].map(Number);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
}

export function themeClass(): 'dark' | 'light' {
  return isDarkPage() ? 'dark' : 'light';
}
