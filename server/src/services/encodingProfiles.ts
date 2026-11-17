// ============================================================
// Video Encoding Profiles Service
// Centralized video encoding configuration & quality engine
// Preserves source resolution, framerate, audio fidelity, and colors
// ============================================================

import type { VideoMetadata, VideoEncodingProfileType } from '../../../shared/types.js';

export interface VideoEncodingParameters {
  videoCodec: string;
  preset: string;
  crf?: number;
  qp?: number;
  videoBitrate?: string;
  audioCodec: string;
  audioBitrate: string;
  pixelFormat: string;
  tune?: string;
  threads: string;
  movFlags: string[];
  scaleFilterFlags: string;
  targetWidth: number;
  targetHeight: number;
  targetFps: number;
  isStreamCopy: boolean;
  rawArgs: string[];
}

export class VideoEncodingService {
  /**
   * Resolves the authoritative encoding parameters based on the requested profile,
   * source video metadata, and target preferences.
   */
  public getEncodingParameters(
    profile: VideoEncodingProfileType,
    source: Partial<VideoMetadata>,
    options: {
      targetWidth?: number;
      targetHeight?: number;
      targetFps?: number;
      audioBitrate?: string;
      forceReencode?: boolean;
    } = {}
  ): VideoEncodingParameters {
    const srcW = source.width || 1920;
    const srcH = source.height || 1080;
    const srcFps = this.sanitizeFps(source.fps || 30);
    const srcPixFmt = source.pixelFormat || 'yuv420p';

    let targetW = options.targetWidth || srcW;
    let targetHeight = options.targetHeight || srcH;
    let targetFps = options.targetFps || srcFps;

    let videoCodec = 'libx264';
    let preset = 'medium'; // Balance of speed and pristine visual transparency (avoids ultrafast artifacts)
    let crf = 17; // Visually transparent master quality
    let qp: number | undefined;
    let audioCodec = 'aac';
    let audioBitrate = options.audioBitrate || '320k';
    let isStreamCopy = false;
    let tune: string | undefined;

    switch (profile) {
      case 'FAST_CUT':
        // Pure stream copy where safe
        if (!options.forceReencode) {
          isStreamCopy = true;
          videoCodec = 'copy';
          audioCodec = 'copy';
        } else {
          // Frame-accurate high quality fallback
          preset = 'medium';
          crf = 17;
          audioBitrate = '320k';
        }
        break;

      case 'QUALITY_CUT':
        // Frame-accurate cut with near-lossless visually transparent quality
        preset = 'medium';
        crf = 17;
        audioBitrate = '320k';
        targetW = srcW;
        targetHeight = srcH;
        targetFps = srcFps;
        break;

      case 'SOURCE_PRESERVE':
      case 'LONG_FORM_HIGH_QUALITY':
        // For 16:9 Long-Form Master:
        // If source is already 16:9 (1080p, 1440p, 4K), preserve native dimensions!
        if (Math.abs((srcW / srcH) - (16 / 9)) < 0.05) {
          targetW = srcW;
          targetHeight = srcH;
        } else {
          // Source not 16:9: scale to fit 16:9 canvas preserving height
          targetW = Math.round((srcH * 16) / 9);
          targetHeight = srcH;
        }
        targetFps = srcFps;
        preset = 'medium';
        crf = 17;
        audioBitrate = '320k';
        break;

      case 'SHORTS_HIGH_QUALITY':
        // Master 9:16 Vertical Render
        targetW = 1080;
        targetHeight = 1920;
        targetFps = srcFps; // Preserve source framerate (e.g. 60fps for sports)
        preset = 'medium';
        crf = 18;
        audioBitrate = '256k';
        break;

      case 'LOSSLESS_BLUR_HIGH_QUALITY':
        targetW = options.targetWidth || 1080;
        targetHeight = options.targetHeight || 1920;
        targetFps = srcFps;
        preset = 'medium';
        crf = 17;
        audioBitrate = '320k';
        break;

      case 'SMART_REFRAME_HIGH_QUALITY':
        targetW = options.targetWidth || 1080;
        targetHeight = options.targetHeight || 1920;
        targetFps = srcFps;
        preset = 'medium';
        crf = 18;
        audioBitrate = '256k';
        break;

      case 'PREVIEW_OPTIMIZED':
        preset = 'ultrafast';
        crf = 22;
        audioBitrate = '128k';
        tune = 'fastdecode';
        break;
    }

    // Build FFmpeg CLI argument list
    const rawArgs: string[] = ['-threads', '0'];

    if (isStreamCopy) {
      rawArgs.push('-c', 'copy');
    } else {
      rawArgs.push('-c:v', videoCodec);
      rawArgs.push('-preset', preset);
      if (qp !== undefined) {
        rawArgs.push('-qp', String(qp));
      } else {
        rawArgs.push('-crf', String(crf));
      }
      if (tune) {
        rawArgs.push('-tune', tune);
      }
      rawArgs.push('-pix_fmt', srcPixFmt.startsWith('yuv420') ? srcPixFmt : 'yuv420p');
      rawArgs.push('-c:a', audioCodec);
      rawArgs.push('-b:a', audioBitrate);
    }

    rawArgs.push('-movflags', '+faststart');

    return {
      videoCodec,
      preset,
      crf,
      qp,
      audioCodec,
      audioBitrate,
      pixelFormat: srcPixFmt,
      tune,
      threads: '0',
      movFlags: ['+faststart'],
      scaleFilterFlags: 'bicubic',
      targetWidth: targetW,
      targetHeight: targetHeight,
      targetFps,
      isStreamCopy,
      rawArgs,
    };
  }

  /**
   * Generates FFmpeg arguments for lossless intermediate buffer generation (-qp 0).
   * Used during multi-segment compilation to prevent intermediate generation loss.
   */
  public getLosslessIntermediateArgs(): string[] {
    return [
      '-threads', '0',
      '-c:v', 'libx264',
      '-qp', '0', // Mathematically 100% lossless H.264
      '-preset', 'ultrafast', // Instant encode without rate-distortion compute
      '-c:a', 'pcm_s16le', // Uncompressed PCM audio
    ];
  }

  /**
   * Sanitizes and snaps detected framerates to standard broadcast/web rates.
   */
  public sanitizeFps(rawFps: number): number {
    if (!rawFps || isNaN(rawFps) || rawFps <= 0) return 30;
    // Common standard rates: 23.976, 24, 25, 29.97, 30, 50, 59.94, 60
    // NTSC vs film rates: 23.976 (24000/1001) vs 24 differ by 0.024, so use a 0.01 threshold
    if (Math.abs(rawFps - 23.976) < 0.01) return 23.976;
    if (Math.abs(rawFps - 24) < 0.01) return 24;
    if (Math.abs(rawFps - 25) < 0.01) return 25;
    if (Math.abs(rawFps - 29.97) < 0.01) return 29.97;
    if (Math.abs(rawFps - 30) < 0.01) return 30;
    if (Math.abs(rawFps - 50) < 0.01) return 50;
    if (Math.abs(rawFps - 59.94) < 0.01) return 59.94;
    if (Math.abs(rawFps - 60) < 0.01) return 60;
    return Math.round(rawFps * 100) / 100;
  }
}

export const videoEncodingService = new VideoEncodingService();
