// ============================================================
// FFmpeg Service — Video Processing Engine
// Metadata extraction, audio extraction, clip generation,
// aspect ratio conversion, thumbnail generation
// ============================================================

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { config } from '../config/index.js';
import { getThumbDir, getProjectAudioDir, getProjectClipsDir, ensureDir } from './storage.js';
import type { VideoMetadata } from '../../../shared/types.js';
import { videoEncodingService } from './encodingProfiles.js';

// ── Video Validation ──

export async function validateVideo(filePath: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const metadata = await extractMetadata(filePath);
    if (!metadata.duration || metadata.duration <= 0) {
      return { valid: false, error: 'Video has no duration or is corrupted' };
    }
    if (metadata.duration > config.maxVideoDuration) {
      return { valid: false, error: `Video duration (${Math.round(metadata.duration / 60)}min) exceeds maximum (${Math.round(config.maxVideoDuration / 60)}min)` };
    }
    if (metadata.width === 0 || metadata.height === 0) {
      return { valid: false, error: 'Video has no video stream or invalid dimensions' };
    }
    if (metadata.audioTracks === 0) {
      return { valid: false, error: 'Video has no audio track. Audio is required for transcription.' };
    }
    return { valid: true };
  } catch (err: any) {
    return { valid: false, error: `Cannot read video: ${err.message}` };
  }
}

// ── Metadata Extraction ──

