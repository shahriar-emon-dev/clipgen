// ============================================================
// Analysis Job Manager — Durable, Resumable Job State & Checkpoints
// Persists analysis state across browser refreshes, network drops, & app restarts.
// ============================================================

import fs from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { getMovieExplanationProjectDir, ensureDir } from '../storage.js';
import type { AnalysisJobState } from '../../../../shared/types.js';

export class AnalysisJobManager {
  private activeJobs: Map<string, AnalysisJobState> = new Map();
  private abortControllers: Map<string, AbortController> = new Map();

  private getJobPath(projectId: string): string {
    const dir = getMovieExplanationProjectDir(projectId);
    ensureDir(dir);
    return path.join(dir, 'analysis_job.json');
  }

  /**
   * Retrieves current job status from memory or durable disk state.
   */
  public getJob(projectId: string): AnalysisJobState | null {
    if (this.activeJobs.has(projectId)) {
      return this.activeJobs.get(projectId)!;
    }

    const jobPath = this.getJobPath(projectId);
    if (fs.existsSync(jobPath)) {
      try {
        const state = JSON.parse(fs.readFileSync(jobPath, 'utf8')) as AnalysisJobState;
        this.activeJobs.set(projectId, state);
        return state;
      } catch {}
    }

    return null;
  }

  /**
   * Creates or resumes an analysis job. Idempotent: if a running job already exists, returns it.
   */
  public startOrResumeJob(projectId: string, sourceFingerprint: string): { job: AnalysisJobState; isNew: boolean } {
    const existing = this.getJob(projectId);

    // If an identical job is currently running, return it (prevent duplicate spawn)
    if (existing && existing.status === 'running') {
      return { job: existing, isNew: false };
    }

    // Check if previous work exists for this fingerprint that can be resumed
    const completedStages = (existing && existing.sourceFingerprint === sourceFingerprint)
      ? existing.completedStages
      : [];
    const lastCheckpoint = (existing && existing.sourceFingerprint === sourceFingerprint)
      ? existing.lastCheckpoint
      : 'none';

    const job: AnalysisJobState = {
      jobId: existing?.jobId || `job_${uuid().slice(0, 8)}`,
      projectId,
      sourceFingerprint,
      status: 'running',
      currentStage: existing?.currentStage || 'validating',
      overallProgress: existing?.overallProgress || 5,
      stageProgress: 0,
      completedStages,
      lastCheckpoint,
      stageDetail: 'Initiating analysis pipeline...',
      startedAt: existing?.startedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.activeJobs.set(projectId, job);
    this.abortControllers.set(projectId, new AbortController());
    this.saveJob(job);

    return { job, isNew: true };
  }

  /**
   * Updates progress within the active stage.
   */
  public updateProgress(
    projectId: string,
    overallProgress: number,
    currentStage: string,
    stageDetail?: string,
    stageProgress: number = 0
  ): void {
    const job = this.getJob(projectId);
    if (!job || job.status !== 'running') return;

    job.overallProgress = Math.max(job.overallProgress, Math.min(100, Math.round(overallProgress)));
    job.currentStage = currentStage;
    job.stageDetail = stageDetail;
    job.stageProgress = Math.min(100, Math.round(stageProgress));
    job.updatedAt = new Date().toISOString();

    this.saveJob(job);
  }

  /**
   * Records a durable milestone checkpoint (e.g. metadata_probed, transcription_done, cuts_detected).
   */
  public recordCheckpoint(projectId: string, checkpointName: string, nextStage?: string): void {
    const job = this.getJob(projectId);
    if (!job) return;

    if (!job.completedStages.includes(checkpointName)) {
      job.completedStages.push(checkpointName);
    }
    job.lastCheckpoint = checkpointName;
    if (nextStage) {
      job.currentStage = nextStage;
    }
    job.updatedAt = new Date().toISOString();

    this.saveJob(job);
  }

  /**
   * Helper to atomically record a milestone checkpoint and update overall progress.
   */
  public saveCheckpoint(projectId: string, checkpointName: string, detail?: string, progress?: number): void {
    this.recordCheckpoint(projectId, checkpointName);
    if (progress !== undefined || detail !== undefined) {
      this.updateProgress(projectId, progress ?? 50, checkpointName, detail);
    }
  }

  /**
   * Marks job as successfully completed.
   */
  public completeJob(projectId: string, totalScenes: number): void {
    const job = this.getJob(projectId);
    if (!job) return;

    job.status = 'completed';
    job.overallProgress = 100;
    job.stageProgress = 100;
    job.currentStage = 'completed';
    job.stageDetail = `Analysis complete: ${totalScenes} scenes indexed and verified.`;
    job.updatedAt = new Date().toISOString();

    this.saveJob(job);
    this.abortControllers.delete(projectId);
  }

  /**
   * Marks job as failed with clear error tracking.
   */
  public failJob(projectId: string, errorMessage: string): void {
    const job = this.getJob(projectId);
    if (!job) return;

    job.status = 'failed';
    job.error = errorMessage;
    job.stageDetail = `Failed: ${errorMessage}`;
    job.updatedAt = new Date().toISOString();

    this.saveJob(job);
    this.abortControllers.delete(projectId);
  }

  /**
   * Cancels any in-flight processing for a project.
   */
  public cancelJob(projectId: string): void {
    const controller = this.abortControllers.get(projectId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(projectId);
    }

    const job = this.getJob(projectId);
    if (job && job.status === 'running') {
      job.status = 'cancelled';
      job.stageDetail = 'Analysis cancelled by user.';
      job.updatedAt = new Date().toISOString();
      this.saveJob(job);
    }
  }

  public isCancelled(projectId: string): boolean {
    const controller = this.abortControllers.get(projectId);
    return !!controller?.signal.aborted;
  }

  private saveJob(job: AnalysisJobState): void {
    const filePath = this.getJobPath(job.projectId);
    const tmp = `${filePath}.tmp.${Date.now()}`;
    try {
      fs.writeFileSync(tmp, JSON.stringify(job, null, 2), 'utf8');
      fs.renameSync(tmp, filePath);
    } catch {
      try {
        if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
      } catch {}
    }
  }
}

export const analysisJobManager = new AnalysisJobManager();
