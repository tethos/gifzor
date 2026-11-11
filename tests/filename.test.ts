import { describe, expect, it } from 'vitest';
import { buildBaseName, finalizeFilename, sanitizeFilename } from '@/lib/filename';

describe('filename', () => {
  it('builds the default name', () => {
    expect(buildBaseName('{user}_{id}', { user: 'jack', id: '20', n: 1 })).toBe('jack_20');
  });

  it('appends the index for additional GIFs', () => {
    expect(buildBaseName('{user}_{id}', { user: 'jack', id: '20', n: 2 })).toBe('jack_20_2');
    expect(buildBaseName('{id}-{n}', { user: 'jack', id: '20', n: 2 })).toBe('20-2');
  });

  it('supports {date}', () => {
    const name = buildBaseName('{date}', { user: 'a', id: '1', n: 1, date: new Date(2026, 0, 5) });
    expect(name).toBe('2026-01-05');
  });

  it('removes illegal characters', () => {
    expect(sanitizeFilename('a/b:c*d?e<f>g|h')).toBe('a_b_c_d_e_f_g_h');
    expect(sanitizeFilename('  ..hidden.. ')).toBe('hidden');
    expect(sanitizeFilename('CON')).toBe('_CON');
    expect(sanitizeFilename('')).toBe('gif');
  });

  it('adds exactly one extension and blocks path traversal', () => {
    expect(finalizeFilename('cat.gif', 'gif')).toBe('cat.gif');
    expect(finalizeFilename('cat', 'gif')).toBe('cat.gif');
    expect(finalizeFilename('cat.gif', 'mp4')).toBe('cat.mp4');
    expect(finalizeFilename('../../etc/passwd', 'gif')).not.toContain('/');
  });
});
