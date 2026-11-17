// ============================================================
// Settings & System Routes
// ============================================================

import { Router } from 'express';
import { config } from '../config/index.js';
import { getDb } from '../services/database.js';
import { getCopyrightCheck, checkCopyrightRisk } from '../services/copyrightChecker.js';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { DEFAULT_PIPELINE_CONFIG } from '../../../shared/constants.js';

const router = Router();
router.use(authMiddleware);

// GET /api/settings
router.get('/settings', (_req: AuthRequest, res) => {
  res.json({
    success: true,
    data: {
      pipelineConfig: {
        ...DEFAULT_PIPELINE_CONFIG,
        maxVideoDuration: config.maxVideoDuration,
        maxUploadSize: config.maxUploadSize,
        maxShortsCount: config.maxShortsCount,
        maxShortDuration: config.maxShortDuration,
        minShortDuration: config.minShortDuration,
        analysisChunkSize: config.analysisChunkSize,
        chunkOverlap: config.chunkOverlap,
        outputWidth: config.outputWidth,
        outputHeight: config.outputHeight,
        outputFps: config.outputFps,
        outputFormat: config.outputFormat,
        transcriptionProvider: config.transcriptionProvider,
        aiProvider: config.aiProvider,
        aiModel: config.aiModel,
      },
      transcriptionProvider: config.transcriptionProvider,
      aiProvider: config.aiProvider,
      aiModel: config.aiModel,
    },
  });
});

// GET /api/projects/:id/copyright
router.get('/projects/:id/copyright', async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const project = db.prepare('SELECT * FROM projects WHERE id = ?')
      .get(req.params.id) as any;

    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    let check = getCopyrightCheck(project.id);
    if (!check) {
      const video = db.prepare('SELECT * FROM videos WHERE project_id = ?').get(project.id) as any;
      const transcript = db.prepare('SELECT * FROM transcripts WHERE project_id = ?').get(project.id) as any;
      
      check = await checkCopyrightRisk(
        project.id,
        video?.duration || 0,
        transcript?.full_text || ''
      );
    }

    res.json({
      success: true,
      data: check,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to check copyright: ' + err.message });
  }
});

export default router;
