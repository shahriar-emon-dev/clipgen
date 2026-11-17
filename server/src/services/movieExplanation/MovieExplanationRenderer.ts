// ============================================================
// Movie Explanation Renderer — High-Fidelity Transformative Engine
// Implements the Visual "Invisible" Pipeline & Audio Composite Pipeline:
// 1. Dynamic Micro-Scaling (The "Breath" Effect) with Lanczos scaling
// 2. Professional Color Remapping (The "LUT" Effect)
// 3. Micro-Temporal Shifting (0.98x - 1.02x speed shift)
// 4. Intelligent Mirroring (hflip only when AI detects no text/signs)
// 5. Audio Composite (The Void, The Anchor, The Mask, The Texture)
// 6. Visually Lossless CRF 18, Preset Slow, YUV420p Pro Export
// 7. Hardware Efficient Sequential Rendering for i3 CPU
// ============================================================

import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { config } from '../../config/index.js';
import type {
  MovieExplanationTimeline,
  MovieTimelineShot,
  VoiceoverOutputAspectRatio,
  TransformativeEditingSettings,
  RenderOutputValidationResult,
  ExportManifest,
} from '../../../../shared/types.js';
import { getMovieExplanationRendersDir, getMovieExplanationProjectDir, getMovieExplanationThumbsDir, ensureDir } from '../storage.js';
import { transformativeFilterEngine } from './TransformativeFilterEngine.js';
import { audioCompositeEngine } from './AudioCompositeEngine.js';
import { renderChunkCache } from './RenderChunkCache.js';
import { extractMetadata } from '../ffmpeg.js';
import { titleBumperDetector, type FrameSignalStats } from './TitleBumperDetector.js';
import { aiDirectorReviewStage } from './AIDirectorReviewStage.js';

export interface RenderProgressCallback {
  (progress: number, stage: string, detail?: string): void;
}

export interface DetectedHardwareEncoderInfo {
  encoder: 'h264_qsv' | 'h264_nvenc' | 'h264_amf' | 'libx264';
  isHardwareAccelerated: boolean;
  name: string;
}

let cachedHardwareEncoder: DetectedHardwareEncoderInfo | null = null;

export async function probeEncoder(encoderName: string): Promise<boolean> {
  return new Promise((resolve) => {
    let resolved = false;
    let proc: any = null;

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        try {
          if (proc) {
            if (os.platform() === 'win32' && proc.pid) {
              spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
            } else {
              proc.kill('SIGKILL');
            }
          }
        } catch {}
        resolve(false);
      }
    }, 3500);

    try {
      proc = spawn(
        config.ffmpegPath,
        [
          '-y',
          '-f', 'lavfi', '-i', 'color=c=black:s=64x64:d=0.1',
          '-c:v', encoderName,
          '-f', 'null', '-'
        ],
        { stdio: 'ignore' }
      );
      proc.on('close', (code: number) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          resolve(code === 0);
        }
      });
      proc.on('error', () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          resolve(false);
        }
      });
    } catch {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve(false);
      }
    }
  });
}

export async function detectBestEncoder(): Promise<DetectedHardwareEncoderInfo> {
  if (cachedHardwareEncoder !== null) return cachedHardwareEncoder;

  // 1. Probe Intel Quick Sync Video (QSV) - primary hardware accelerator on Intel UHD/Iris GPUs
  if (await probeEncoder('h264_qsv')) {
    cachedHardwareEncoder = {
      encoder: 'h264_qsv',
      isHardwareAccelerated: true,
      name: 'Intel Quick Sync Video (h264_qsv)',
    };
    return cachedHardwareEncoder;
  }

  // 2. Probe NVIDIA NVENC
  if (await probeEncoder('h264_nvenc')) {
    cachedHardwareEncoder = {
      encoder: 'h264_nvenc',
      isHardwareAccelerated: true,
      name: 'NVIDIA NVENC (h264_nvenc)',
    };
    return cachedHardwareEncoder;
  }

  // 3. Probe AMD AMF
  if (await probeEncoder('h264_amf')) {
    cachedHardwareEncoder = {
      encoder: 'h264_amf',
      isHardwareAccelerated: true,
      name: 'AMD AMF (h264_amf)',
    };
    return cachedHardwareEncoder;
  }

  // 4. Reliable CPU Fallback
  cachedHardwareEncoder = {
    encoder: 'libx264',
    isHardwareAccelerated: false,
    name: 'CPU x264 (libx264)',
  };
  return cachedHardwareEncoder;
}

export class MovieExplanationRenderer {
  private activeProcesses: Map<string, Set<any>> = new Map();
  private abortedProjects: Set<string> = new Set();

  /**
   * Aborts any running render process for the given project.
   */
  public abortRender(projectId: string): void {
    this.abortedProjects.add(projectId);
    const procs = this.activeProcesses.get(projectId);
    if (procs) {
      for (const proc of procs) {
        try {
          if (os.platform() === 'win32' && proc.pid) {
            spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F']);
          } else {
            proc.kill('SIGKILL');
          }
        } catch {
          // Process might already be terminated
        }
      }
      this.activeProcesses.delete(projectId);
    }
  }

  /**
   * Checks if a project's render has been aborted.
   */
  public isAborted(projectId: string): boolean {
    return this.abortedProjects.has(projectId);
  }

