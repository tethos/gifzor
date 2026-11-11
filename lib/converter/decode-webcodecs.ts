import { createFile, DataStream, Endianness, MP4BoxBuffer, type ISOFile, type Sample, type Track } from 'mp4box';
import { ConvertError, throwIfAborted } from './errors';
import { FrameSampler, scaledSize } from './sampler';
import { MAX_FRAMES, type ClipFrame, type DecodedClip, type DecodeOptions } from './types';

export class WebCodecsUnsupported extends Error {}

interface Demuxed {
  track: Track;
  samples: Sample[];
  description?: Uint8Array;
}

/** Extract the codec configuration record (avcC/hvcC/…) that VideoDecoder needs as `description`. */
function codecDescription(file: ISOFile, trackId: number): Uint8Array | undefined {
  const trak = file.getTrackById(trackId) as unknown as {
    mdia?: { minf?: { stbl?: { stsd?: { entries?: Array<Record<string, unknown>> } } } };
  };
  for (const entry of trak.mdia?.minf?.stbl?.stsd?.entries ?? []) {
    const box = (entry.avcC ?? entry.hvcC ?? entry.vpcC ?? entry.av1C) as
      | { write(stream: unknown): void }
      | undefined;
    if (box) {
      const stream = new DataStream(undefined, 0, Endianness.BIG_ENDIAN);
      box.write(stream);
      // skip the 8-byte box header (size + type)
      return new Uint8Array((stream as unknown as { buffer: ArrayBuffer }).buffer, 8);
    }
  }
  return undefined;
}

export function demux(buf: ArrayBuffer): Demuxed {
  const file = createFile();
  let track: Track | undefined;
  let description: Uint8Array | undefined;
  const samples: Sample[] = [];
  let error: string | undefined;

  file.onError = (_module, message) => {
    error = message;
  };
  file.onReady = (info) => {
    track = info.videoTracks[0];
    if (!track) return;
    description = codecDescription(file, track.id);
    file.setExtractionOptions(track.id, undefined, { nbSamples: Infinity });
    file.start();
  };
  file.onSamples = (_id, _user, s) => {
    samples.push(...s);
  };

  file.appendBuffer(MP4BoxBuffer.fromArrayBuffer(buf, 0));
  file.flush();

  if (error) throw new ConvertError('decode', error);
  if (!track || !samples.length) throw new ConvertError('decode', 'no video track');
  return { track, samples, description };
}

/** Fast, frame-accurate decoding with WebCodecs (Chrome 94+, Firefox 130+). */
export async function decodeWithWebCodecs(buf: ArrayBuffer, o: DecodeOptions): Promise<DecodedClip> {
  if (typeof VideoDecoder === 'undefined') throw new WebCodecsUnsupported('VideoDecoder missing');

  const { track, samples, description } = demux(buf);
  const srcWidth = track.video?.width || track.track_width;
  const srcHeight = track.video?.height || track.track_height;
  const config: VideoDecoderConfig = {
    codec: track.codec,
    codedWidth: srcWidth,
    codedHeight: srcHeight,
    description,
  };
  const support = await VideoDecoder.isConfigSupported(config);
  if (!support.supported) throw new WebCodecsUnsupported(`codec ${track.codec} not supported`);

  const { width, height } = scaledSize(srcWidth, srcHeight, o.targetWidth);
  const toUs = (v: number) => (v * 1e6) / track.timescale;
  const t0 = Math.min(...samples.map((s) => s.cts));
  const maxUs = o.maxDurationSec > 0 ? o.maxDurationSec * 1e6 : Infinity;
  const endUs = Math.min(maxUs, Math.max(...samples.map((s) => toUs(s.cts - t0 + s.duration))));

  const sampler = new FrameSampler(o.fps);
  const frames: ClipFrame[] = [];
  const pending: Promise<void>[] = [];
  let decodeError: Error | undefined;
  let outputs = 0;

  const decoder = new VideoDecoder({
    output: (frame) => {
      outputs++;
      o.onProgress(Math.min(1, outputs / samples.length));
      const ts = frame.timestamp;
      if (ts >= endUs || pending.length >= MAX_FRAMES || !sampler.keep(ts)) {
        frame.close();
        return;
      }
      pending.push(
        createImageBitmap(frame, { resizeWidth: width, resizeHeight: height, resizeQuality: 'high' })
          .then((bitmap) => {
            frames.push({ bitmap, ts });
          })
          .finally(() => frame.close()),
      );
    },
    error: (e) => {
      decodeError = e;
    },
  });

  try {
    decoder.configure(config);
    for (const s of samples) {
      throwIfAborted(o.signal);
      if (decodeError) break;
      if (!s.data) continue;
      decoder.decode(
        new EncodedVideoChunk({
          type: s.is_sync ? 'key' : 'delta',
          timestamp: toUs(s.cts - t0),
          duration: toUs(s.duration),
          data: s.data,
        }),
      );
      // Backpressure: don't flood the decoder.
      while (decoder.decodeQueueSize > 8) await new Promise((r) => setTimeout(r, 0));
    }
    if (!decodeError) await decoder.flush();
    await Promise.all(pending);
  } catch (e) {
    await Promise.allSettled(pending);
    frames.forEach((f) => f.bitmap.close());
    throw e;
  } finally {
    if (decoder.state !== 'closed') decoder.close();
  }

  if (decodeError || !frames.length) {
    frames.forEach((f) => f.bitmap.close());
    throw new ConvertError('decode', decodeError?.message ?? 'no frames decoded');
  }
  frames.sort((a, b) => a.ts - b.ts);
  const capped = frames.length >= MAX_FRAMES;
  const durationUs = capped ? frames[frames.length - 1].ts + 1e6 / o.fps : endUs;
  o.onProgress(1);
  return { frames, durationUs, srcWidth, srcHeight, width, height };
}
