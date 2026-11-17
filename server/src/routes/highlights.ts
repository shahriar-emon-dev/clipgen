// ============================================================
// Highlights Routes — Get/Manage Highlight Candidates
// ============================================================

import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { getDb } from '../services/database.js';
import { computeSmartFraming } from '../services/smartFraming.js';
import { extractClipAsIs } from '../services/ffmpeg.js';
import { generateSafeFilename } from '../services/titleGenerator.js';
import { getProjectClipsDir } from '../services/storage.js';
import { config } from '../config/index.js';
import { createAndVerifyZipArchive } from '../services/zipService.js';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

// POST /api/highlights/projects/:id/export-all-asis — Batch extract active highlights as-is (fast cut, original 16:9)
router.post('/projects/:id/export-all-asis', async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const project = db.prepare('SELECT id, name FROM projects WHERE id = ?').get(req.params.id) as any;
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

    const video = db.prepare('SELECT * FROM videos WHERE project_id = ?').get(project.id) as any;
    if (!video || !video.file_path || !fs.existsSync(video.file_path)) {
      return res.status(400).json({ success: false, error: 'Video file not found' });
    }

    const limit = Math.min(parseInt(req.body.limit as string) || 20, 50);

    const highlights = db.prepare(
      'SELECT * FROM highlight_candidates WHERE project_id = ? AND is_suppressed = 0 ORDER BY rank ASC, score_total DESC LIMIT ?'
    ).all(project.id, limit) as any[];

    if (highlights.length === 0) {
      return res.status(400).json({ success: false, error: 'No highlights found' });
    }

    const queue = [...highlights];
    const results: any[] = [];

    async function worker() {
      while (queue.length > 0) {
        const h = queue.shift();
        if (!h) break;
        const startTime = h.ai_recommended_start > 0 ? h.ai_recommended_start : h.start_time;
        const endTime = h.ai_recommended_end > 0 ? h.ai_recommended_end : h.end_time;
        const filename = `highlight_${h.id}_asis.mp4`;
        try {
          const clipPath = await extractClipAsIs(video.file_path, project.id, startTime, endTime, filename);
          results.push({ id: h.id, success: true, filePath: clipPath });
        } catch (err: any) {
          console.error(`Failed to extract as-is highlight ${h.id}:`, err);
          results.push({ id: h.id, success: false, error: err.message });
        }
      }
    }

    const workers = Array.from({ length: Math.min(4, highlights.length) }, () => worker());
    await Promise.all(workers);

    res.json({
      success: true,
      data: {
        total: highlights.length,
        exported: results.filter((r) => r.success).length,
      },
      message: `Exported ${results.filter((r) => r.success).length} of ${highlights.length} moments as-is`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: `Batch as-is export failed: ${err.message}` });
  }
});

