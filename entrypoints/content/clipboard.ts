/**
 * Clipboard: browsers only allow image/png (and text) for ClipboardItem today, so writing an
 * animated image/gif usually fails. We try anyway and fall back to copying the MP4 link
 * (Discord and most chat apps embed it as a playable video).
 */
export type CopyOutcome = 'gif' | 'link' | 'failed';

async function writeText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Legacy fallback (works with the clipboardWrite permission even without user activation).
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export async function copyGif(gif: Blob | null, fallbackUrl: string): Promise<CopyOutcome> {
  if (gif && typeof ClipboardItem !== 'undefined') {
    try {
      const supports = (ClipboardItem as unknown as { supports?: (t: string) => boolean }).supports;
      if (!supports || supports('image/gif')) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/gif': gif })]);
        return 'gif';
      }
    } catch {
      /* not supported → fall back to the link */
    }
  }
  return (await writeText(fallbackUrl)) ? 'link' : 'failed';
}
