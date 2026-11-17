// ============================================================
// Job Queue — Background Processing with Persistence
// ============================================================

import { v4 as uuid } from 'uuid';
import { getDb } from './database.js';

export type JobHandler = (jobId: string, projectId: string) => Promise<void>;

interface QueuedJob {
  id: string;
  projectId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
}

class JobQueue {
  private handlers: Map<string, JobHandler> = new Map();
  private runningJobs: Map<string, AbortController> = new Map();
  private concurrency = 2;
  private activeCount = 0;
  private queue: QueuedJob[] = [];

  registerHandler(type: string, handler: JobHandler): void {
    this.handlers.set(type, handler);
  }

  async enqueue(projectId: string, type: string = 'process'): Promise<string> {
    const jobId = uuid();
    const db = getDb();

    db.prepare(`
      INSERT INTO processing_jobs (id, project_id, status, created_at)
      VALUES (?, ?, 'pending', datetime('now'))
    `).run(jobId, projectId);

    this.queue.push({ id: jobId, projectId, status: 'pending' });
    this.processNext();

    return jobId;
  }

  private async processNext(): Promise<void> {
    if (this.activeCount >= this.concurrency) return;
    const next = this.queue.shift();
    if (!next) return;

    this.activeCount++;
    const handler = this.handlers.get('process');

    if (!handler) {
      console.error('No handler registered for job type "process"');
      this.activeCount--;
      return;
    }

    const abortController = new AbortController();
    this.runningJobs.set(next.id, abortController);

    const db = getDb();

    try {
      db.prepare(`
        UPDATE processing_jobs
        SET status = 'running', started_at = datetime('now'), current_stage = 'validating'
        WHERE id = ?
      `).run(next.id);

      db.prepare(`UPDATE projects SET status = 'processing' WHERE id = ?`).run(next.projectId);

      await handler(next.id, next.projectId);

      db.prepare(`
        UPDATE processing_jobs
        SET status = 'completed', completed_at = datetime('now'), progress = 100, current_stage = 'completed'
        WHERE id = ?
      `).run(next.id);

      db.prepare(`UPDATE projects SET status = 'analyzed', updated_at = datetime('now') WHERE id = ?`).run(next.projectId);

    } catch (err: any) {
      const errorMsg = err.message || 'Unknown processing error';
      console.error(`Job ${next.id} failed:`, errorMsg);

      db.prepare(`
        UPDATE processing_jobs
        SET status = 'failed', error = ?, completed_at = datetime('now'), current_stage = 'failed'
        WHERE id = ?
      `).run(errorMsg, next.id);

      db.prepare(`UPDATE projects SET status = 'error', updated_at = datetime('now') WHERE id = ?`).run(next.projectId);

    } finally {
      this.runningJobs.delete(next.id);
      this.activeCount--;
      this.processNext();
    }
  }

  cancelJob(jobId: string): boolean {
    // Remove from queue if pending
    const idx = this.queue.findIndex(j => j.id === jobId);
    if (idx >= 0) {
      this.queue.splice(idx, 1);
      const db = getDb();
      db.prepare(`UPDATE processing_jobs SET status = 'cancelled' WHERE id = ?`).run(jobId);
      return true;
    }

    // Abort if running
    const controller = this.runningJobs.get(jobId);
    if (controller) {
      controller.abort();
      this.runningJobs.delete(jobId);
      const db = getDb();
      db.prepare(`UPDATE processing_jobs SET status = 'cancelled' WHERE id = ?`).run(jobId);
      return true;
    }

    return false;
  }

  isRunning(jobId: string): boolean {
    return this.runningJobs.has(jobId);
  }

  getQueueLength(): number {
    return this.queue.length;
  }
}

export const jobQueue = new JobQueue();
