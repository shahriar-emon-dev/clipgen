// ============================================================
// Processing Routes — Start/Status/Cancel Pipeline
// ============================================================

import { Router } from 'express';
import { getDb } from '../services/database.js';
import { jobQueue } from '../services/jobQueue.js';
import { runPipeline } from '../services/pipeline.js';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import type { ProcessingUpdate } from '../../../shared/types.js';

// WebSocket broadcast function (set by server entry)
let broadcastToProject: ((projectId: string, data: any) => void) | null = null;

export function setWebSocketBroadcast(fn: (projectId: string, data: any) => void): void {
  broadcastToProject = fn;
}

const router = Router();
router.use(authMiddleware);

const projectFramingModes = new Map<string, 'blur_fill' | 'action'>();

// POST /api/projects/:id/process — Start processing
router.post('/:id/process', async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const project = db.prepare('SELECT * FROM projects WHERE id = ?')
      .get(req.params.id) as any;

    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const { preferredFramingMode = 'blur_fill' } = req.body;
    projectFramingModes.set(project.id, preferredFramingMode);

    // Check video exists
    const video = db.prepare('SELECT id FROM videos WHERE project_id = ?').get(project.id);
    if (!video) {
      return res.status(400).json({ success: false, error: 'No video uploaded for this project' });
    }

    // Check if already processing
    const activeJob = db.prepare(
      "SELECT id FROM processing_jobs WHERE project_id = ? AND status IN ('pending', 'running')"
    ).get(project.id) as any;

    if (activeJob) {
      if (jobQueue.isRunning(activeJob.id)) {
        return res.status(409).json({ success: false, error: 'Processing already in progress' });
      } else {
        // Clean up orphaned job from previous server run
        db.prepare("UPDATE processing_jobs SET status = 'cancelled' WHERE id = ?").run(activeJob.id);
      }
    }

    // Register pipeline handler and enqueue
    jobQueue.registerHandler('process', async (jobId: string, projectId: string) => {
      const onProgress = (update: ProcessingUpdate) => {
        if (broadcastToProject) {
          broadcastToProject(projectId, {
            type: 'processing_update',
            payload: update,
          });
        }
      };

      const framingMode = projectFramingModes.get(projectId) || 'blur_fill';
      await runPipeline(jobId, projectId, onProgress, { preferredFramingMode: framingMode });
      projectFramingModes.delete(projectId);
    });

    const jobId = await jobQueue.enqueue(project.id);

    res.json({
      success: true,
      data: { jobId, status: 'pending', message: 'Processing started' },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to start processing' });
  }
});

// GET /api/projects/:id/status — Get processing status
router.get('/:id/status', (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const project = db.prepare('SELECT id FROM projects WHERE id = ?')
      .get(req.params.id) as any;

    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const job = db.prepare(
      'SELECT * FROM processing_jobs WHERE project_id = ? ORDER BY created_at DESC LIMIT 1'
    ).get(project.id) as any;

    if (!job) {
      return res.json({ success: true, data: null });
    }

    res.json({
      success: true,
      data: {
        id: job.id,
        projectId: job.project_id,
        status: job.status,
        currentStage: job.current_stage,
        progress: job.progress,
        stageProgress: job.stage_progress ?? 0,
        stageDetail: job.stage_detail ?? null,
        stagesCompleted: JSON.parse(job.stages_completed || '[]'),
        error: job.error,
        startedAt: job.started_at,
        completedAt: job.completed_at,
        createdAt: job.created_at,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to get status' });
  }
});

// POST /api/projects/:id/cancel — Cancel processing
router.post('/:id/cancel', (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const project = db.prepare('SELECT id FROM projects WHERE id = ?')
      .get(req.params.id) as any;

    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const activeJob = db.prepare(
      "SELECT id FROM processing_jobs WHERE project_id = ? AND status IN ('pending', 'running') ORDER BY created_at DESC LIMIT 1"
    ).get(project.id) as any;

    if (!activeJob) {
      return res.status(400).json({ success: false, error: 'No active processing job to cancel' });
    }

    jobQueue.cancelJob(activeJob.id);
    db.prepare("UPDATE processing_jobs SET status = 'cancelled' WHERE id = ?").run(activeJob.id);
    db.prepare("UPDATE projects SET status = 'created' WHERE id = ?").run(project.id);

    res.json({ success: true, message: 'Processing cancelled' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to cancel processing' });
  }
});

// GET /api/projects/:id/transcript — Get transcript
router.get('/:id/transcript', (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const project = db.prepare('SELECT id FROM projects WHERE id = ?')
      .get(req.params.id) as any;

    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const transcript = db.prepare('SELECT * FROM transcripts WHERE project_id = ?').get(project.id) as any;
    if (!transcript) {
      return res.json({ success: true, data: null });
    }

    const segments = db.prepare(
      'SELECT * FROM transcript_segments WHERE transcript_id = ? ORDER BY start_time'
    ).all(transcript.id) as any[];

    res.json({
      success: true,
      data: {
        id: transcript.id,
        language: transcript.language,
        fullText: transcript.full_text,
        duration: transcript.duration,
        segments: segments.map(s => ({
          id: s.id,
          startTime: s.start_time,
          endTime: s.end_time,
          text: s.text,
          confidence: s.confidence,
          wordTimestamps: JSON.parse(s.word_timestamps || '[]'),
        })),
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to get transcript' });
  }
});

// GET /api/projects/:id/logs — Get processing logs
router.get('/:id/logs', (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const project = db.prepare('SELECT id FROM projects WHERE id = ?')
      .get(req.params.id) as any;

    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const logs = db.prepare(
      'SELECT * FROM processing_logs WHERE project_id = ? ORDER BY created_at DESC LIMIT 100'
    ).all(project.id) as any[];

    res.json({
      success: true,
      data: logs.map(l => ({
        id: l.id,
        level: l.level,
        stage: l.stage,
        message: l.message,
        createdAt: l.created_at,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to get logs' });
  }
});

export default router;