// GET & POST /api/highlights/projects/:id/download-all-asis — Download active highlights as a ZIP (original 16:9) with strict deduplication
async function handleDownloadAllHighlightsAsIs(req: AuthRequest, res: any) {
  let stagingDir: string | null = null;
  let zipPath: string | null = null;
  try {
    const db = getDb();
    const project = db.prepare('SELECT id, name FROM projects WHERE id = ?').get(req.params.id) as any;
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

    const video = db.prepare('SELECT * FROM videos WHERE project_id = ?').get(project.id) as any;
    if (!video || !video.file_path || !fs.existsSync(video.file_path)) {
      return res.status(400).json({ success: false, error: 'Source video file not found on disk' });
    }

    // Extract optional explicit highlightIds from query or body
    const rawHighlightIds = req.query.highlightIds || req.body?.highlightIds;
    let requestedHighlightIds: string[] | null = null;
    if (rawHighlightIds) {
      const parsed = Array.isArray(rawHighlightIds)
        ? rawHighlightIds.map(String)
        : String(rawHighlightIds).split(',').map((s) => s.trim()).filter(Boolean);
      requestedHighlightIds = Array.from(new Set(parsed));
    }

    const uniqueHighlights: any[] = [];
    const seenHighlightIds = new Set<string>();

    if (requestedHighlightIds && requestedHighlightIds.length > 0) {
      for (const hid of requestedHighlightIds) {
        if (seenHighlightIds.has(hid)) {
          return res.status(400).json({
            success: false,
            error: `Duplicate highlight ID in export request: ${hid}`,
          });
        }
        const h = db.prepare('SELECT * FROM highlight_candidates WHERE id = ? AND project_id = ?').get(hid, project.id) as any;
        if (!h) {
          return res.status(400).json({
            success: false,
            error: `Highlight not found in project: ${hid}`,
          });
        }
        seenHighlightIds.add(hid);
        uniqueHighlights.push(h);
      }
    } else {
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
      const candidates = db.prepare(
        'SELECT * FROM highlight_candidates WHERE project_id = ? AND is_suppressed = 0 ORDER BY rank ASC, score_total DESC LIMIT ?'
      ).all(project.id, limit) as any[];

      for (const h of candidates) {
        if (!seenHighlightIds.has(h.id)) {
          seenHighlightIds.add(h.id);
          uniqueHighlights.push(h);
        }
      }
    }

    if (uniqueHighlights.length === 0) {
      return res.status(400).json({ success: false, error: 'No highlights available for download' });
    }

    // Parallel extract any missing clips (stream copy is ~0.2s per clip)
    const queue = [...uniqueHighlights];
    const concurrency = 4;
    const extractionErrors: string[] = [];

    async function worker() {
      while (queue.length > 0) {
        const h = queue.shift();
        if (!h) break;
        const filename = `highlight_${h.id}_asis.mp4`;
        const clipsDir = getProjectClipsDir(project.id);
        const clipPath = path.join(clipsDir, filename);

        if (!fs.existsSync(clipPath) || fs.statSync(clipPath).size < 1000) {
          const startTime = h.ai_recommended_start > 0 ? h.ai_recommended_start : h.start_time;
          const endTime = h.ai_recommended_end > 0 ? h.ai_recommended_end : h.end_time;
          try {
            await extractClipAsIs(video.file_path, project.id, startTime, endTime, filename);
          } catch (err: any) {
            extractionErrors.push(`Highlight ${h.id} ("${h.title || 'Untitled'}"): ${err.message}`);
          }
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, uniqueHighlights.length) }, () => worker()));

    if (extractionErrors.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Failed to extract clips for ZIP: ${extractionErrors.join('; ')}`,
      });
    }

    stagingDir = path.join(config.rendersDir, `zip_stage_asis_${Date.now()}_${project.id.substring(0, 6)}`);
    fs.mkdirSync(stagingDir, { recursive: true });

    const seenClipPaths = new Set<string>();

    for (let i = 0; i < uniqueHighlights.length; i++) {
      const h = uniqueHighlights[i];
      const filename = `highlight_${h.id}_asis.mp4`;
      const clipsDir = getProjectClipsDir(project.id);
      const clipPath = path.join(clipsDir, filename);

      if (!fs.existsSync(clipPath) || fs.statSync(clipPath).size < 1000) {
        return res.status(400).json({
          success: false,
          error: `Clip file missing or corrupted for highlight "${h.title || h.id}": ${clipPath}`,
        });
      }

      const resolvedClipPath = path.resolve(clipPath);
      if (seenClipPaths.has(resolvedClipPath)) {
        return res.status(400).json({
          success: false,
          error: `Duplicate clip file detected for highlight "${h.title || h.id}": ${resolvedClipPath}`,
        });
      }
      seenClipPaths.add(resolvedClipPath);

      const title = h.title || `Moment_${i + 1}`;
      const prefix = String(i + 1).padStart(2, '0');
      const safeName = `${prefix}_${generateSafeFilename(title, h.id)}`;
      const destPath = path.join(stagingDir, safeName);

      try {
        fs.copyFileSync(clipPath, destPath);
      } catch (copyErr: any) {
        throw new Error(`Failed to stage highlight clip "${safeName}": ${copyErr.message}`);
      }

      if (!fs.existsSync(destPath) || fs.statSync(destPath).size === 0) {
        throw new Error(`Staged file verification failed for "${safeName}" (0 bytes or missing)`);
      }
    }

    // Verify staging directory count
    const stagedFiles = fs.readdirSync(stagingDir).filter((f) => !f.startsWith('.'));
    if (stagedFiles.length !== uniqueHighlights.length) {
      throw new Error(
        `Staging verification failed: expected ${uniqueHighlights.length} unique highlights, but found ${stagedFiles.length} files.`
      );
    }

    const cleanProjectName = (project.name || 'Project').replace(/[^a-zA-Z0-9_-]/g, '_');
    const zipFilename = `${cleanProjectName}_Best_${uniqueHighlights.length}_Moments_AsIs.zip`;
    zipPath = path.join(config.rendersDir, `bundle_asis_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.zip`);

    await createAndVerifyZipArchive(stagingDir, zipPath, uniqueHighlights.length);

    try {
      if (stagingDir && fs.existsSync(stagingDir)) {
        fs.rmSync(stagingDir, { recursive: true, force: true });
        stagingDir = null;
      }
    } catch {}

    res.download(zipPath, zipFilename, () => {
      try {
        if (zipPath && fs.existsSync(zipPath)) {
          fs.unlinkSync(zipPath);
        }
      } catch {}
    });
  } catch (err: any) {
    if (stagingDir && fs.existsSync(stagingDir)) {
      try { fs.rmSync(stagingDir, { recursive: true, force: true }); } catch {}
    }
    if (zipPath && fs.existsSync(zipPath)) {
      try { fs.unlinkSync(zipPath); } catch {}
    }
    res.status(400).json({ success: false, error: `Failed to create as-is ZIP: ${err.message}` });
  }
}

router.get('/projects/:id/download-all-asis', handleDownloadAllHighlightsAsIs);
router.post('/projects/:id/download-all-asis', handleDownloadAllHighlightsAsIs);

// POST /api/highlights/:id/export-asis — Export highlight in original format (lossless/fast cut)
router.post('/:id/export-asis', async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const highlight = db.prepare('SELECT * FROM highlight_candidates WHERE id = ?').get(req.params.id) as any;
    if (!highlight) {
      return res.status(404).json({ success: false, error: 'Highlight not found' });
    }

    const video = db.prepare('SELECT * FROM videos WHERE project_id = ?').get(highlight.project_id) as any;
    if (!video || !video.file_path || !fs.existsSync(video.file_path)) {
      return res.status(404).json({ success: false, error: 'Video file not found' });
    }

    const startTime = highlight.ai_recommended_start > 0 ? highlight.ai_recommended_start : highlight.start_time;
    const endTime = highlight.ai_recommended_end > 0 ? highlight.ai_recommended_end : highlight.end_time;
    const filename = `highlight_${highlight.id}_asis.mp4`;

    const clipPath = await extractClipAsIs(
      video.file_path,
      highlight.project_id,
      startTime,
      endTime,
      filename
    );

    const stat = fs.statSync(clipPath);

    res.json({
      success: true,
      data: {
        highlightId: highlight.id,
        filePath: clipPath,
        fileSize: stat.size,
        filename,
        downloadUrl: `/api/highlights/${highlight.id}/download-asis`,
      },
      message: 'Highlight exported as-is successfully',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: `Failed to export highlight as-is: ${err.message}` });
  }
});

// GET /api/highlights/:id/download-asis — Download highlight in original format / aspect ratio
router.get('/:id/download-asis', async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const highlight = db.prepare('SELECT * FROM highlight_candidates WHERE id = ?').get(req.params.id) as any;
    if (!highlight) {
      return res.status(404).json({ success: false, error: 'Highlight not found' });
    }

    const video = db.prepare('SELECT * FROM videos WHERE project_id = ?').get(highlight.project_id) as any;
    if (!video || !video.file_path || !fs.existsSync(video.file_path)) {
      return res.status(404).json({ success: false, error: 'Video file not found' });
    }

    const filename = `highlight_${highlight.id}_asis.mp4`;
    const clipsDir = getProjectClipsDir(highlight.project_id);
    const clipPath = path.join(clipsDir, filename);

    // If not extracted yet, extract it on the fly (takes ~0.2s)
    if (!fs.existsSync(clipPath) || fs.statSync(clipPath).size < 1000) {
      const startTime = highlight.ai_recommended_start > 0 ? highlight.ai_recommended_start : highlight.start_time;
      const endTime = highlight.ai_recommended_end > 0 ? highlight.ai_recommended_end : highlight.end_time;
      await extractClipAsIs(video.file_path, highlight.project_id, startTime, endTime, filename);
    }

    const title = highlight.title || `Moment_${highlight.rank || 1}`;
    const safeName = generateSafeFilename(`${title} (Original)`, highlight.id);

    res.download(clipPath, safeName);
  } catch (err: any) {
    res.status(500).json({ success: false, error: `Download failed: ${err.message}` });
  }
});

// GET /api/projects/:id/highlights — Get highlight candidates
router.get('/:id/highlights', (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const project = db.prepare('SELECT id FROM projects WHERE id = ?')
      .get(req.params.id) as any;

    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const showAll = req.query.all === 'true';
    const limit = parseInt(req.query.limit as string) || 20;

    let query = `
      SELECT * FROM highlight_candidates
      WHERE project_id = ?
    `;

    if (!showAll) {
      query += ' AND is_suppressed = 0';
    }

    query += ' ORDER BY score_total DESC LIMIT ?';

    const highlights = db.prepare(query).all(project.id, limit) as any[];

    res.json({
      success: true,
      data: highlights.map(formatHighlight),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to get highlights' });
  }
});

// PATCH /api/highlights/:id — Update highlight (boundary adjust / select / suppress)
router.patch('/:id', (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const highlight = db.prepare('SELECT * FROM highlight_candidates WHERE id = ?').get(req.params.id) as any;

    if (!highlight) {
      return res.status(404).json({ success: false, error: 'Highlight not found' });
    }

    // Verify project exists
    const project = db.prepare('SELECT id FROM projects WHERE id = ?')
      .get(highlight.project_id) as any;

    if (!project) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const { startTime, endTime, isSelected, isSuppressed, aiReason, title, framingMode, cropOffsetX } = req.body;
    const updates: string[] = [];
    const values: any[] = [];

    if (startTime !== undefined) { updates.push('start_time = ?'); values.push(startTime); }
    if (endTime !== undefined) { updates.push('end_time = ?'); values.push(endTime); }
    if (startTime !== undefined || endTime !== undefined) {
      const newStart = startTime ?? highlight.start_time;
      const newEnd = endTime ?? highlight.end_time;
      updates.push('duration = ?');
      values.push(Math.max(0, newEnd - newStart));
    }
    if (isSelected !== undefined) { updates.push('is_selected = ?'); values.push(isSelected ? 1 : 0); }
    if (isSuppressed !== undefined) { updates.push('is_suppressed = ?'); values.push(isSuppressed ? 1 : 0); }
    if (aiReason !== undefined) { updates.push('ai_reason = ?'); values.push(aiReason); }
    if (title !== undefined) { updates.push('title = ?'); values.push(title); }
    if (framingMode !== undefined) { updates.push('framing_mode = ?'); values.push(framingMode); }
    if (cropOffsetX !== undefined) { updates.push('crop_offset_x = ?'); values.push(cropOffsetX); }

    if (updates.length > 0) {
      values.push(highlight.id);
      db.prepare(`UPDATE highlight_candidates SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    }

    const updated = db.prepare('SELECT * FROM highlight_candidates WHERE id = ?').get(highlight.id) as any;

    res.json({
      success: true,
      data: formatHighlight(updated),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to update highlight' });
  }
});

