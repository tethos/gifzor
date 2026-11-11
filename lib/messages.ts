/** Message protocol between content script, background and offscreen document. */

export const CONVERT_PORT = 'gifzor-convert';

export interface ConvertOptions {
  /** Target width in px; 0 = original. */
  width: number;
  fps: number;
  colors: number;
  /** 0 = unlimited */
  maxBytes: number;
  autoFit: boolean;
  /** 0 = unlimited */
  maxDurationSec: number;
}

export interface ConvertJob {
  mp4Url: string;
  filename: string;
  options: ConvertOptions;
  /** Whether the GIF bytes should be sent back (preview / clipboard). */
  returnData: boolean;
}

export type Stage = 'fetch' | 'decode' | 'encode';

export interface ProgressInfo {
  stage: Stage;
  /** 0..1 */
  progress: number;
  /** Encode attempt (1 = first, >1 = shrinking). */
  attempt: number;
}

export interface ConvertResult {
  bytes: number;
  width: number;
  height: number;
  fps: number;
  colors: number;
  frames: number;
  attempts: number;
  /** true when maxBytes could not be reached. */
  overLimit: boolean;
  /** Base64-encoded GIF (only when requested). */
  dataB64?: string;
}

export type ErrorCode = 'fetch' | 'decode' | 'generic';

/** Content script -> background (over the port). */
export type PortRequest =
  | { type: 'convert'; job: ConvertJob }
  | { type: 'download-mp4'; mp4Url: string; filename: string }
  | { type: 'cancel' };

/** Background -> content script (over the port). */
export type PortResponse =
  | { type: 'progress'; info: ProgressInfo }
  | { type: 'done'; result: ConvertResult }
  | { type: 'error'; code: ErrorCode; message: string };

/** Content script -> background (one-off). */
export type RuntimeRequest = { type: 'resolve-mp4'; tweetId: string } | { type: 'open-options' };

/** Background <-> offscreen document (runtime messages, Chrome only). */
export type OffscreenMessage =
  | { target: 'offscreen'; type: 'convert'; jobId: string; job: ConvertJob }
  | { target: 'offscreen'; type: 'cancel'; jobId: string }
  | { target: 'offscreen'; type: 'revoke'; url: string }
  | { target: 'background'; type: 'progress'; jobId: string; info: ProgressInfo }
  | { target: 'background'; type: 'done'; jobId: string; result: ConvertResult; blobUrl: string }
  | { target: 'background'; type: 'error'; jobId: string; code: ErrorCode; message: string };
