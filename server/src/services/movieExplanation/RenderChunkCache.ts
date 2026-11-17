// ============================================================
// Render Chunk Cache — Reusable Visual Slices & Incremental Renderer
// Avoids re-rendering the entire 43-min video after replacing or trimming 1 clip.
// Keyed by exact source range, resolution, frame rate, encoder, & transforms.
// ============================================================

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getMovieExplanationProjectDir, ensureDir } from '../storage.js';
import type { MovieTimelineShot, TransformativeEditingSettings, VoiceoverOutputAspectRatio } from '../../../../shared/types.js';

export interface ChunkKeyParams {
  shot: MovieTimelineShot;
  aspectRatio: VoiceoverOutputAspectRatio;
  outW: number;
  outH: number;
  outFps: number;
  encoder: string;
  preset: string;
  crf: string | number;
  settings?: TransformativeEditingSettings;
}

export class RenderChunkCache {
  /**
   * Returns directory where persistent chunk mp4 files are stored for a project.
   */
  public getRenderCacheDir(projectId: string): string {
    const dir = path.join(getMovieExplanationProjectDir(projectId), 'render_cache');
    ensureDir(dir);
    return dir;
  }

  /**
   * Computes a deterministic, collision-free hash for a shot's visual parameters.
   */
  public computeChunkHash(params: ChunkKeyParams): string {
    const { shot, aspectRatio, outW, outH, outFps, encoder, preset, crf, settings } = params;

    const parts = [
      shot.sourceFile,
      shot.sourceStart.toFixed(3),
      shot.sourceEnd.toFixed(3),
      shot.duration.toFixed(3),
      aspectRatio,
      `${outW}x${outH}@${outFps}`,
      encoder,
      preset,
      crf,
      shot.framingMode || settings?.framingMode || 'action',
      String(shot.isFlipped ?? settings?.horizontalFlip ?? false),
      String(shot.speedMultiplier ?? settings?.playbackSpeed ?? 1.0),
      String(shot.zoomLevel ?? settings?.zoomLevel ?? 1.0),
      JSON.stringify(shot.appliedTransforms || {}),
    ];

    return crypto.createHash('sha256').update(parts.join('::')).digest('hex').slice(0, 24);
  }

  /**
   * Checks if a valid, non-empty rendered chunk file exists on disk.
   */
  public getValidChunkPath(projectId: string, chunkHash: string): string | null {
    const dir = this.getRenderCacheDir(projectId);
    const chunkPath = path.join(dir, `chunk_${chunkHash}.mp4`);

    if (fs.existsSync(chunkPath)) {
      try {
        const stat = fs.statSync(chunkPath);
        if (stat.size > 1024) { // Valid MP4 must have substantial header + video frames
          return chunkPath;
        }
      } catch {}
    }

    return null;
  }

  /**
   * Returns destination path for rendering a new chunk.
   */
  public getNewChunkPath(projectId: string, chunkHash: string): string {
    const dir = this.getRenderCacheDir(projectId);
    return path.join(dir, `chunk_${chunkHash}.mp4`);
  }

  /**
   * Safely links or copies a cached chunk into the temporary render assembly directory.
   */
  public reuseChunk(cachedChunkPath: string, targetAssemblyPath: string): void {
    ensureDir(path.dirname(targetAssemblyPath));
    try {
      // Hardlink if supported on filesystem for instant 0ms zero-byte copy
      fs.linkSync(cachedChunkPath, targetAssemblyPath);
    } catch {
      // Fallback to copy if cross-device or permission restricted
      fs.copyFileSync(cachedChunkPath, targetAssemblyPath);
    }
  }

  /**
   * Purges cache for a project (e.g. when changing master resolution or encoder).
   */
  public clearProjectRenderCache(projectId: string): void {
    const dir = this.getRenderCacheDir(projectId);
    if (fs.existsSync(dir)) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {}
    }
  }
}

export const renderChunkCache = new RenderChunkCache();
