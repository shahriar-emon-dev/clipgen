// ============================================================
// Analysis Cache Manager — Durable, Reusable Cache for Video & Audio Pipeline
// Prevents re-analyzing multi-gigabyte files on small edits or browser refreshes.
// Keyed by stable content & file fingerprints, with selective invalidation.
// ============================================================

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getMovieExplanationProjectDir, ensureDir } from '../storage.js';
import type {
  EpisodeIntelligenceIndex,
  EpisodeScene,
  StoryMap,
  ExplanationScript,
  TranscriptSegment,
} from '../../../../shared/types.js';

export interface SceneCutsCache {
  fingerprint: string;
  duration: number;
  threshold: number;
  cutPoints: number[];
  cachedAt: string;
}

export interface AudioTranscriptCache {
  fingerprint: string;
  language: string;
  fullText: string;
  segments: TranscriptSegment[];
  duration: number;
  cachedAt: string;
}

export class AnalysisCacheManager {
  /**
   * Computes a fast, durable fingerprint of a media file without hashing the entire multi-gigabyte file.
   * Samples header, middle, and footer bytes alongside exact file size.
   */
  public computeMediaFingerprint(filePath: string): string {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Cannot fingerprint missing file: ${filePath}`);
    }

    const stat = fs.statSync(filePath);
    const size = stat.size;
    const sampleSize = 64 * 1024; // 64KB sample
    const fd = fs.openSync(filePath, 'r');

    try {
      const hasher = crypto.createHash('sha256');
      hasher.update(`size:${size}_name:${path.basename(filePath)}`);

      // 1. Read header
      const headerBuf = Buffer.alloc(Math.min(sampleSize, size));
      fs.readSync(fd, headerBuf, 0, headerBuf.length, 0);
      hasher.update(headerBuf);

      // 2. Read middle if large enough
      if (size > sampleSize * 3) {
        const midPos = Math.floor(size / 2);
        const midBuf = Buffer.alloc(sampleSize);
        fs.readSync(fd, midBuf, 0, sampleSize, midPos);
        hasher.update(midBuf);
      }

      // 3. Read footer
      if (size > sampleSize * 2) {
        const footPos = Math.max(0, size - sampleSize);
        const footBuf = Buffer.alloc(Math.min(sampleSize, size - footPos));
        fs.readSync(fd, footBuf, 0, footBuf.length, footPos);
        hasher.update(footBuf);
      }

      return hasher.digest('hex').slice(0, 24);
    } finally {
      fs.closeSync(fd);
    }
  }

  /**
   * Directory where analysis checkpoints and reusable caches reside for a project.
   */
  public getCacheDir(projectId: string): string {
    const dir = path.join(getMovieExplanationProjectDir(projectId), 'cache');
    ensureDir(dir);
    return dir;
  }

  // ── Scene Cuts Cache ──

  public getCachedSceneCuts(projectId: string, fingerprint: string): number[] | null {
    const file = path.join(this.getCacheDir(projectId), `scene_cuts_${fingerprint}.json`);
    if (!fs.existsSync(file)) return null;

    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8')) as SceneCutsCache;
      if (data.fingerprint === fingerprint && Array.isArray(data.cutPoints)) {
        return data.cutPoints;
      }
    } catch {}
    return null;
  }

  public saveCachedSceneCuts(
    projectId: string,
    fingerprint: string,
    duration: number,
    threshold: number,
    cutPoints: number[]
  ): void {
    const file = path.join(this.getCacheDir(projectId), `scene_cuts_${fingerprint}.json`);
    const payload: SceneCutsCache = {
      fingerprint,
      duration,
      threshold,
      cutPoints,
      cachedAt: new Date().toISOString(),
    };
    this.writeAtomically(file, payload);
  }

  // ── Audio Transcription Cache ──

  public getCachedTranscript(projectId: string, fingerprint: string): AudioTranscriptCache | null {
    const file = path.join(this.getCacheDir(projectId), `transcript_${fingerprint}.json`);
    if (!fs.existsSync(file)) return null;

    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8')) as AudioTranscriptCache;
      if (data.fingerprint === fingerprint && Array.isArray(data.segments)) {
        return data;
      }
    } catch {}
    return null;
  }

  public saveCachedTranscript(
    projectId: string,
    fingerprint: string,
    language: string,
    fullText: string,
    segments: TranscriptSegment[],
    duration: number
  ): void {
    const file = path.join(this.getCacheDir(projectId), `transcript_${fingerprint}.json`);
    const payload: AudioTranscriptCache = {
      fingerprint,
      language,
      fullText,
      segments,
      duration,
      cachedAt: new Date().toISOString(),
    };
    this.writeAtomically(file, payload);
  }

  // ── Enriched Scenes Progress Checkpoint (Per-scene atomic save) ──

  public getScenesProgress(projectId: string, fingerprint: string): EpisodeScene[] | null {
    const file = path.join(this.getCacheDir(projectId), `scenes_progress_${fingerprint}.json`);
    if (!fs.existsSync(file)) return null;

    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (data.fingerprint === fingerprint && Array.isArray(data.scenes)) {
        return data.scenes;
      }
    } catch {}
    return null;
  }

  public saveScenesProgress(projectId: string, fingerprint: string, scenes: EpisodeScene[]): void {
    const file = path.join(this.getCacheDir(projectId), `scenes_progress_${fingerprint}.json`);
    this.writeAtomically(file, {
      fingerprint,
      count: scenes.length,
      scenes,
      updatedAt: new Date().toISOString(),
    });
  }

  // ── Story Map Cache ──

  public getCachedStoryMap(projectId: string, fingerprint: string): StoryMap | null {
    const file = path.join(this.getCacheDir(projectId), `story_map_${fingerprint}.json`);
    if (!fs.existsSync(file)) return null;

    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (data.fingerprint === fingerprint && data.storyMap) {
        return data.storyMap;
      }
    } catch {}
    return null;
  }

  public saveCachedStoryMap(projectId: string, fingerprint: string, storyMap: StoryMap): void {
    const file = path.join(this.getCacheDir(projectId), `story_map_${fingerprint}.json`);
    this.writeAtomically(file, {
      fingerprint,
      storyMap,
      savedAt: new Date().toISOString(),
    });
  }

  // ── Voiceover Script Alignment Cache ──

  public getCachedScriptAlignment(
    projectId: string,
    scriptHash: string,
    voiceoverFingerprint: string
  ): ExplanationScript | null {
    const key = `${scriptHash.slice(0, 12)}_${voiceoverFingerprint.slice(0, 12)}`;
    const file = path.join(this.getCacheDir(projectId), `aligned_script_${key}.json`);
    if (!fs.existsSync(file)) return null;

    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8')) as ExplanationScript;
      if (data.isAlignedToVoiceover && data.segments?.length > 0) {
        return data;
      }
    } catch {}
    return null;
  }

  public saveCachedScriptAlignment(
    projectId: string,
    scriptHash: string,
    voiceoverFingerprint: string,
    script: ExplanationScript
  ): void {
    const key = `${scriptHash.slice(0, 12)}_${voiceoverFingerprint.slice(0, 12)}`;
    const file = path.join(this.getCacheDir(projectId), `aligned_script_${key}.json`);
    this.writeAtomically(file, script);
  }

  // ── Atomic File Write Utility ──

  private writeAtomically(targetPath: string, data: any): void {
    const dir = path.dirname(targetPath);
    ensureDir(dir);
    const tmp = `${targetPath}.tmp.${Date.now()}`;
    try {
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
      fs.renameSync(tmp, targetPath);
    } catch (err) {
      try {
        if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
      } catch {}
      throw err;
    }
  }
}

export const analysisCacheManager = new AnalysisCacheManager();
