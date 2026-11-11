import { storage } from 'wxt/utils/storage';

export const WIDTH_CHOICES = [240, 320, 480, 0] as const; // 0 = original width
export const FPS_CHOICES = [10, 15, 20] as const;
export const COLOR_CHOICES = [256, 128, 64] as const;

export interface Settings {
  /** Target width in px; 0 means "original width". */
  width: number;
  fps: number;
  colors: number;
  /** Maximum output size in MB (0 = unlimited). */
  maxSizeMB: number;
  /** Re-encode with lower quality when the result exceeds maxSizeMB. */
  autoFit: boolean;
  /** Maximum clip length in seconds (0 = unlimited). */
  maxDurationSec: number;
  copyToClipboard: boolean;
  filenamePattern: string;
}

export const DEFAULT_SETTINGS: Settings = {
  width: 480,
  fps: 15,
  colors: 256,
  maxSizeMB: 10,
  autoFit: true,
  maxDurationSec: 0,
  copyToClipboard: false,
  filenamePattern: '{user}_{id}',
};

const settingsItem = storage.defineItem<Settings>('sync:settings', {
  fallback: DEFAULT_SETTINGS,
});

export async function getSettings(): Promise<Settings> {
  // Merge with defaults so that newly added settings get sensible values.
  return { ...DEFAULT_SETTINGS, ...(await settingsItem.getValue()) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await settingsItem.setValue(next);
  return next;
}

export async function resetSettings(): Promise<Settings> {
  await settingsItem.setValue(DEFAULT_SETTINGS);
  return DEFAULT_SETTINGS;
}

export function watchSettings(cb: (s: Settings) => void): () => void {
  return settingsItem.watch((v) => cb({ ...DEFAULT_SETTINGS, ...v }));
}