// POST /api/highlights/:id/auto-frame — Re-analyze smart framing with OpenCV
router.post('/:id/auto-frame', async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const highlight = db.prepare('SELECT * FROM highlight_candidates WHERE id = ?').get(req.params.id) as any;
    if (!highlight) {
      return res.status(404).json({ success: false, error: 'Highlight not found' });
    }

    const video = db.prepare('SELECT * FROM videos WHERE project_id = ?').get(highlight.project_id) as any;
    if (!video) {
      return res.status(404).json({ success: false, error: 'Video not found' });
    }

    const framing = await computeSmartFraming(
      video.file_path,
      highlight.start_time,
      highlight.end_time,
      video.width || 1920,
      video.height || 1080
    );

    db.prepare(`
      UPDATE highlight_candidates
      SET crop_offset_x = ?, framing_mode = ?
      WHERE id = ?
    `).run(framing.cropOffsetX, framing.recommendedMode, highlight.id);

    const updated = db.prepare('SELECT * FROM highlight_candidates WHERE id = ?').get(highlight.id);

    res.json({
      success: true,
      data: formatHighlight(updated),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to auto-frame highlight' });
  }
});

// DELETE /api/highlights/:id — Remove/suppress highlight candidate from review list
router.delete('/:id', (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const highlight = db.prepare('SELECT * FROM highlight_candidates WHERE id = ?').get(req.params.id) as any;

    if (!highlight) {
      return res.status(404).json({ success: false, error: 'Highlight not found' });
    }

    const project = db.prepare('SELECT id FROM projects WHERE id = ?')
      .get(highlight.project_id) as any;

    if (!project) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    // Delete candidate from database (does not delete original video or project)
    db.prepare('DELETE FROM highlight_candidates WHERE id = ?').run(highlight.id);

    res.json({
      success: true,
      message: 'Highlight candidate removed from review list',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to delete highlight' });
  }
});

function formatHighlight(row: any) {
  let whySelected: string[] | undefined;
  if (row.ai_reason && row.ai_reason.includes('•')) {
    whySelected = row.ai_reason.split(' • ').map((s: string) => s.trim()).filter(Boolean);
  } else if (row.score_total > 0) {
    const reasons: string[] = [];
    if (row.score_hook >= 50) reasons.push('✓ Strong opening hook & curiosity');
    if (row.score_emotion >= 50) reasons.push('✓ Emotional engagement');
    if (row.score_information >= 50) reasons.push('✓ High information / action value');
    if (row.score_story >= 50) reasons.push('✓ Complete narrative arc');
    if (row.score_audio >= 60) reasons.push('✓ High speech / crowd energy');
    if (reasons.length === 0) {
      reasons.push('✓ Clean sentence boundary & steady retention');
    }
    whySelected = reasons;
  }

  // Dynamic fallback title if not set
  let title = row.title;
  if (!title) {
    if (row.ai_reason && !row.ai_reason.includes('•') && row.ai_reason.length < 50) {
      title = row.ai_reason;
    } else {
      title = `Moment #${row.rank || 1}`;
    }
  }

  return {
    id: row.id,
    projectId: row.project_id,
    title,
    framingMode: row.framing_mode || 'action',
    startTime: row.start_time,
    endTime: row.end_time,
    duration: row.duration,
    transcriptText: row.transcript_text,
    scoreTotal: row.score_total,
    scoreHook: row.score_hook,
    scoreEmotion: row.score_emotion,
    scoreInformation: row.score_information,
    scoreSurprise: row.score_surprise,
    scoreStory: row.score_story,
    scoreVisual: row.score_visual,
    scoreAudio: row.score_audio,
    scoreShortsP: row.score_shorts_potential,
    aiReason: row.ai_reason,
    whySelected,
    confidence: (row.score_total >= 75 ? 'High' : row.score_total >= 40 ? 'Medium' : 'Low') as 'High' | 'Medium' | 'Low',
    cropOffsetX: row.crop_offset_x ?? 0.5,
    aiRecommendedStart: row.ai_recommended_start,
    aiRecommendedEnd: row.ai_recommended_end,
    rank: row.rank,
    isSelected: !!row.is_selected,
    isSuppressed: !!row.is_suppressed,
    createdAt: row.created_at,
  };
}

export default router;

