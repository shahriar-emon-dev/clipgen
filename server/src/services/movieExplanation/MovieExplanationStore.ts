// ============================================================
// Movie Explanation Project Store — Isolated ACID Persistence Layer
// Persists movie explanation projects to data/movie_explanation/{id}/state.json
// ============================================================

import fs from 'fs';
import path from 'path';
import type { MovieExplanationProjectState } from '../../../../shared/types.js';
import { getMovieExplanationProjectDir, ensureDir } from '../storage.js';
import { config } from '../../config/index.js';
import { movieExplanationRenderer } from './MovieExplanationRenderer.js';

export class MovieExplanationStore {
  private cache: Map<string, MovieExplanationProjectState> = new Map();

  /**
   * Returns project directory for given ID.
   */
  public getProjectDir(projectId: string): string {
    return getMovieExplanationProjectDir(projectId);
  }

  /**
   * Path to the state.json for a project.
   */
  private getStatePath(projectId: string): string {
    return path.join(this.getProjectDir(projectId), 'state.json');
  }

  /**
   * Creates a new initial movie explanation project state.
   */
  public createProject(projectId: string, name?: string): MovieExplanationProjectState {
    const dir = this.getProjectDir(projectId);
    ensureDir(dir);

    const initial: MovieExplanationProjectState = {
      projectId,
      projectName: name || `Movie Explanation Project ${new Date().toLocaleDateString()}`,
      status: 'setup',
      inputMode: 'single_video',
      uploadedClips: [],
      transformativeSettings: {
        enableFairUsePreset: true,
        maxShotDuration: 3.0,
        strictClipDurationMode: true,
        minShotDuration: 1.5,
        horizontalFlip: false,
        playbackSpeed: 1.02,
        zoomLevel: 1.04,
        colorGrading: {
          enabled: true,
          brightness: 0.01,
          contrast: 1.03,
          saturation: 1.05,
          sharpness: 0.5,
          vignette: false,
        },
        audioMixing: {
          sourceMovieVolume: 0.0,
          voiceoverVolume: 1.0,
          bgmVolume: 0.10,
          enableAmbientCinematicBed: true,
          enableCutSoundEffects: true,
          sfxVolume: 0.12,
        },
        invisibleTransforms: {
          enabled: true,
          microScaling: true,
          colorRemapping: true,
          microTemporalShift: true,
          intelligentMirroring: true,
          sixSecondRule: true,
          jumpCutIntegration: true,
        },
        framingMode: 'action',
        captionsEnabled: false,
        qualityPreset: 'pro_lossless',
        crf: 18,
        encoder: 'auto',
        encoderPreset: 'fast',
      },
      pipelineMetrics: {},
      renderProgress: 0,
      renderStage: 'idle',
      timelineRevision: 1,
      exportStatus: 'none',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.saveProject(initial);
    return initial;
  }

  /**
   * Retrieves a movie explanation project state by ID.
   */
  public getProject(projectId: string): MovieExplanationProjectState | null {
    if (this.cache.has(projectId)) {
      const cached = this.cache.get(projectId)!;
      this.hydrateMissingIndices(projectId, cached);
      return cached;
    }

    const statePath = this.getStatePath(projectId);
    if (!fs.existsSync(statePath)) {
      return null;
    }

    try {
      const raw = fs.readFileSync(statePath, 'utf8');
      const state = JSON.parse(raw) as MovieExplanationProjectState;
      this.hydrateMissingIndices(projectId, state);
      this.cache.set(projectId, state);
      return state;
    } catch (err) {
      console.error(`[MovieExplanationStore] Error reading state for project ${projectId}:`, err);
      return null;
    }
  }

  /**
   * Hydrates episodeIndex or timeline from disk if not present in state.json
   */
  private hydrateMissingIndices(projectId: string, state: MovieExplanationProjectState): void {
    if (!state.episodeIndex) {
      const indexFile = path.join(this.getProjectDir(projectId), 'episode_index.json');
      if (fs.existsSync(indexFile)) {
        try {
          const idx = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
          if (idx && idx.scenes && idx.scenes.length > 0) {
            state.episodeIndex = idx;
          }
        } catch {}
      }
    }

    if (!state.timelineRevision) {
      state.timelineRevision = state.timeline?.timelineRevision || 1;
    }

    // Universal non-narrative title card & bumper auto-sanitization across ANY project
    if (state.episodeIndex && state.episodeIndex.scenes && state.episodeIndex.scenes.length > 0) {
      const firstScene = state.episodeIndex.scenes[0];
      const descLower = (firstScene.description || '').toLowerCase();
      const isTitleSlate = Boolean(firstScene.isTitleOrBumper) ||
        descLower.includes('definition') ||
        descLower.includes('title') ||
        descLower.includes('slate') ||
        descLower.includes('black screen');

      if (isTitleSlate) {
        firstScene.isTitleOrBumper = true;
        firstScene.isExcludedFromNarration = true;
        firstScene.narrativePurpose = 'title_or_bumper';
        firstScene.importance = 'unnecessary';
        if (state.episodeIndex.narrativeStartTime === undefined || state.episodeIndex.narrativeStartTime < firstScene.endTime) {
          state.episodeIndex.narrativeStartTime = firstScene.endTime;
        }
      }
    }

    if (state.timeline && state.timeline.shots && state.episodeIndex?.narrativeStartTime) {
      const narrativeStart = state.episodeIndex.narrativeStartTime;
      for (const shot of state.timeline.shots) {
        if (shot.sourceStart < narrativeStart) {
          shot.sourceStart = narrativeStart;
          if (shot.sourceEnd <= shot.sourceStart) {
            shot.sourceEnd = shot.sourceStart + shot.duration;
          }
        }
      }
    }

    if (!state.exportStatus) {
      state.exportStatus = state.renderedVideoPath && fs.existsSync(state.renderedVideoPath)
        ? 'up_to_date'
        : 'none';
    }
  }

  /**
   * Persists a project state atomically to disk.
   */
  public saveProject(state: MovieExplanationProjectState): void {
    state.updatedAt = new Date().toISOString();
    this.cache.set(state.projectId, state);

    const dir = this.getProjectDir(state.projectId);
    ensureDir(dir);

    const statePath = this.getStatePath(state.projectId);
    const tempPath = `${statePath}.tmp.${Date.now()}`;

    try {
      fs.writeFileSync(tempPath, JSON.stringify(state, null, 2), 'utf8');
      try {
        fs.renameSync(tempPath, statePath);
      } catch (renameErr: any) {
        if (renameErr.code === 'EPERM' || renameErr.code === 'EBUSY') {
          fs.copyFileSync(tempPath, statePath);
          try { fs.unlinkSync(tempPath); } catch {}
        } else {
          throw renameErr;
        }
      }
    } catch (err) {
      console.error(`[MovieExplanationStore] Failed to write state for ${state.projectId}:`, err);
      try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      } catch {}
      throw err;
    }
  }

