// ============================================================
// Movie Analyzer Store — Persistent ACID Store for Movie Analyzer Projects
// Persists projects to data/movie_analyzer/{id}/project.json
// ============================================================

import fs from 'fs';
import path from 'path';
import type { MovieAnalyzerProject } from '../../../../shared/types.js';
import { getMovieAnalyzerProjectDir, ensureDir } from '../storage.js';

export class MovieAnalyzerStore {
  private cache: Map<string, MovieAnalyzerProject> = new Map();

  public getProjectDir(projectId: string): string {
    return getMovieAnalyzerProjectDir(projectId);
  }

  private getProjectPath(projectId: string): string {
    return path.join(this.getProjectDir(projectId), 'project.json');
  }

  public createProject(projectId: string, name?: string): MovieAnalyzerProject {
    const dir = this.getProjectDir(projectId);
    ensureDir(dir);

    const initial: MovieAnalyzerProject = {
      id: projectId,
      name: name || `Movie Analyzer Project ${new Date().toLocaleDateString()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      stage: 1,
      status: 'setup',
      scripts: {
        targetDurationMinutes: 9,
        selectedLanguage: 'english',
      },
      matching: {
        maxClipDuration: 3.0,
        enableMovingScreenshots: true,
        screenshotInterval: 5,
        matchedShots: [],
        totalTimelineDuration: 0,
        pacingRuleViolations: 0,
      },
    };

    this.saveProject(initial);
    return initial;
  }

  public getProject(projectId: string): MovieAnalyzerProject | null {
    if (this.cache.has(projectId)) {
      return this.cache.get(projectId)!;
    }

    const filePath = this.getProjectPath(projectId);
    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const project = JSON.parse(raw) as MovieAnalyzerProject;
      this.cache.set(projectId, project);
      return project;
    } catch (err) {
      console.error(`[MovieAnalyzerStore] Failed to load project ${projectId}:`, err);
      return null;
    }
  }

  public saveProject(project: MovieAnalyzerProject): void {
    const dir = this.getProjectDir(project.id);
    ensureDir(dir);

    project.updatedAt = new Date().toISOString();
    const filePath = this.getProjectPath(project.id);
    const tmpPath = `${filePath}.tmp.${Date.now()}`;

    try {
      fs.writeFileSync(tmpPath, JSON.stringify(project, null, 2), 'utf8');
      try {
        fs.renameSync(tmpPath, filePath);
      } catch (renameErr: any) {
        if (renameErr.code === 'EPERM' || renameErr.code === 'EBUSY') {
          fs.copyFileSync(tmpPath, filePath);
          try { fs.unlinkSync(tmpPath); } catch {}
        } else {
          throw renameErr;
        }
      }
      this.cache.set(project.id, project);
    } catch (err) {
      if (fs.existsSync(tmpPath)) {
        try { fs.unlinkSync(tmpPath); } catch {}
      }
      console.error(`[MovieAnalyzerStore] Failed to save project ${project.id}:`, err);
      throw err;
    }
  }

  public updateProject(
    projectId: string,
    updates: Partial<MovieAnalyzerProject>
  ): MovieAnalyzerProject {
    let existing = this.getProject(projectId);
    if (!existing) {
      existing = this.createProject(projectId);
    }

    const merged: MovieAnalyzerProject = {
      ...existing,
      ...updates,
      scripts: {
        ...existing.scripts,
        ...(updates.scripts || {}),
      } as any,
      matching: {
        ...existing.matching,
        ...(updates.matching || {}),
      } as any,
      updatedAt: new Date().toISOString(),
    };

    this.saveProject(merged);
    return merged;
  }

  public listProjects(): MovieAnalyzerProject[] {
    const rootDir = path.dirname(this.getProjectDir('__placeholder__'));
    if (!fs.existsSync(rootDir)) {
      return [];
    }

    const entries = fs.readdirSync(rootDir, { withFileTypes: true });
    const projects: MovieAnalyzerProject[] = [];

    for (const ent of entries) {
      if (ent.isDirectory()) {
        const p = this.getProject(ent.name);
        if (p) {
          projects.push(p);
        }
      }
    }

    return projects.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  public deleteProject(projectId: string): boolean {
    this.cache.delete(projectId);
    const dir = this.getProjectDir(projectId);
    if (fs.existsSync(dir)) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
        return true;
      } catch (err) {
        console.error(`[MovieAnalyzerStore] Failed to delete project ${projectId}:`, err);
        return false;
      }
    }
    return false;
  }
}

export const movieAnalyzerStore = new MovieAnalyzerStore();
