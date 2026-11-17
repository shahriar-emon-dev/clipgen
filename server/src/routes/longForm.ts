// ============================================================
// Long-Form Compilation Routes — REST Endpoints
// ============================================================

import { Router, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { getDb } from '../services/database.js';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { longFormCompilationEngine } from '../services/longForm/LongFormCompilationEngine.js';
import type { GenerateTimelineRequest, UpdateTimelineRequest } from '../../../shared/types.js';

let broadcastToProject: ((projectId: string, data: any) => void) | null = null;

export function setLongFormWebSocketBroadcast(fn: (projectId: string, data: any) => void): void {
  broadcastToProject = fn;
}

function broadcastLongFormProgress(
  compilationId: string,
  projectId: string,
  progress: number,
  stage: string,
  detail?: string,
  status: 'draft' | 'analyzing' | 'rendering' | 'completed' | 'failed' = 'rendering'
): void {
  if (broadcastToProject) {
    broadcastToProject(projectId, {
      type: 'longform_progress',
      payload: {
        compilationId,
        projectId,
        progress,
        stage,
        detail,
        status,
      },
    });
  }
}

const router = Router();
router.use(authMiddleware);

// GET /api/projects/:id/longform — Fetch compilation for project
router.get('/projects/:id/longform', async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(String(req.params.id));
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const compilation = db.prepare('SELECT * FROM long_form_compilations WHERE project_id = ?').get(project.id);
    if (!compilation) {
      return res.json({ success: true, data: null });
    }

    res.json({
      success: true,
      data: longFormCompilationEngine.formatCompilation(compilation),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/projects/:id/longform/generate-timeline — Generate AI timeline
router.post('/projects/:id/longform/generate-timeline', async (req: AuthRequest, res: Response) => {
  try {
    const projectId = String(req.params.id);
    const body: GenerateTimelineRequest = req.body || {};

    const compilation = await longFormCompilationEngine.generateTimelineDraft(projectId, body);

    broadcastLongFormProgress(
      compilation.id,
      projectId,
      0,
      'timeline_ready',
      `AI Timeline assembled: ${compilation.timeline.length} segments (${Math.round(compilation.estimatedDuration)}s)`,
      'draft'
    );

    res.json({
      success: true,
      data: compilation,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/longform/:id/timeline — Update timeline segments or title
router.patch('/longform/:id/timeline', async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const compilationId = String(req.params.id);
    const { timeline, title, settings }: UpdateTimelineRequest = req.body;

    const existing = db.prepare('SELECT * FROM long_form_compilations WHERE id = ?').get(compilationId);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Compilation not found' });
    }

    let updatedTimeline = existing.timeline;
    let estimatedDuration = existing.estimated_duration;

    if (timeline) {
      updatedTimeline = JSON.stringify(timeline);
      estimatedDuration = timeline.filter(s => s.isEnabled !== false).reduce((acc, s) => acc + s.duration, 0);
    }

    let updatedSettings = existing.settings;
    if (settings) {
      const current = typeof existing.settings === 'string' ? JSON.parse(existing.settings) : existing.settings;
      updatedSettings = JSON.stringify({ ...current, ...settings });
    }

    const updatedTitle = title || existing.title;

    db.prepare(`
      UPDATE long_form_compilations
      SET timeline = ?, settings = ?, title = ?, estimated_duration = ?
      WHERE id = ?
    `).run(updatedTimeline, updatedSettings, updatedTitle, estimatedDuration, compilationId);

    const updated = db.prepare('SELECT * FROM long_form_compilations WHERE id = ?').get(compilationId);
    res.json({
      success: true,
      data: longFormCompilationEngine.formatCompilation(updated),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/longform/:id/render — Trigger rendering
router.post('/longform/:id/render', async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const compilationId = String(req.params.id);

    const compilation = db.prepare('SELECT * FROM long_form_compilations WHERE id = ?').get(compilationId);
    if (!compilation) {
      return res.status(404).json({ success: false, error: 'Compilation not found' });
    }

    if (compilation.status === 'rendering') {
      return res.status(400).json({ success: false, error: 'Compilation is already rendering' });
    }

    // Launch render asynchronously
    longFormCompilationEngine.renderCompilation(compilationId, (update) => {
      broadcastLongFormProgress(
        update.compilationId,
        update.projectId,
        update.progress,
        update.stage,
        update.detail,
        update.status
      );
    }).catch((err) => {
      console.error(`Background long-form render error for ${compilationId}:`, err);
    });

    res.json({
      success: true,
      message: 'Long-Form Compilation rendering started',
      data: {
        compilationId,
        status: 'rendering',
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/longform/:id/status — Check status
router.get('/longform/:id/status', async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const compilation = db.prepare('SELECT * FROM long_form_compilations WHERE id = ?').get(String(req.params.id));
    if (!compilation) {
      return res.status(404).json({ success: false, error: 'Compilation not found' });
    }

    res.json({
      success: true,
      data: longFormCompilationEngine.formatCompilation(compilation),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/longform/:id/download — Download final 1080p MP4
router.get('/longform/:id/download', async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const compilation = db.prepare('SELECT * FROM long_form_compilations WHERE id = ?').get(String(req.params.id));
    if (!compilation) {
      return res.status(404).json({ success: false, error: 'Compilation not found' });
    }

    if (!compilation.file_path || !fs.existsSync(compilation.file_path)) {
      return res.status(404).json({ success: false, error: 'Rendered compilation video file not found on disk' });
    }

    const safeTitle = (compilation.title || 'compilation').replace(/[^a-zA-Z0-9_-]/g, '_');
    const downloadFilename = `${safeTitle}_1080p.mp4`;

    res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}"`);
    res.setHeader('Content-Type', 'video/mp4');

    const stream = fs.createReadStream(compilation.file_path);
    stream.pipe(res);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/longform/:id/stream — Stream video with range support for HTML5 video player
router.get('/longform/:id/stream', async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const compilation = db.prepare('SELECT * FROM long_form_compilations WHERE id = ?').get(String(req.params.id));
    if (!compilation || !compilation.file_path || !fs.existsSync(compilation.file_path)) {
      return res.status(404).json({ success: false, error: 'Compilation video file not available' });
    }

    const stat = fs.statSync(compilation.file_path);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start + 1;

      const file = fs.createReadStream(compilation.file_path, { start, end });
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/mp4',
      };

      res.writeHead(206, head);
      file.pipe(res);
    } else {
      const head = {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
      };
      res.writeHead(200, head);
      fs.createReadStream(compilation.file_path).pipe(res);
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export const longFormRouter = router;