  /**
   * Updates fields of an existing project and saves to disk.
   */
  public updateProject(
    projectId: string,
    updates: Partial<MovieExplanationProjectState>
  ): MovieExplanationProjectState {
    const current = this.getProject(projectId);
    if (!current) {
      throw new Error(`Project ${projectId} not found`);
    }

    const merged: MovieExplanationProjectState = {
      ...current,
      ...updates,
      projectId, // Immutable
      updatedAt: new Date().toISOString(),
    };

    this.saveProject(merged);
    return merged;
  }

  /**
   * Deletes a project and its workspace directory.
   */
  public deleteProject(projectId: string): boolean {
    this.cache.delete(projectId);
    movieExplanationRenderer.abortRender(projectId);

    const dir = this.getProjectDir(projectId);
    if (!fs.existsSync(dir)) {
      return true;
    }

    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      return true;
    } catch (err: any) {
      // Windows lock mitigation: if files are held by players or processes,
      // move folder to trash so it immediately disappears from active projects.
      try {
        const trashDir = path.join(path.dirname(dir), `.trash_${projectId}_${Date.now()}`);
        fs.renameSync(dir, trashDir);
        setTimeout(() => {
          try {
            fs.rmSync(trashDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 });
          } catch {}
        }, 1500);
        return true;
      } catch {
        // Fallback: delete state.json so it is no longer returned as a valid project
        try {
          const statePath = this.getStatePath(projectId);
          if (fs.existsSync(statePath)) fs.unlinkSync(statePath);
        } catch {}
        console.warn(`[MovieExplanationStore] Project ${projectId} marked deleted (directory partially locked on Windows)`);
        return true;
      }
    }
  }

  /**
   * Lists all existing movie explanation projects.
   */
  public listProjects(): MovieExplanationProjectState[] {
    const baseDir = config.movieExplanationDir;
    if (!fs.existsSync(baseDir)) return [];

    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    const projects: MovieExplanationProjectState[] = [];

    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.') && !entry.name.startsWith('_')) {
        const isTestPrefix = entry.name.startsWith('test_') ||
          entry.name.startsWith('Project test_') ||
          entry.name === 'Failure Recovery Test' ||
          entry.name === 'Rapid Edit Test' ||
          entry.name === 'Stale Test';

        const state = this.getProject(entry.name);
        if (state) {
          const hasRealUserMedia = !!state.originalVideo?.filePath &&
            fs.existsSync(state.originalVideo.filePath) &&
            !state.originalVideo.filePath.includes('mock') &&
            !state.originalVideo.filePath.includes('test_media');

          if (isTestPrefix && !hasRealUserMedia) {
            continue;
          }

          projects.push(state);
        }
      }
    }

    // Sort newest first
    return projects.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }
}

export const movieExplanationStore = new MovieExplanationStore();
