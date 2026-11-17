// ============================================================
// Project Routes — CRUD Operations
// ============================================================

import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { getDb } from '../services/database.js';
import { deleteProjectFiles } from '../services/storage.js';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// POST /api/projects — Create project
router.post('/', (req: AuthRequest, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Project name is required' });
    }

    const db = getDb();
    const id = uuid();

    db.prepare(`
      INSERT INTO projects (id, user_id, name) VALUES (?, ?, ?)
    `).run(id, req.userId || 'default-user', name.trim());

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;

    res.status(201).json({
      success: true,
      data: formatProject(project),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to create project' });
  }
});

// GET /api/projects — List all projects in workspace
router.get('/', (_req: AuthRequest, res) => {
  try {
    const db = getDb();
    const projects = db.prepare(`
      SELECT p.*,
        (SELECT COUNT(*) FROM highlight_candidates WHERE project_id = p.id AND is_selected = 1) as highlight_count,
        (SELECT COUNT(*) FROM shorts WHERE project_id = p.id) as shorts_count
      FROM projects p
      ORDER BY p.updated_at DESC
    `).all() as any[];

    res.json({
      success: true,
      data: projects.map(formatProject),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to load projects' });
  }
});

// GET /api/projects/:id — Get project detail
router.get('/:id', (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id) as any;

    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    // Load video
    const video = db.prepare('SELECT * FROM videos WHERE project_id = ?').get(project.id) as any;

    // Load latest processing job
    const job = db.prepare(
      'SELECT * FROM processing_jobs WHERE project_id = ? ORDER BY created_at DESC LIMIT 1'
    ).get(project.id) as any;

    // Load highlight count
    const highlightCount = (db.prepare(
      'SELECT COUNT(*) as count FROM highlight_candidates WHERE project_id = ? AND is_selected = 1'
    ).get(project.id) as any)?.count || 0;

    // Load shorts count
    const shortsCount = (db.prepare(
      'SELECT COUNT(*) as count FROM shorts WHERE project_id = ?'
    ).get(project.id) as any)?.count || 0;

    res.json({
      success: true,
      data: {
        ...formatProject(project),
        video: video ? formatVideo(video) : null,
        processingJob: job ? formatJob(job) : null,
        highlightCount,
        shortsCount,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to load project' });
  }
});

// DELETE /api/projects/:id
router.delete('/:id', (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(req.params.id) as any;

    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    // Delete files
    deleteProjectFiles(project.id);

    // Delete from DB (cascades)
    db.prepare('DELETE FROM projects WHERE id = ?').run(project.id);

    res.json({ success: true, message: 'Project deleted' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to delete project' });
  }
});

// GET /api/projects/:id/waveform — Get real audio waveform peaks
router.get('/:id/waveform', async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(req.params.id) as any;

    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const video = db.prepare('SELECT * FROM videos WHERE project_id = ?').get(project.id) as any;
    if (!video || !video.file_path) {
      return res.status(404).json({ success: false, error: 'No video found for project' });
    }

    const { extractWaveformPeaks } = await import('../services/audioAnalyzer.js');
    const waveform = await extractWaveformPeaks(video.file_path, 800);

    res.json({
      success: true,
      data: {
        projectId: project.id,
        duration: waveform.duration || video.duration || 0,
        peaks: waveform.peaks,
        pointsPerSecond: waveform.pointsPerSecond,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to extract waveform' });
  }
});


// ── Formatters ──

function formatProject(row: any) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    status: row.status,
    highlightCount: row.highlight_count || 0,
    shortsCount: row.shorts_count || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function formatVideo(row: any) {
  return {
    id: row.id,
    projectId: row.project_id,
    filename: row.filename,
    originalFilename: row.original_filename,
    filePath: row.file_path,
    fileSize: row.file_size,
    duration: row.duration,
    width: row.width,
    height: row.height,
    fps: row.fps,
    codec: row.codec,
    audioCodec: row.audio_codec,
    audioTracks: row.audio_tracks,
    bitrate: row.bitrate,
    mimeType: row.mime_type,
    thumbnailUrl: row.thumbnail_url,
    createdAt: row.created_at,
  };
}

function formatJob(row: any) {
  return {
    id: row.id,
    projectId: row.project_id,
    status: row.status,
    currentStage: row.current_stage,
    progress: row.progress,
    stagesCompleted: JSON.parse(row.stages_completed || '[]'),
    error: row.error,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

export default router;
