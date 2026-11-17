// ============================================================
// Voiceover Project Store — Isolated ACID Persistence Layer
// Persists voiceover video project states to data/voiceover/{id}/state.json
// ============================================================

import fs from 'fs';
import path from 'path';
import type { VoiceoverProjectState } from '../../../../shared/types.js';
import { getVoiceoverProjectDir, ensureDir } from '../storage.js';
import { config } from '../../config/index.js';

export class VoiceoverStore {
  private cache: Map<string, VoiceoverProjectState> = new Map();

  /**
   * Returns project directory for given ID.
   */
  public getProjectDir(projectId: string): string {
    return getVoiceoverProjectDir(projectId);
  }

  /**
   * Path to the state.json for a project.
   */
  private getStatePath(projectId: string): string {
    return path.join(this.getProjectDir(projectId), 'state.json');
  }

  /**
   * Creates a new initial voiceover project state.
   */
  public createProject(projectId: string): VoiceoverProjectState {
    const dir = this.getProjectDir(projectId);
    ensureDir(dir);

    const initial: VoiceoverProjectState = {
      projectId,
      footageIndex: [],
      status: 'setup',
      renderProgress: 0,
      renderStage: 'idle',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.saveProject(initial);
    return initial;
  }

  /**
   * Retrieves a voiceover project state by ID.
   */
  public getProject(projectId: string): VoiceoverProjectState | null {
    if (this.cache.has(projectId)) {
      return this.cache.get(projectId)!;
    }

    const statePath = this.getStatePath(projectId);
    if (!fs.existsSync(statePath)) {
      return null;
    }

    try {
      const raw = fs.readFileSync(statePath, 'utf8');
      const state = JSON.parse(raw) as VoiceoverProjectState;
      this.cache.set(projectId, state);
      return state;
    } catch (err) {
      console.error(`[VoiceoverStore] Error reading state for project ${projectId}:`, err);
      return null;
    }
  }

  /**
   * Persists a project state atomically to disk.
   */
  public saveProject(state: VoiceoverProjectState): void {
    state.updatedAt = new Date().toISOString();
    this.cache.set(state.projectId, state);

    const dir = this.getProjectDir(state.projectId);
    ensureDir(dir);

    const statePath = this.getStatePath(state.projectId);
    const tempPath = `${statePath}.tmp.${Date.now()}`;

    try {
      fs.writeFileSync(tempPath, JSON.stringify(state, null, 2), 'utf8');
      fs.renameSync(tempPath, statePath);
    } catch (err) {
      console.error(`[VoiceoverStore] Failed to write state for ${state.projectId}:`, err);
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
    updates: Partial<VoiceoverProjectState>
  ): VoiceoverProjectState {
    let current = this.getProject(projectId);
    if (!current) {
      current = this.createProject(projectId);
    }

    const merged: VoiceoverProjectState = {
      ...current,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    this.saveProject(merged);
    return merged;
  }

  /**
   * Lists all existing voiceover projects found in voiceoverDir.
   */
  public listProjects(): VoiceoverProjectState[] {
    const baseDir = config.voiceoverDir;
    if (!fs.existsSync(baseDir)) {
      return [];
    }

    const dirs = fs.readdirSync(baseDir, { withFileTypes: true });
    const results: VoiceoverProjectState[] = [];

    for (const d of dirs) {
      if (d.isDirectory()) {
        const state = this.getProject(d.name);
        if (state) {
          results.push(state);
        }
      }
    }

    // Sort newest first
    return results.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  /**
   * Deletes a project from cache and disk.
   */
  public deleteProject(projectId: string): boolean {
    this.cache.delete(projectId);
    const dir = this.getProjectDir(projectId);
    if (fs.existsSync(dir)) {
      try {
        fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
        return true;
      } catch (err) {
        console.warn(`[VoiceoverStore] Failed to delete ${projectId}:`, err);
        return false;
      }
    }
    return false;
  }
}

export const voiceoverStore = new VoiceoverStore();
