export interface FilenameVars {
  user: string;
  id: string;
  /** 1-based index of the GIF within the post. */
  n: number;
  date?: Date;
}

const ILLEGAL = /[<>:"/\|?*\u0000-\u001f]/g;
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

/** Remove characters that are not allowed in file names on Windows/macOS/Linux. */
export function sanitizeFilename(name: string): string {
  let s = name.replace(ILLEGAL, '_').replace(/\s+/g, ' ').trim();
  s = s.replace(/^[.\s]+|[.\s]+$/g, '');
  if (RESERVED.test(s)) s = `_${s}`;
  return s.slice(0, 180) || 'gif';
}

function isoDate(d: Date): string {
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Build a base file name (without extension) from a pattern like "{user}_{id}".
 * When a post contains several GIFs and the pattern has no {n}, "_n" is appended for n > 1.
 */
export function buildBaseName(pattern: string, vars: FilenameVars): string {
  let out = pattern
    .replaceAll('{user}', vars.user || 'unknown')
    .replaceAll('{id}', vars.id || 'gif')
    .replaceAll('{date}', isoDate(vars.date ?? new Date()))
    .replaceAll('{n}', String(vars.n));
  if (vars.n > 1 && !pattern.includes('{n}')) out += `_${vars.n}`;
  return sanitizeFilename(stripExtension(out, 'gif'));
}

export function stripExtension(name: string, ext: string): string {
  const re = new RegExp(`\.${ext}$`, 'i');
  return name.trim().replace(re, '');
}

/** Ensure a user-entered file name is safe and ends with the given extension. */
export function finalizeFilename(name: string, ext: 'gif' | 'mp4'): string {
  const base = sanitizeFilename(stripExtension(stripExtension(name, 'gif'), 'mp4'));
  return `${base}.${ext}`;
}