export async function extractMetadata(filePath: string): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    const args = [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath,
    ];

    const proc = spawn(config.ffprobePath, args);
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`FFprobe failed (code ${code}): ${stderr.slice(-300)}`));
      }

      try {
        const data = JSON.parse(stdout);
        const videoStream = data.streams?.find((s: any) => s.codec_type === 'video');
        const audioStream = data.streams?.find((s: any) => s.codec_type === 'audio');
        const audioTracks = data.streams?.filter((s: any) => s.codec_type === 'audio').length || 0;
        const format = data.format || {};

        // Parse FPS from various possible fields
        let fps = 30;
        if (videoStream?.r_frame_rate) {
          const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
          if (den && den > 0) fps = Math.round((num / den) * 100) / 100;
        } else if (videoStream?.avg_frame_rate) {
          const [num, den] = videoStream.avg_frame_rate.split('/').map(Number);
          if (den && den > 0) fps = Math.round((num / den) * 100) / 100;
        }

        const width = parseInt(videoStream?.width) || 0;
        const height = parseInt(videoStream?.height) || 0;
        let aspectRatio = '16:9';
        if (width > 0 && height > 0) {
          const ratio = width / height;
          if (Math.abs(ratio - (16 / 9)) < 0.05) aspectRatio = '16:9';
          else if (Math.abs(ratio - (9 / 16)) < 0.05) aspectRatio = '9:16';
          else if (Math.abs(ratio - 1) < 0.05) aspectRatio = '1:1';
          else if (Math.abs(ratio - (4 / 3)) < 0.05) aspectRatio = '4:3';
          else aspectRatio = `${width}:${height}`;
        }

        const videoDuration = videoStream?.duration
          ? parseFloat(videoStream.duration)
          : (videoStream?.nb_frames && fps ? Number((parseInt(videoStream.nb_frames, 10) / fps).toFixed(3)) : undefined);
        const audioDuration = audioStream?.duration ? parseFloat(audioStream.duration) : undefined;

        resolve({
          duration: parseFloat(format.duration) || 0,
          videoDuration,
          audioDuration,
          width,
          height,
          fps,
          codec: videoStream?.codec_name || '',
          pixelFormat: videoStream?.pix_fmt || 'yuv420p',
          colorSpace: videoStream?.color_space || videoStream?.color_range || 'bt709',
          audioCodec: audioStream?.codec_name || '',
          audioTracks,
          audioSampleRate: parseInt(audioStream?.sample_rate) || 44100,
          audioChannels: parseInt(audioStream?.channels) || 2,
          bitrate: parseInt(format.bit_rate) || parseInt(videoStream?.bit_rate) || 0,
          aspectRatio,
        });
      } catch (err: any) {
        reject(new Error(`Failed to parse FFprobe output: ${err.message}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`FFprobe not found or failed to start: ${err.message}`));
    });
  });
}

// ── Audio Extraction ──

export async function extractAudio(
  videoPath: string,
  projectId: string
): Promise<string> {
  const audioDir = getProjectAudioDir(projectId);
  const audioPath = path.join(audioDir, 'audio.wav');

  // If already extracted, return cached
  if (fs.existsSync(audioPath)) {
    return audioPath;
  }

  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-i', videoPath,
      '-vn',            // No video
      '-acodec', 'pcm_s16le',
      '-ar', '16000',   // 16kHz for Whisper
      '-ac', '1',       // Mono
      audioPath,
    ];

    const proc = spawn(config.ffmpegPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      if (code === 0 && fs.existsSync(audioPath)) {
        resolve(audioPath);
      } else {
        reject(new Error(`Audio extraction failed: ${stderr.slice(-300)}`));
      }
    });

    proc.on('error', (err) => reject(err));
  });
}

// ── Thumbnail Generation ──

export async function generateThumbnail(
  videoPath: string,
  projectId: string,
  timeSeconds: number = 5
): Promise<string> {
  const thumbDir = getThumbDir(projectId);
  const thumbFilename = `thumb_${Math.round(timeSeconds)}.jpg`;
  const thumbPath = path.join(thumbDir, thumbFilename);

  if (fs.existsSync(thumbPath)) {
    return `/api/files/thumbs/${projectId}/${thumbFilename}`;
  }

  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-ss', String(timeSeconds),
      '-i', videoPath,
      '-vframes', '1',
      '-vf', 'scale=640:-1',
      '-q:v', '3',
      thumbPath,
    ];

    const proc = spawn(config.ffmpegPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      if (code === 0 && fs.existsSync(thumbPath)) {
        resolve(`/api/files/thumbs/${projectId}/${thumbFilename}`);
      } else {
        // Fallback: no thumbnail
        resolve('');
      }
    });

    proc.on('error', () => resolve(''));
  });
}

// ── Clip Extraction ──

export async function extractClip(
  videoPath: string,
  projectId: string,
  startTime: number,
  endTime: number,
  outputFilename: string
): Promise<string> {
  return extractClipAsIs(videoPath, projectId, startTime, endTime, outputFilename);
}

/**
 * Fast Lossless / Stream-Copy As-Is Clip Extraction.
 * Keeps original aspect ratio (16:9 / source), pristine resolution, zero blur/captions overhead.
 * Takes ~0.2s with stream copy, fallback to ultrafast re-encode if keyframe boundaries require it.
 */
export async function extractClipAsIs(
  videoPath: string,
  projectId: string,
  startTime: number,
  endTime: number,
  outputFilename: string
): Promise<string> {
  const clipsDir = getProjectClipsDir(projectId);
  const outputPath = path.join(clipsDir, outputFilename);

  if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1000) {
    return outputPath;
  }

  const duration = Math.max(0.5, endTime - startTime);

  // Attempt 1: Ultra-fast stream copy (-c copy) - instant, lossless cut
  const streamCopyOk = await new Promise<boolean>((resolve) => {
    const args = [
      '-y',
      '-ss', String(startTime),
      '-i', videoPath,
      '-t', String(duration),
      '-c', 'copy',
      '-avoid_negative_ts', '1',
      '-movflags', '+faststart',
      outputPath,
    ];
    const proc = spawn(config.ffmpegPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    proc.on('close', (code) => {
      if (code === 0 && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1000) {
        resolve(true);
      } else {
        resolve(false);
      }
    });
    proc.on('error', () => resolve(false));
  });

  if (streamCopyOk) {
    return outputPath;
  }

  // Attempt 2: Quality-controlled H.264 cut preserving source resolution and framerate
  return new Promise((resolve, reject) => {
    const enc = videoEncodingService.getEncodingParameters('QUALITY_CUT', {});
    const args = [
      '-y',
      '-threads', '0',
      '-ss', String(startTime),
      '-i', videoPath,
      '-t', String(duration),
      '-c:v', 'libx264',
      '-preset', 'medium', // High quality visual preservation
      '-crf', '17',
      '-c:a', 'aac',
      '-b:a', '320k',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      outputPath,
    ];

    const proc = spawn(config.ffmpegPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      if (code === 0 && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1000) {
        resolve(outputPath);
      } else {
        reject(new Error(`Clip extraction failed: ${stderr.slice(-300)}`));
      }
    });

    proc.on('error', (err) => reject(err));
  });
}

// ── 9:16 Reframing ──

export async function reframeToVertical(
  inputPath: string,
  outputPath: string,
  options: {
    width?: number;
    height?: number;
    mode?: 'center' | 'face';
  } = {}
): Promise<string> {
  const outW = options.width || config.outputWidth;
  const outH = options.height || config.outputHeight;

  return new Promise((resolve, reject) => {
    // Center crop: scale to fill, then crop to target
    const filterComplex = [
      `scale=${outW}:${outH}:force_original_aspect_ratio=increase:flags=bicubic`,
      `crop=${outW}:${outH}`,
      'setsar=1',
    ].join(',');

    const args = [
      '-y',
      '-threads', '0',
      '-i', inputPath,
      '-vf', filterComplex,
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-tune', 'fastdecode',
      '-threads', '0',
      '-crf', '18',
      '-c:a', 'copy',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      '-r', String(config.outputFps),
      outputPath,
    ];

    const proc = spawn(config.ffmpegPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      if (code === 0 && fs.existsSync(outputPath)) {
        resolve(outputPath);
      } else {
        reject(new Error(`Reframing failed: ${stderr.slice(-300)}`));
      }
    });

    proc.on('error', (err) => reject(err));
  });
}

// ── Burn Captions ──

export async function burnCaptions(
  inputPath: string,
  outputPath: string,
  srtPath: string,
  style?: { fontSize?: number; fontColor?: string }
): Promise<string> {
  return new Promise((resolve, reject) => {
    const fontSize = style?.fontSize || 52;
    const fontColor = (style?.fontColor || '#FFFFFF').replace('#', '');
    const escapedSrt = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:');

    const args = [
      '-y',
      '-threads', '0',
      '-i', inputPath,
      '-vf', `subtitles='${escapedSrt}':force_style='FontName=Nirmala UI,Segoe UI,Arial,FontSize=${fontSize},PrimaryColour=&H${fontColor}&,OutlineColour=&H000000&,Outline=3,Shadow=1,MarginV=60'`,
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-tune', 'fastdecode',
      '-threads', '0',
      '-crf', '18',
      '-c:a', 'copy',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      outputPath,
    ];

    const proc = spawn(config.ffmpegPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      if (code === 0 && fs.existsSync(outputPath)) {
        resolve(outputPath);
      } else {
        reject(new Error(`Caption burn failed: ${stderr.slice(-300)}`));
      }
    });

    proc.on('error', (err) => reject(err));
  });
}

// ── Single-Pass Direct Short Render (Fast 9:16 + Captions in 1 Step) ──

export async function renderShortDirect(
  videoPath: string,
  outputPath: string,
  startTime: number,
  endTime: number,
  options: {
    width?: number;
    height?: number;
    fps?: number;
    srtPath?: string | null;
    fontSize?: number;
    fontColor?: string;
    cropX?: number;
    cropExpr?: string;
    reframeMode?: string;
    blurFillExpr?: string;
    onProgress?: (percent: number) => void;
    onProc?: (proc: any) => void;
  } = {}
): Promise<string> {
  const outW = options.width || config.outputWidth;
  const outH = options.height || config.outputHeight;
  const outFps = options.fps || config.outputFps;
  const duration = Math.max(1, endTime - startTime);

  const hasSrt = options.srtPath && fs.existsSync(options.srtPath) && fs.statSync(options.srtPath).size > 10;
  const fontSize = options.fontSize || 46;
  const fontColor = (options.fontColor || '#FFFFFF').replace('#', '');
  const escapedSrt = options.srtPath ? options.srtPath.replace(/\\/g, '/').replace(/:/g, '\\:') : '';

  let args: string[] = [];

  if (options.reframeMode === 'blur_fill') {
    // Lossless Blur: 100% full frame preserved, zero cropping of original video
    // Ultra-Fast split=2 single decode + fast_bilinear background blur + bicubic foreground
    const filterComplex =
      `[0:v]split=2[in_bg][in_fg];` +
      `[in_bg]scale=96:170:force_original_aspect_ratio=increase,crop=96:170,boxblur=4:1,scale=${outW}:${outH}:flags=fast_bilinear,eq=brightness=-0.08[bg];` +
      `[in_fg]scale=${outW}:${outH}:force_original_aspect_ratio=decrease:flags=bicubic[fg];` +
      `[bg][fg]overlay=(W-w)/2:(H-h)/2:eval=init,setsar=1` +
      (hasSrt
        ? `[base];[base]subtitles='${escapedSrt}':force_style='PlayResX=1080,PlayResY=1920,FontName=Nirmala UI,Segoe UI,Arial,FontSize=${fontSize},PrimaryColour=&H00${fontColor}&,OutlineColour=&H00000000&,BackColour=&H80000000&,Outline=3,Shadow=1,MarginV=180,Alignment=2'[v]`
        : `[v]`);

    args = [
      '-y',
      '-threads', '0',
      '-ss', String(startTime),
      '-i', videoPath,
      '-t', String(duration),
      '-filter_complex', filterComplex,
      '-map', '[v]',
      '-map', '0:a?',
      '-r', String(outFps),
      '-c:v', 'libx264',
      '-preset', 'veryfast', // High visual quality with 4x-5x faster encode speed
      '-crf', '17',
      '-c:a', 'aac',
      '-b:a', '320k',
      '-movflags', '+faststart',
      outputPath,
    ];
  } else {
    // Dynamic Action / Face Crop or Centered Fallback
    const filters: string[] = [];

    if (options.cropExpr) {
      filters.push(options.cropExpr);
    } else if (options.cropX !== undefined && options.cropX >= 0) {
      filters.push(
        `scale=-1:${outH}:force_original_aspect_ratio=increase:flags=bicubic`,
        `crop=${outW}:${outH}:${Math.round(options.cropX)}:0`,
        'setsar=1'
      );
    } else {
      // Center crop fallback
      filters.push(
        `scale=${outW}:${outH}:force_original_aspect_ratio=increase:flags=bicubic`,
        `crop=${outW}:${outH}`,
        'setsar=1'
      );
    }

    // Proper ASS/SRT Subtitle Burn with explicit 1080x1920 canvas scaling
    if (hasSrt) {
      filters.push(
        `subtitles='${escapedSrt}':force_style='PlayResX=1080,PlayResY=1920,FontName=Nirmala UI,Segoe UI,Arial,FontSize=${fontSize},PrimaryColour=&H00${fontColor}&,OutlineColour=&H00000000&,BackColour=&H80000000&,Outline=3,Shadow=1,MarginV=220,Alignment=2'`
      );
    }

    args = [
      '-y',
      '-threads', '0',
      '-ss', String(startTime),
      '-i', videoPath,
      '-t', String(duration),
      '-vf', filters.join(','),
      '-r', String(outFps),
      '-c:v', 'libx264',
      '-preset', 'veryfast', // Fast encode avoiding CPU bottleneck
      '-crf', '18',
      '-c:a', 'aac',
      '-b:a', '320k',
      '-movflags', '+faststart',
      outputPath,
    ];
  }

  return new Promise((resolve, reject) => {
    const proc = spawn(config.ffmpegPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    if (options.onProc) options.onProc(proc);
    let stderr = '';

    proc.stderr?.on('data', (d: Buffer) => {
      const text = d.toString();
      stderr += text;

      if (options.onProgress && duration > 0) {
        const timeMatch = text.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/);
        if (timeMatch) {
          const currentSec =
            parseFloat(timeMatch[1]) * 3600 +
            parseFloat(timeMatch[2]) * 60 +
            parseFloat(timeMatch[3]);
          const pct = Math.min(98, Math.max(10, Math.round((currentSec / duration) * 100)));
          options.onProgress(pct);
        }
      }
    });

    proc.on('close', (code) => {
      if (options.onProc) options.onProc(null);
      if (code === 0 && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
        if (options.onProgress) options.onProgress(100);
        resolve(outputPath);
      } else {
        reject(new Error(`Short render failed: ${stderr.slice(-300)}`));
      }
    });

    proc.on('error', (err) => {
      if (options.onProc) options.onProc(null);
      reject(err);
    });
  });
}

// ── Check FFmpeg availability ──

export async function checkFFmpeg(): Promise<{ available: boolean; version?: string }> {
  return new Promise((resolve) => {
    const proc = spawn(config.ffmpegPath, ['-version']);
    let output = '';
    proc.stdout.on('data', (d: Buffer) => { output += d.toString(); });
    proc.on('close', (code) => {
      if (code === 0) {
        const version = output.split('\n')[0] || 'unknown';
        resolve({ available: true, version: version.substring(0, 80) });
      } else {
        resolve({ available: false });
      }
    });
    proc.on('error', () => resolve({ available: false }));
  });
}