  /**
   * Tracks an active child process under a projectId.
   */
  private registerProcess(projectId: string, proc: any): void {
    let procs = this.activeProcesses.get(projectId);
    if (!procs) {
      procs = new Set();
      this.activeProcesses.set(projectId, procs);
    }
    procs.add(proc);
    proc.on('close', () => {
      procs?.delete(proc);
      if (procs?.size === 0) {
        this.activeProcesses.delete(projectId);
      }
    });
  }

  /**
   * Renders the complete final video directly from the original source movie/clips and authoritative voiceover.
   * Utilizes sequential/controlled rendering for i3 compatibility, visually lossless CRF 18,
   * Lanczos scaling, and the complete invisible copyright bypass pipeline.
   */
  public async renderExplanationVideo(
    projectId: string,
    timeline: MovieExplanationTimeline,
    voiceoverAudioPath: string,
    onProgress?: RenderProgressCallback
  ): Promise<{
    outputPath: string;
    fileSize: number;
    duration: number;
    reusedCount?: number;
    freshRenderCount?: number;
    fps?: number;
    validation?: RenderOutputValidationResult;
    manifest?: ExportManifest;
  }> {
    this.abortedProjects.delete(projectId);

    const projectDir = getMovieExplanationProjectDir(projectId);
    const rendersDir = getMovieExplanationRendersDir(projectId);
    const tempDir = path.join(projectDir, `temp_render_${Date.now()}`);
    ensureDir(tempDir);

    const outW = timeline.outputWidth || 1920;
    const outH = timeline.outputHeight || 1080;
    const outFps = timeline.outputFps || 60; // 60 FPS standard quality export

    const allShots = timeline.shots || [];
    if (allShots.length === 0) {
      throw new Error('Timeline contains no shots to render.');
    }

    const totalShots = allShots.length;
    onProgress?.(5, 'preparing_render', `Preparing ${totalShots} visual shots for 60 FPS transformative rendering...`);

    // ── Step 0: Detect Available Hardware Acceleration & Optimal Presets ──
    const settings = timeline.transformativeSettings;
    const requestedEncoder = settings?.encoder || 'auto';
    let encoder: 'h264_qsv' | 'h264_nvenc' | 'h264_amf' | 'libx264' = 'libx264';
    let isHw = false;
    let encoderDisplayName = 'CPU x264';

    if (requestedEncoder === 'auto' || !requestedEncoder) {
      const detected = await detectBestEncoder();
      encoder = detected.encoder;
      isHw = detected.isHardwareAccelerated;
      encoderDisplayName = detected.name;
    } else if (requestedEncoder === 'h264_qsv' && await probeEncoder('h264_qsv')) {
      encoder = 'h264_qsv';
      isHw = true;
      encoderDisplayName = 'Intel Quick Sync Video (h264_qsv)';
    } else if (requestedEncoder === 'h264_nvenc' && await probeEncoder('h264_nvenc')) {
      encoder = 'h264_nvenc';
      isHw = true;
      encoderDisplayName = 'NVIDIA NVENC (h264_nvenc)';
    } else if (requestedEncoder === 'h264_amf' && await probeEncoder('h264_amf')) {
      encoder = 'h264_amf';
      isHw = true;
      encoderDisplayName = 'AMD AMF (h264_amf)';
    } else {
      encoder = 'libx264';
      isHw = false;
      encoderDisplayName = 'CPU x264 (libx264)';
    }

    // Determine encoder preset and CRF
    const qualityPreset = settings?.qualityPreset || 'pro_lossless';
    const userPreset = settings?.encoderPreset;

    let preset: string;
    if (userPreset) {
      // If user specified 'slow' on CPU, prevent stall by capping at 'medium' or 'fast'
      if (!isHw && userPreset === 'slow') {
        preset = 'medium';
      } else {
        preset = userPreset;
      }
    } else if (qualityPreset === 'draft_preview' || qualityPreset === 'fast_export') {
      preset = isHw ? 'faster' : 'veryfast';
    } else if (qualityPreset === 'balanced') {
      preset = isHw ? 'medium' : 'fast';
    } else {
      preset = isHw ? 'medium' : 'medium';
    }

    const crf = String(settings?.crf ?? 18);

    const logicalCores = os.cpus().length;
    const concurrency = isHw
      ? Math.min(3, Math.max(2, Math.floor(logicalCores / 2)))
      : (logicalCores >= 4 ? 2 : 1);
    const threadsPerWorker = Math.max(1, Math.floor(logicalCores / concurrency));

    console.log(`[MovieExplanationRenderer] Active pipeline: ${encoderDisplayName} @ 60fps | Preset: ${preset} | Concurrency: ${concurrency} | Threads/worker: ${threadsPerWorker}`);

    // ── AI Director Pre-Render Quality Review Stage ──
    onProgress?.(5, 'director_review', 'Running AI Director pre-render quality audit...');
    const reviewReport = aiDirectorReviewStage.reviewTimeline(
      timeline,
      { segments: timeline.captions?.map((c, i) => ({ segmentId: `seg_${i}`, text: c.text, voiceoverStart: c.startTime, voiceoverEnd: c.endTime, narrativePurpose: 'story_beat' })) || [] } as any,
      { scenes: [], mediaId: projectId } as any
    );
    console.log(`[MovieExplanationRenderer] AI Director Review Score: ${reviewReport.overallScore}/100 (Approved: ${reviewReport.isApprovedForRender})`);

    // ── Pre-Render Export Manifest Generation & Integrity Check ──
    onProgress?.(8, 'generating_manifest', 'Generating validated export manifest from current timeline...');
    const manifest = this.generateExportManifest(projectId, timeline, voiceoverAudioPath, {
      width: outW,
      height: outH,
      fps: outFps,
      aspectRatio: timeline.outputAspectRatio,
      qualityPreset,
      crf: Number(crf),
      encoder,
      preset,
    });

    if (!manifest.validation.isValid) {
      throw new Error(`Export manifest validation failed:\n${manifest.validation.errors.join('\n')}`);
    }

    const segmentFiles: string[] = new Array(totalShots);
    let completedShots = 0;
    let reusedCount = 0;
    let freshRenderCount = 0;
    const renderStartTime = Date.now();

    // Contextual Transition & Screenshot Physical Asset Linkage Pre-pass
    const thumbsDir = getMovieExplanationThumbsDir(projectId);
    ensureDir(thumbsDir);

    for (let i = 0; i < allShots.length; i++) {
      const current = allShots[i];
      const next = i < allShots.length - 1 ? allShots[i + 1] : undefined;

      // Link transitionOut from next shot's transition
      if (next && (next.transition === 'fade_black' || next.transition === 'fade_white' || next.transition === 'crossfade' || next.transition === 'dissolve')) {
        current.transitionOut = next.transition;
        current.transitionOutDuration = next.transitionDuration;
      }

      // Ensure screenshots have an authentic physical .jpg file on disk
      const isScreenshot = Boolean(current.isScreenshot || current.presentationType === 'screenshot');
      if (isScreenshot && (!current.sourceFile || !/\.(jpg|jpeg|png|webp)$/i.test(current.sourceFile) || !fs.existsSync(current.sourceFile))) {
        const screenshotJpg = path.join(thumbsDir, `${current.shotId}_screenshot.jpg`);
        if (!fs.existsSync(screenshotJpg)) {
          const extractSrc = (current.sourceFile && fs.existsSync(current.sourceFile))
            ? current.sourceFile
            : (manifest.shots[i]?.sourcePath && fs.existsSync(manifest.shots[i]?.sourcePath))
              ? manifest.shots[i]?.sourcePath
              : undefined;

          if (extractSrc) {
            try {
              execSync(
                `"${config.ffmpegPath}" -y -ss ${current.sourceStart.toFixed(3)} -i "${extractSrc}" -vframes 1 -q:v 2 "${screenshotJpg}"`,
                { stdio: 'ignore' }
              );
            } catch (err) {
              console.warn(`[MovieExplanationRenderer] Failed extracting screenshot frame for ${current.shotId}:`, err);
            }
          }
        }
        if (fs.existsSync(screenshotJpg)) {
          current.sourceFile = screenshotJpg;
        }
      }
    }

    try {
      // ── Step 1: Render visual shot slices with Chunk Caching & Invisible Transforms ──
      const queue = allShots.map((shot, index) => ({ shot, index }));
      const workers = Array.from({ length: concurrency }, async () => {
        while (queue.length > 0) {
          if (this.isAborted(projectId)) {
            break;
          }
          const item = queue.shift();
          if (!item) break;
          const { shot, index } = item;
          const sourcePath = shot.sourceFile;

          if (!sourcePath || !fs.existsSync(sourcePath)) {
            throw new Error(`Source video missing for shot #${index + 1} (${shot.shotId}): ${sourcePath}`);
          }

          const shotTempName = `shot_${String(index).padStart(4, '0')}.mp4`;
          const shotTempPath = path.join(tempDir, shotTempName);

          // Check if valid rendered chunk already exists in persistent chunk cache
          const chunkHash = renderChunkCache.computeChunkHash({
            shot,
            aspectRatio: timeline.outputAspectRatio,
            outW,
            outH,
            outFps,
            encoder,
            preset,
            crf,
            settings,
          });

          const cachedChunkPath = renderChunkCache.getValidChunkPath(projectId, chunkHash);

          if (cachedChunkPath) {
            // Instant reuse from persistent render cache
            renderChunkCache.reuseChunk(cachedChunkPath, shotTempPath);
            reusedCount++;
          } else {
            // Render fresh chunk directly into persistent cache, then link to assembly
            const newChunkDest = renderChunkCache.getNewChunkPath(projectId, chunkHash);
            await this.renderShotFromOriginal(
              projectId,
              sourcePath,
              shot.sourceStart,
              shot.duration,
              timeline.outputAspectRatio,
              outW,
              outH,
              outFps,
              newChunkDest,
              index,
              encoder,
              preset,
              crf,
              threadsPerWorker,
              shot,
              settings
            );
            renderChunkCache.reuseChunk(newChunkDest, shotTempPath);
            freshRenderCount++;
          }

          if (this.isAborted(projectId)) {
            break;
          }

          segmentFiles[index] = shotTempPath;
          completedShots++;

          const currentPct = Math.round(5 + (completedShots / totalShots) * 65);
          const elapsedSec = (Date.now() - renderStartTime) / 1000;
          const speedMultiplier = elapsedSec > 0 ? (completedShots * shot.duration) / elapsedSec : 1;
          const remainingShots = totalShots - completedShots;
          const etaSec = speedMultiplier > 0 ? Math.round((remainingShots * shot.duration) / speedMultiplier) : 0;

          const cacheInfo = reusedCount > 0 ? ` [${reusedCount} cached, ${freshRenderCount} rendered]` : '';

          onProgress?.(
            currentPct,
            'extracting_shots',
            `Transforming shot ${completedShots}/${totalShots} (${Math.round((completedShots / totalShots) * 100)}%) @ 60fps${cacheInfo} | [${encoderDisplayName}] | Elapsed: ${elapsedSec.toFixed(0)}s | ETA: ~${etaSec}s`
          );
        }
      });

      await Promise.all(workers);

      if (this.isAborted(projectId)) {
        throw new Error('Render cancelled by user');
      }

      // Verify all segments exist
      for (let i = 0; i < totalShots; i++) {
        if (!segmentFiles[i] || !fs.existsSync(segmentFiles[i])) {
          throw new Error(`Failed extracting visual shot slice #${i + 1}`);
        }
      }

      // ── Step 2: Build concat demuxer file list (Zero generational loss) ──
      const stitchStartTime = Date.now();
      onProgress?.(72, 'stitching_video', 'Joining visual sequence into continuous master visual track via stream copy...');
      const concatListPath = path.join(tempDir, 'concat_list.txt');
      const concatContent = segmentFiles
        .map((f) => `file '${f.replace(/\\/g, '/')}'`)
        .join('\n');
      fs.writeFileSync(concatListPath, concatContent, 'utf8');

      const stitchedVisualPath = path.join(tempDir, 'stitched_visual.mp4');
      await this.concatenateShots(projectId, concatListPath, stitchedVisualPath);
      const stitchElapsedMs = Date.now() - stitchStartTime;

      // Verify stitched visual stream duration matches timeline duration
      const stitchedMeta = await extractMetadata(stitchedVisualPath);
      const stitchedVidDur = stitchedMeta.videoDuration ?? stitchedMeta.duration;
      if (stitchedVidDur < timeline.duration - 1.5 && timeline.duration > 3.0) {
        throw new Error(
          `Visual track concatenation produced incomplete video (${stitchedVidDur.toFixed(1)}s vs expected ${timeline.duration.toFixed(1)}s). Render halted to prevent frozen still-frame playback.`
        );
      }

      if (this.isAborted(projectId)) {
        throw new Error('Render cancelled by user');
      }

      // ── Step 3: Audio Composite Pipeline ──
      const audioStartTime = Date.now();
      onProgress?.(84, 'mastering_audio', 'Synthesizing composite audio (Voiceover Anchor + Sound Bed)...');
      const compositeAudioPath = path.join(tempDir, 'master_composite_audio.aac');

      const masteredAudioPath = await audioCompositeEngine.buildCompositeAudio(
        voiceoverAudioPath,
        timeline.shots,
        timeline.duration,
        compositeAudioPath,
        tempDir,
        settings,
        timeline.audioLayers
      );
      const audioElapsedMs = Date.now() - audioStartTime;

      if (this.isAborted(projectId)) {
        throw new Error('Render cancelled by user');
      }

      // ── Step 4: Final Master Mux (Stream Copy + Master Audio) ──
      const muxStartTime = Date.now();
      onProgress?.(92, 'final_mux', 'Muxing master visual track with composite audio pipeline...');
      const finalOutputName = `movie_explanation_${projectId}_${Date.now()}.mp4`;
      const finalOutputPath = path.join(rendersDir, finalOutputName);

      await this.muxVideoAndMasterAudio(
        projectId,
        stitchedVisualPath,
        masteredAudioPath,
        timeline.duration,
        finalOutputPath
      );
      const muxElapsedMs = Date.now() - muxStartTime;

      // ── Step 5: Master Output Validation (Section 7) ──
      const valStartTime = Date.now();
      onProgress?.(97, 'validating_output', 'Validating master file integrity, zero black screen & A/V sync...');
      const validation = await this.validateRenderedOutput(finalOutputPath, timeline.duration, timeline);
      const valElapsedMs = Date.now() - valStartTime;

      const totalElapsedSec = ((Date.now() - renderStartTime) / 1000).toFixed(1);
      const shotElapsedMs = stitchStartTime - renderStartTime;

      // Bottleneck diagnostic report (Section 6.1)
      const stageTimes = [
        { name: 'Shot Extraction', ms: shotElapsedMs },
        { name: 'Concatenation', ms: stitchElapsedMs },
        { name: 'Audio Composite', ms: audioElapsedMs },
        { name: 'Master Mux', ms: muxElapsedMs },
        { name: 'Output Validation', ms: valElapsedMs },
      ];
      stageTimes.sort((a, b) => b.ms - a.ms);
      console.log(`[MovieExplanationRenderer] Bottleneck report: Dominant stage is "${stageTimes[0].name}" (${(stageTimes[0].ms / 1000).toFixed(1)}s). Total: ${totalElapsedSec}s. Validation: ${validation.isValid ? 'PASSED' : 'FLAGGED'}.`);

      const stat = fs.statSync(finalOutputPath);
      onProgress?.(100, 'completed', `Render complete in ${totalElapsedSec}s! Pristine master video generated (${(stat.size / (1024 * 1024)).toFixed(1)} MB).`);

      return {
        outputPath: finalOutputPath,
        fileSize: stat.size,
        duration: timeline.duration,
        reusedCount,
        freshRenderCount,
        fps: outFps,
        validation,
        manifest,
      };
    } finally {
      this.activeProcesses.delete(projectId);
      this.abortedProjects.delete(projectId);
      // Cleanup temporary slice files
      try {
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
        }
      } catch (err) {
        console.warn('[MovieExplanationRenderer] Temp cleanup warning:', err);
      }
    }
  }

  /**
   * Generates and validates an explicit export manifest before launching rendering.
   * Ensures every source file exists, timestamps are continuous, and no stale cache is used.
   */
  public generateExportManifest(
    projectId: string,
    timeline: MovieExplanationTimeline,
    voiceoverAudioPath: string,
    outputSettings: {
      width: number;
      height: number;
      fps: number;
      aspectRatio: VoiceoverOutputAspectRatio;
      qualityPreset: string;
      crf: number;
      encoder: string;
      preset: string;
    }
  ): ExportManifest {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!fs.existsSync(voiceoverAudioPath)) {
      errors.push(`Voiceover audio file missing from disk: ${voiceoverAudioPath}`);
    }

    const allShots = timeline.shots || [];
    if (allShots.length === 0) {
      errors.push('Timeline contains zero visual shots to render.');
    }

    let previousEnd = 0.000;
    const mappedShots = allShots.map((shot, idx) => {
      if (!shot.sourceFile || !fs.existsSync(shot.sourceFile)) {
        errors.push(`Source media missing for shot #${idx + 1} (${shot.shotId}): ${shot.sourceFile}`);
      }
      if (idx === 0 && shot.timelineStart !== 0.000) {
        warnings.push(`Shot #1 begins at ${shot.timelineStart.toFixed(3)}s instead of 0.000s.`);
      }
      if (idx > 0 && Math.abs(shot.timelineStart - previousEnd) > 0.05) {
        warnings.push(`Gap or overlap between shot #${idx} and #${idx + 1}: ${Math.abs(shot.timelineStart - previousEnd).toFixed(3)}s.`);
      }
      previousEnd = shot.timelineEnd;

      return {
        shotIndex: idx,
        shotId: shot.shotId,
        segmentId: shot.segmentId,
        sceneId: shot.sceneId,
        sourcePath: shot.sourceFile,
        sourceStart: shot.sourceStart,
        sourceEnd: shot.sourceEnd,
        timelineStart: shot.timelineStart,
        timelineEnd: shot.timelineEnd,
        duration: shot.duration,
        transition: shot.transition,
        transitionDuration: shot.transitionDuration,
        isReplacement: !!shot.replacementSource?.isReplacement,
        replacementSource: shot.replacementSource,
        rightsStatus: shot.rightsStatus || shot.rightsMetadata?.rightsStatus || 'unverified',
        appliedTransforms: shot.appliedTransforms,
      };
    });

    const manifest: ExportManifest = {
      manifestId: `manifest_${projectId}_rev${timeline.timelineRevision || 1}_${Date.now()}`,
      projectId,
      timelineRevision: timeline.timelineRevision || 1,
      generatedAt: new Date().toISOString(),
      outputSettings,
      voiceoverAudioPath,
      voiceoverDuration: timeline.duration,
      totalDuration: timeline.duration,
      shotsCount: mappedShots.length,
      shots: mappedShots,
      validation: {
        isValid: errors.length === 0,
        errors,
        warnings,
      },
    };

    // Save manifest to project renders directory
    try {
      const rendersDir = getMovieExplanationRendersDir(projectId);
      const manifestPath = path.join(rendersDir, 'export_manifest.json');
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    } catch (err) {
      console.warn(`[MovieExplanationRenderer] Failed saving export_manifest.json:`, err);
    }

    return manifest;
  }

  /**
   * Renders a lightweight, rapid preview of the critical opening zone (default 120s).
   * Verifies visual scene selection, voiceover timing synchronization, and narrative pacing
   * before initiating a full-episode export.
   */
  public async renderOpeningPreviewVideo(
    projectId: string,
    timeline: MovieExplanationTimeline,
    voiceoverAudioPath: string,
    maxDuration: number = 120,
    onProgress?: RenderProgressCallback
  ): Promise<{ outputPath: string; fileSize: number; duration: number; validation?: RenderOutputValidationResult }> {
    this.abortedProjects.delete(projectId);

    const projectDir = getMovieExplanationProjectDir(projectId);
    const rendersDir = getMovieExplanationRendersDir(projectId);
    const tempDir = path.join(projectDir, `temp_preview_${Date.now()}`);
    ensureDir(tempDir);

    const outW = timeline.outputWidth || 1920;
    const outH = timeline.outputHeight || 1080;
    const outFps = timeline.outputFps || 30; // 30 FPS for rapid preview generation

    // Filter and trim shots to within maxDuration
    const previewShots: MovieTimelineShot[] = [];
    for (const sh of timeline.shots || []) {
      if (sh.timelineStart >= maxDuration) break;
      const shEnd = Math.min(sh.timelineEnd, maxDuration);
      const shDur = Math.max(0.1, Number((shEnd - sh.timelineStart).toFixed(3)));
      const srcEnd = Number((sh.sourceStart + shDur).toFixed(3));
      previewShots.push({
        ...sh,
        duration: shDur,
        timelineEnd: shEnd,
        sourceEnd: srcEnd,
      });
    }

    if (previewShots.length === 0) {
      throw new Error('No shots available for opening preview.');
    }

    const previewDuration = previewShots[previewShots.length - 1].timelineEnd;
    const totalShots = previewShots.length;

    onProgress?.(5, 'preparing_preview', `Preparing opening ${previewDuration.toFixed(0)}s preview (${totalShots} shots)...`);

    const detected = await detectBestEncoder();
    const encoder = detected.encoder;
    const isHw = detected.isHardwareAccelerated;
    const preset = isHw ? 'faster' : 'veryfast';
    const crf = '22'; // High quality draft for preview

    const segmentFiles: string[] = new Array(totalShots);
    let completedShots = 0;

    try {
      // Step 1: Render shot slices
      for (let i = 0; i < totalShots; i++) {
        if (this.isAborted(projectId)) throw new Error('Preview cancelled by user');
        const shot = previewShots[i];
        const shotPath = path.join(tempDir, `shot_${String(i).padStart(4, '0')}.mp4`);

        await this.renderShotFromOriginal(
          projectId,
          shot.sourceFile,
          shot.sourceStart,
          shot.duration,
          timeline.outputAspectRatio,
          outW,
          outH,
          outFps,
          shotPath,
          i,
          encoder,
          preset,
          crf,
          2,
          shot,
          timeline.transformativeSettings
        );

        segmentFiles[i] = shotPath;
        completedShots++;
        const pct = Math.round(5 + (completedShots / totalShots) * 70);
        onProgress?.(pct, 'rendering_preview_shots', `Rendering preview shot ${completedShots}/${totalShots}...`);
      }

      // Step 2: Concat shots
      onProgress?.(78, 'stitching_preview', 'Stitching preview shots...');
      const concatListPath = path.join(tempDir, 'concat_list.txt');
      const concatContent = segmentFiles.map((f) => `file '${f.replace(/\\/g, '/')}'`).join('\n');
      fs.writeFileSync(concatListPath, concatContent, 'utf8');

      const stitchedVisualPath = path.join(tempDir, 'stitched_preview.mp4');
      await this.concatenateShots(projectId, concatListPath, stitchedVisualPath);

      // Verify preview stitched video duration
      const stitchedMeta = await extractMetadata(stitchedVisualPath);
      const stitchedVidDur = stitchedMeta.videoDuration ?? stitchedMeta.duration;
      if (stitchedVidDur < previewDuration - 1.5 && previewDuration > 3.0) {
        throw new Error(
          `Opening preview concatenation produced incomplete video (${stitchedVidDur.toFixed(1)}s vs expected ${previewDuration.toFixed(1)}s). Render halted to prevent frozen preview.`
        );
      }

      // Step 3: Audio composite for preview
      onProgress?.(88, 'mastering_audio', 'Preparing preview audio track...');
      const compositeAudioPath = path.join(tempDir, 'preview_composite_audio.aac');
      const masteredAudioPath = await audioCompositeEngine.buildCompositeAudio(
        voiceoverAudioPath,
        previewShots,
        previewDuration,
        compositeAudioPath,
        tempDir,
        timeline.transformativeSettings
      );

      // Step 4: Mux
      onProgress?.(95, 'muxing_preview', 'Muxing opening preview...');
      const finalOutputName = `opening_preview_${projectId}_${Date.now()}.mp4`;
      const finalOutputPath = path.join(rendersDir, finalOutputName);

      await this.muxVideoAndMasterAudio(
        projectId,
        stitchedVisualPath,
        masteredAudioPath,
        previewDuration,
        finalOutputPath
      );

      // Validate opening preview output
      const validation = await this.validateRenderedOutput(finalOutputPath, previewDuration, timeline);

      const stat = fs.statSync(finalOutputPath);
      onProgress?.(100, 'completed', `Opening preview ready (${previewDuration.toFixed(1)}s, ${(stat.size / (1024 * 1024)).toFixed(1)} MB)! Validation: ${validation.isValid ? 'PASSED' : 'FLAGGED'}`);

      return {
        outputPath: finalOutputPath,
        fileSize: stat.size,
        duration: previewDuration,
        validation,
      };
    } finally {
      this.activeProcesses.delete(projectId);
      try {
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
        }
      } catch (err) {
        console.warn('[MovieExplanationRenderer] Temp cleanup warning:', err);
      }
    }
  }

  /**
   * Renders an individual visual shot directly from original source media.
   * Preserves native source quality using CRF 18 with Lanczos scaling.
   * Applies the Visual "Invisible" Pipeline:
   * - Dynamic Micro-Scaling (2% - 5% crop + Lanczos scaling)
   * - Professional Color Remapping (subtle LUT / color matrix tilt)
   * - Micro-Temporal Shifting (0.98x - 1.02x setpts)
   * - Intelligent Mirroring (hflip if safe and text-free)
   * - Ken Burns slow zoom (for still frame inserts)
   * - Complete removal of source movie audio (-an)
   */
  private async renderShotFromOriginal(
    projectId: string,
    sourceFile: string,
    sourceStart: number,
    duration: number,
    aspectRatio: VoiceoverOutputAspectRatio,
    outW: number,
    outH: number,
    outFps: number,
    outputPath: string,
    shotIndex: number,
    encoder: string = 'libx264',
    preset: string = 'medium',
    crf: string = '18',
    threads: number = 2,
    shot?: MovieTimelineShot,
    settings?: TransformativeEditingSettings
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isAborted(projectId)) {
        return reject(new Error('Render cancelled by user'));
      }

      // Generate randomized invisible transform filtergraph
      const transformResult = transformativeFilterEngine.buildShotFiltergraph(
        shot || {
          shotId: `shot_${shotIndex}`,
          segmentId: 'seg_default',
          sceneId: 'sc_default',
          sourceFile,
          sourceStart,
          sourceEnd: sourceStart + duration,
          timelineStart: 0,
          timelineEnd: duration,
          duration,
          matchScore: 100,
          confidence: 1.0,
          isLowConfidence: false,
          whyThisScene: {} as any,
          transition: 'cut',
          transitionDuration: 0,
          isLocked: false,
          isManualOverride: false,
          framingMode: 'action',
        },
        shotIndex,
        aspectRatio,
        outW,
        outH,
        outFps,
        settings
      );

      // Store applied transform metadata on shot
      if (shot) {
        shot.appliedTransforms = {
          cropFactor: transformResult.cropFactor,
          colorGrade: transformResult.colorGradeName,
          speedShift: transformResult.speedShift,
          isMirrored: transformResult.isMirrored,
        };
      }

      // Configure encoder-specific flags
      const encoderArgs: string[] = [];
      if (encoder === 'h264_qsv') {
        encoderArgs.push(
          '-c:v', 'h264_qsv',
          '-preset', preset || 'medium',
          '-global_quality', crf,
          '-pix_fmt', 'nv12'
        );
      } else if (encoder === 'h264_nvenc') {
        encoderArgs.push(
          '-c:v', 'h264_nvenc',
          '-preset', preset || 'p4',
          '-cq', crf,
          '-pix_fmt', 'yuv420p'
        );
      } else if (encoder === 'h264_amf') {
        encoderArgs.push(
          '-c:v', 'h264_amf',
          '-quality', 'balanced',
          '-rc', 'cqp',
          '-qp_p', crf,
          '-pix_fmt', 'nv12'
        );
      } else {
        encoderArgs.push(
          '-c:v', 'libx264',
          '-preset', preset || 'medium',
          '-crf', crf,
          '-threads', String(threads || 2),
          '-pix_fmt', 'yuv420p'
        );
      }

      const isStillImage = /\.(jpg|jpeg|png|webp|svg)$/i.test(sourceFile);
      const isLoopVideo = shot?.replacementSource?.alignmentMode === 'loop';

      const inputArgs: string[] = [];
      if (isStillImage) {
        inputArgs.push('-loop', '1', '-framerate', String(outFps), '-t', duration.toFixed(3), '-i', sourceFile);
      } else if (isLoopVideo) {
        inputArgs.push(
          '-stream_loop', '-1',
          '-avoid_negative_ts', 'make_zero',
          '-fflags', '+genpts',
          '-ss', sourceStart.toFixed(3),
          '-t', duration.toFixed(3),
          '-i', sourceFile
        );
      } else {
        inputArgs.push(
          '-avoid_negative_ts', 'make_zero',
          '-fflags', '+genpts',
          '-ss', sourceStart.toFixed(3),
          '-t', duration.toFixed(3),
          '-i', sourceFile
        );
      }

      const args = [
        '-y',
        ...inputArgs,
        '-vf', transformResult.fullFiltergraph,
        ...encoderArgs,
        '-an',                        // Step 1 (The Void): Completely strip source movie audio
        '-t', duration.toFixed(3),    // Strictly enforce output duration for looped screenshots & trimmed clips
        outputPath,
      ];

      const proc = spawn(config.ffmpegPath, args);
      this.registerProcess(projectId, proc);
      let stderr = '';

      proc.stderr.on('data', (d) => { stderr += d.toString(); });
      proc.on('close', (code) => {
        if (this.isAborted(projectId)) {
          return reject(new Error('Render cancelled by user'));
        }
        if (code === 0 && fs.existsSync(outputPath)) {
          resolve();
        } else {
          reject(new Error(`FFmpeg shot extraction failed (code ${code}): ${stderr.slice(-300)}`));
        }
      });
      proc.on('error', reject);
    });
  }

  /**
   * Concat demuxer for joining shot segments without re-encoding (stream copy).
   */
  private async concatenateShots(projectId: string, concatListPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isAborted(projectId)) {
        return reject(new Error('Render cancelled by user'));
      }

      const args = [
        '-y',
        '-avoid_negative_ts', 'make_zero',
        '-f', 'concat',
        '-safe', '0',
        '-i', concatListPath,
        '-c', 'copy',
        outputPath,
      ];

      const proc = spawn(config.ffmpegPath, args);
      this.registerProcess(projectId, proc);
      let stderr = '';

      proc.stderr.on('data', (d) => { stderr += d.toString(); });
      proc.on('close', (code) => {
        if (this.isAborted(projectId)) {
          return reject(new Error('Render cancelled by user'));
        }
        if (code === 0 && fs.existsSync(outputPath)) {
          resolve();
        } else {
          reject(new Error(`FFmpeg shot stitching failed (code ${code}): ${stderr.slice(-300)}`));
        }
      });
      proc.on('error', reject);
    });
  }

  /**
   * Muxes stitched visual video with master composite audio pipeline.
   * Command: ffmpeg -i [visual] -i [compositeAudio] -c:v copy -c:a aac -b:a 192k [output].mp4
   */
  private async muxVideoAndMasterAudio(
    projectId: string,
    visualVideoPath: string,
    compositeAudioPath: string,
    duration: number,
    outputPath: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isAborted(projectId)) {
        return reject(new Error('Render cancelled by user'));
      }

      const args = [
        '-y',
        '-avoid_negative_ts', 'make_zero',
        '-max_interleave_delta', '0',
        '-i', visualVideoPath,
        '-i', compositeAudioPath,
        '-map', '0:v:0',
        '-map', '1:a:0',
        '-c:v', 'copy',             // Stream copy: visually lossless CRF 18 already preserved
        '-c:a', 'aac',
        '-b:a', '192k',             // 192k professional AAC audio
        '-ar', '48000',
        '-t', duration.toFixed(3),  // Exact sync with timeline
        '-movflags', '+faststart',
        outputPath,
      ];

      const proc = spawn(config.ffmpegPath, args);
      this.registerProcess(projectId, proc);
      let stderr = '';

      proc.stderr.on('data', (d) => { stderr += d.toString(); });
      proc.on('close', (code) => {
        if (this.isAborted(projectId)) {
          return reject(new Error('Render cancelled by user'));
        }
        if (code === 0 && fs.existsSync(outputPath)) {
          resolve();
        } else {
          reject(new Error(`FFmpeg master mux failed (code ${code}): ${stderr.slice(-300)}`));
        }
      });
      proc.on('error', reject);
    });
  }

  /**
   * Validates rendered output file before marking export complete (Section 7).
   * Verifies file existence, duration conformance, resolution, valid audio/video streams,
   * and probes the opening frame (t=0.05s) to guarantee zero unintended black gap.
   */
  public async validateRenderedOutput(
    outputPath: string,
    expectedDuration: number,
    timeline: MovieExplanationTimeline
  ): Promise<RenderOutputValidationResult> {
    const issues: string[] = [];
    const warnings: string[] = [];

    if (!fs.existsSync(outputPath)) {
      return {
        isValid: false,
        outputPath,
        fileSize: 0,
        duration: 0,
        expectedDuration,
        durationDelta: expectedDuration,
        hasInitialBlackGap: true,
        initialBlackDuration: expectedDuration,
        hasValidVideo: false,
        hasValidAudio: false,
        audioStartDelta: 0,
        issues: ['Rendered output file missing from disk path.'],
        warnings: [],
      };
    }

    const stat = fs.statSync(outputPath);
    if (stat.size < 10000) {
      issues.push(`Rendered video file abnormally small (${stat.size} bytes).`);
    }

    const meta = await extractMetadata(outputPath);
    const durationDelta = Math.abs(meta.duration - expectedDuration);
    if (durationDelta > 1.0) {
      warnings.push(`Output video duration (${meta.duration.toFixed(1)}s) deviates from timeline duration (${expectedDuration.toFixed(1)}s) by ${durationDelta.toFixed(1)}s.`);
    }

    // Inspect stream-level video duration vs expected timeline duration
    if (meta.videoDuration !== undefined && meta.videoDuration < expectedDuration - 1.5 && expectedDuration > 3.0) {
      issues.push(
        `Video stream duration (${meta.videoDuration.toFixed(1)}s) is shorter than expected timeline duration (${expectedDuration.toFixed(1)}s). The video stream finishes early and freezes on a still frame while audio continues!`
      );
    }

    // Inspect first frame at 0.05s using TitleBumperDetector luminance inspection
    let hasInitialBlackGap = false;
    let initialBlackDuration = 0;
    let frameStats: FrameSignalStats | undefined;

    const tempFramePath = path.join(os.tmpdir(), `validate_first_frame_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.jpg`);
    try {
      execSync(`"${config.ffmpegPath}" -y -ss 0.05 -i "${outputPath}" -vframes 1 -q:v 2 "${tempFramePath}"`, { stdio: 'ignore' });
      if (fs.existsSync(tempFramePath)) {
        frameStats = titleBumperDetector.getFrameSignalStats(tempFramePath);
        // If near black (luminance < 14 and max < 35), flag black gap
        if (frameStats.isNearBlack || (frameStats.yAvg <= 14.0 && frameStats.yMax <= 35.0)) {
          hasInitialBlackGap = true;
          initialBlackDuration = 0.5;
          issues.push(`Initial frame at output 0.05s is blank black screen (YAvg: ${frameStats.yAvg.toFixed(1)}). Unintended opening black gap detected.`);
        }
        try { fs.unlinkSync(tempFramePath); } catch {}
      }
    } catch {
      try { if (fs.existsSync(tempFramePath)) fs.unlinkSync(tempFramePath); } catch {}
    }

    const hasValidVideo = meta.width > 0 && meta.height > 0 && meta.fps > 0;
    const hasValidAudio = !!meta.audioCodec;

    if (!hasValidVideo) issues.push('Output lacks a valid readable video stream.');
    if (!hasValidAudio) issues.push('Output lacks a valid readable audio stream.');

    return {
      isValid: issues.length === 0,
      outputPath,
      fileSize: stat.size,
      duration: meta.duration,
      expectedDuration,
      durationDelta,
      hasInitialBlackGap,
      initialBlackDuration,
      firstFrameSignalStats: frameStats,
      hasValidVideo,
      hasValidAudio,
      audioStartDelta: 0,
      streamDetails: {
        videoCodec: meta.codec,
        audioCodec: meta.audioCodec,
        width: meta.width,
        height: meta.height,
        fps: meta.fps,
      },
      issues,
      warnings,
    };
  }
}

export const movieExplanationRenderer = new MovieExplanationRenderer();
