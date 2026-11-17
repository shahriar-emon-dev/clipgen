import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import path from 'path';
import fs from 'fs';
import { spawn, exec } from 'child_process';
import { getDb } from '../services/database.js';
import { extractClip, reframeToVertical, burnCaptions, renderShortDirect } from '../services/ffmpeg.js';
import { computeSmartFraming } from '../services/smartFraming.js';
import { generateSafeFilename } from '../services/titleGenerator.js';
import { getProjectClipsDir, getProjectCaptionsDir, getRenderDir } from '../services/storage.js';
import { createAndVerifyZipArchive, listZipEntries } from '../services/zipService.js';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { config } from '../config/index.js';

let broadcastToProject: ((projectId: string, data: any) => void) | null = null;
const activeRenderingShortIds = new Set<string>();

export function setShortsWebSocketBroadcast(fn: (projectId: string, data: any) => void): void {
  broadcastToProject = fn;
}

function broadcastShortProgress(projectId: string, shortId: string, progress: number, status: string = 'rendering'): void {
  if (broadcastToProject) {
    broadcastToProject(projectId, {
      type: 'short_progress',
      payload: {
        shortId,
        progress,
        status,
      },
    });
  }
}

// ── Global Render Queue (Strict serialization to maximize speed on CPU without thrashing) ──

interface QueuedJob {
  shortId: string;
  videoPath: string;
  projectId: string;
  startTime: number;
  endTime: number;
  captionsEnabled: boolean;
  reframeMode: string;
}

class GlobalRenderQueue {
  private queue: QueuedJob[] = [];
  private queuedShortIds = new Set<string>();
  private activeShortIds = new Set<string>();
  private activeProcesses = new Map<string, any>();
  private concurrency = 1; // Exactly 1 video at a time using full CPU threads (completes 15s in ~9.5s)
  private runningWorkers = 0;

  add(job: QueuedJob): void {
    if (this.queuedShortIds.has(job.shortId) || this.activeShortIds.has(job.shortId)) {
      return;
    }
    this.queue.push(job);
    this.queuedShortIds.add(job.shortId);
    activeRenderingShortIds.add(job.shortId);
    this.processNext();
  }

  addBatch(jobs: QueuedJob[]): void {
    for (const job of jobs) {
      if (!this.queuedShortIds.has(job.shortId) && !this.activeShortIds.has(job.shortId)) {
        this.queue.push(job);
        this.queuedShortIds.add(job.shortId);
        activeRenderingShortIds.add(job.shortId);
      }
    }
    this.processNext();
  }

  isBusy(shortId?: string): boolean {
    if (shortId) {
      return this.queuedShortIds.has(shortId) || this.activeShortIds.has(shortId);
    }
    return this.runningWorkers > 0 || this.queue.length > 0;
  }

  registerProcess(shortId: string, proc: any): void {
    if (proc) {
      this.activeProcesses.set(shortId, proc);
    } else {
      this.activeProcesses.delete(shortId);
    }
  }

  killAll(): void {
    for (const [, proc] of this.activeProcesses.entries()) {
      try {
        if (process.platform === 'win32' && proc?.pid) {
          exec(`taskkill /F /T /PID ${proc.pid}`, () => {});
        } else {
          proc?.kill('SIGKILL');
        }
      } catch {}
    }
    this.activeProcesses.clear();
    this.queue = [];
    this.queuedShortIds.clear();
    this.activeShortIds.clear();
    activeRenderingShortIds.clear();
  }

  private async processNext(): Promise<void> {
    if (this.runningWorkers >= this.concurrency || this.queue.length === 0) {
      return;
    }

    this.runningWorkers++;
    const job = this.queue.shift();
    if (!job) {
      this.runningWorkers--;
      return;
    }

    this.queuedShortIds.delete(job.shortId);
    this.activeShortIds.add(job.shortId);
    activeRenderingShortIds.add(job.shortId);

    try {
      await generateShortAsync(
        job.shortId,
        job.videoPath,
        job.projectId,
        job.startTime,
        job.endTime,
        job.captionsEnabled,
        job.reframeMode
      );
    } catch (err: any) {
      console.error(`RenderQueue job ${job.shortId} error:`, err.message);
    } finally {
      this.activeShortIds.delete(job.shortId);
      activeRenderingShortIds.delete(job.shortId);
      this.activeProcesses.delete(job.shortId);
      this.runningWorkers--;
      this.processNext();
    }
  }
}

export const globalRenderQueue = new GlobalRenderQueue();

const router = Router();
router.use(authMiddleware);

// POST /api/projects/:id/shorts/generate-all — Batch generate/export all highlight moments
router.post('/projects/:id/shorts/generate-all', async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const project = db.prepare('SELECT id, name FROM projects WHERE id = ?').get(req.params.id) as any;
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const video = db.prepare('SELECT * FROM videos WHERE project_id = ?').get(project.id) as any;
    if (!video) {
      return res.status(400).json({ success: false, error: 'No video found for this project' });
    }

    const {
      captionsEnabled = true,
      reframeMode = 'auto',
      limit: reqLimit,
    } = req.body;

    const limit = Math.min(parseInt(reqLimit as string) || 20, 50);

    // Get top highlight moments for this project (default top 20)
    const highlights = db.prepare(
      'SELECT * FROM highlight_candidates WHERE project_id = ? AND is_suppressed = 0 ORDER BY rank ASC, score_total DESC LIMIT ?'
    ).all(project.id, limit) as any[];

    if (highlights.length === 0) {
      return res.status(400).json({ success: false, error: 'No highlight candidates available to export' });
    }

    const shortsToProcess: { shortId: string; highlight: any; startTime: number; endTime: number; reframeMode: string }[] = [];
    const resultingShorts: any[] = [];

    for (const h of highlights) {
      const startTime = h.ai_recommended_start > 0 ? h.ai_recommended_start : h.start_time;
      let endTime = h.ai_recommended_end > 0 ? h.ai_recommended_end : h.end_time;
      if (endTime - startTime > config.maxShortDuration) {
        endTime = startTime + config.maxShortDuration;
      }
      const duration = endTime - startTime;

      // Check if short already exists for this highlight
      const existing = db.prepare(
        'SELECT * FROM shorts WHERE project_id = ? AND (highlight_id = ? OR abs(start_time - ?) < 2) ORDER BY created_at DESC LIMIT 1'
      ).get(project.id, h.id, startTime) as any;

      let shortId: string;
      const chosenMode = (reframeMode && reframeMode !== 'center' && reframeMode !== 'auto')
        ? reframeMode
        : (h.framing_mode || 'blur_fill');

      if (existing && existing.file_path && fs.existsSync(existing.file_path) && fs.statSync(existing.file_path).size > 10000 && (existing.reframe_mode === chosenMode || existing.framing_mode === chosenMode)) {
        // Already successfully rendered with matching framing mode!
        if (existing.status !== 'completed') {
          db.prepare("UPDATE shorts SET status = 'completed', render_progress = 100 WHERE id = ?").run(existing.id);
          existing.status = 'completed';
          existing.render_progress = 100;
        }
        resultingShorts.push(formatShort(existing));
        continue;
      } else if (existing) {
        shortId = existing.id;
        db.prepare(
          "UPDATE shorts SET status = 'rendering', render_progress = 0, captions_enabled = ?, reframe_mode = ?, framing_mode = ?, title = COALESCE(title, ?) WHERE id = ?"
        ).run(captionsEnabled ? 1 : 0, chosenMode, chosenMode, h.title || 'Short Moment', shortId);
        resultingShorts.push(formatShort(existing));
      } else {
        shortId = uuid();
        const shortTitle = h.title || `Moment ${h.rank || shortsToProcess.length + 1}`;
        db.prepare(`
          INSERT INTO shorts (id, project_id, highlight_id, title, framing_mode, start_time, end_time, duration,
            captions_enabled, reframe_mode, status, width, height)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'rendering', ?, ?)
        `).run(shortId, project.id, h.id, shortTitle, chosenMode, startTime, endTime, duration,
          captionsEnabled ? 1 : 0, chosenMode, config.outputWidth, config.outputHeight);
        const newRecord = db.prepare('SELECT * FROM shorts WHERE id = ?').get(shortId);
        resultingShorts.push(formatShort(newRecord));
      }

      shortsToProcess.push({ shortId, highlight: h, startTime, endTime, reframeMode: chosenMode });
    }

    // Dispatch to centralized render queue (executes with strict serialization, zero process piling)
    globalRenderQueue.addBatch(
      shortsToProcess.map((item) => ({
        shortId: item.shortId,
        videoPath: video.file_path,
        projectId: project.id,
        startTime: item.startTime,
        endTime: item.endTime,
        captionsEnabled,
        reframeMode: item.reframeMode,
      }))
    );

    res.json({
      success: true,
      data: {
        queued: shortsToProcess.length,
        total: highlights.length,
        shorts: resultingShorts,
      },
      message: `Batch export started for ${shortsToProcess.length} moments (${highlights.length - shortsToProcess.length} already rendered)`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to batch export shorts' });
  }
});

// GET & POST /api/projects/:id/shorts/download-all — Download all rendered shorts as a ZIP with strict 1-to-1 deduplication
async function handleDownloadAllShorts(req: AuthRequest, res: any) {
  let stagingDir: string | null = null;
  let zipPath: string | null = null;
  try {
    const db = getDb();
    const project = db.prepare('SELECT id, name FROM projects WHERE id = ?').get(req.params.id) as any;
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    // Extract optional explicit shortIds from query or body (e.g. from Preview/Review screen)
    const rawShortIds = req.query.shortIds || req.body?.shortIds;
    let requestedShortIds: string[] | null = null;
    if (rawShortIds) {
      const parsed = Array.isArray(rawShortIds)
        ? rawShortIds.map(String)
        : String(rawShortIds).split(',').map((s) => s.trim()).filter(Boolean);
      // Preserve client ordering while deduplicating any duplicate input IDs
      requestedShortIds = Array.from(new Set(parsed));
    }

    const uniqueClips: Array<{
      id: string;
      title: string;
      highlight_title?: string;
      file_path: string;
      rank?: number;
    }> = [];

    const seenShortIds = new Set<string>();
    const seenFilePaths = new Set<string>();

    if (requestedShortIds && requestedShortIds.length > 0) {
      // ── Explicit Collection: verify each requested clip exactly matches displayed screen ──
      for (const shortId of requestedShortIds) {
        if (seenShortIds.has(shortId)) {
          return res.status(400).json({
            success: false,
            error: `Duplicate clip ID in export request: ${shortId}`,
          });
        }

        const short = db.prepare('SELECT * FROM shorts WHERE id = ? AND project_id = ?').get(shortId, project.id) as any;
        if (!short) {
          return res.status(400).json({
            success: false,
            error: `Clip not found in project: ${shortId}`,
          });
        }

        if (short.status !== 'completed') {
          return res.status(400).json({
            success: false,
            error: `Clip "${short.title || shortId}" is not ready for download (current status: ${short.status})`,
          });
        }

        if (!short.file_path || !fs.existsSync(short.file_path)) {
          return res.status(400).json({
            success: false,
            error: `Clip file missing on disk: ${short.file_path || 'null'} (Clip ID: ${shortId})`,
          });
        }

        const stat = fs.statSync(short.file_path);
        if (stat.size === 0) {
          return res.status(400).json({
            success: false,
            error: `Clip file is empty (0 bytes): ${short.file_path} (Clip ID: ${shortId})`,
          });
        }

        const resolvedPath = path.resolve(short.file_path);
        if (seenFilePaths.has(resolvedPath)) {
          return res.status(400).json({
            success: false,
            error: `Duplicate clip file detected across clips: ${resolvedPath} (Clip ID: ${shortId})`,
          });
        }

        seenShortIds.add(shortId);
        seenFilePaths.add(resolvedPath);

        const highlight = short.highlight_id
          ? (db.prepare('SELECT rank, title FROM highlight_candidates WHERE id = ?').get(short.highlight_id) as any)
          : null;

        uniqueClips.push({
          id: short.id,
          title: short.title || highlight?.title || `Short ${uniqueClips.length + 1}`,
          highlight_title: highlight?.title,
          file_path: short.file_path,
          rank: highlight?.rank,
        });
      }
    } else {
      // ── Automatic Unique Clip Collection (preserving highlight rank & timeline order) ──
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

      // 1. Fetch active highlights in rank order
      const activeHighlights = db.prepare(
        'SELECT id, rank, title, start_time, end_time FROM highlight_candidates WHERE project_id = ? AND is_suppressed = 0 ORDER BY rank ASC, score_total DESC LIMIT ?'
      ).all(project.id, limit) as any[];

      // 2. Fetch all completed shorts for this project
      const allCompletedShorts = db.prepare(
        "SELECT * FROM shorts WHERE project_id = ? AND status = 'completed' AND file_path IS NOT NULL"
      ).all(project.id) as any[];

      // Match each active highlight strictly 1-to-1 with its completed short
      for (const h of activeHighlights) {
        let matchingShort = allCompletedShorts.find(
          (s: any) => s.highlight_id === h.id && !seenShortIds.has(s.id)
        );

        if (!matchingShort) {
          matchingShort = allCompletedShorts.find(
            (s: any) =>
              !s.highlight_id &&
              !seenShortIds.has(s.id) &&
              Math.abs(s.start_time - h.start_time) < 2 &&
              Math.abs(s.end_time - h.end_time) < 2
          );
        }

        if (matchingShort) {
          if (!matchingShort.file_path || !fs.existsSync(matchingShort.file_path)) {
            return res.status(400).json({
              success: false,
              error: `Clip file missing on disk: ${matchingShort.file_path || 'null'} for highlight "${h.title}" (ID: ${matchingShort.id})`,
            });
          }

          const stat = fs.statSync(matchingShort.file_path);
          if (stat.size === 0) {
            return res.status(400).json({
              success: false,
              error: `Clip file is empty (0 bytes): ${matchingShort.file_path} for highlight "${h.title}" (ID: ${matchingShort.id})`,
            });
          }

          const resolvedPath = path.resolve(matchingShort.file_path);
          if (seenFilePaths.has(resolvedPath)) {
            return res.status(400).json({
              success: false,
              error: `Duplicate clip file detected across clips: ${resolvedPath} (Clip ID: ${matchingShort.id})`,
            });
          }

          seenShortIds.add(matchingShort.id);
          seenFilePaths.add(resolvedPath);
          uniqueClips.push({
            id: matchingShort.id,
            title: matchingShort.title || h.title || `Short ${uniqueClips.length + 1}`,
            highlight_title: h.title,
            file_path: matchingShort.file_path,
            rank: h.rank,
          });
        }
      }

      // 3. Include any additional completed shorts not associated with an active highlight (e.g. custom renders)
      const remainingShorts = allCompletedShorts
        .filter((s: any) => !seenShortIds.has(s.id))
        .sort((a: any, b: any) => (a.start_time ?? 0) - (b.start_time ?? 0));

      for (const rem of remainingShorts) {
        if (!rem.file_path || !fs.existsSync(rem.file_path)) {
          return res.status(400).json({
            success: false,
            error: `Clip file missing on disk: ${rem.file_path || 'null'} (Clip ID: ${rem.id})`,
          });
        }

        const stat = fs.statSync(rem.file_path);
        if (stat.size === 0) {
          return res.status(400).json({
            success: false,
            error: `Clip file is empty (0 bytes): ${rem.file_path} (Clip ID: ${rem.id})`,
          });
        }

        const resolvedPath = path.resolve(rem.file_path);
        if (seenFilePaths.has(resolvedPath)) {
          return res.status(400).json({
            success: false,
            error: `Duplicate clip file detected across clips: ${resolvedPath} (Clip ID: ${rem.id})`,
          });
        }

        seenShortIds.add(rem.id);
        seenFilePaths.add(resolvedPath);
        uniqueClips.push({
          id: rem.id,
          title: rem.title || `Short ${uniqueClips.length + 1}`,
          file_path: rem.file_path,
        });
      }
    }

    if (uniqueClips.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No rendered shorts available for download. Please click "Export All" to generate them first.',
      });
    }

    // ── Staging with Order-Preserving Unique Filenames ──
    stagingDir = path.join(config.rendersDir, `zip_stage_${Date.now()}_${project.id.substring(0, 6)}`);
    fs.mkdirSync(stagingDir, { recursive: true });

    for (let idx = 0; idx < uniqueClips.length; idx++) {
      const clip = uniqueClips[idx];
      const humanTitle = clip.title || clip.highlight_title || `Moment ${idx + 1}`;
      const prefix = String(idx + 1).padStart(2, '0');
      const safeFilename = generateSafeFilename(humanTitle, clip.id);
      const destName = `${prefix}_${safeFilename}`;
      const destPath = path.join(stagingDir, destName);

      try {
        fs.copyFileSync(clip.file_path, destPath);
      } catch (copyErr: any) {
        throw new Error(`Failed to stage clip "${destName}": ${copyErr.message}`);
      }

      if (!fs.existsSync(destPath) || fs.statSync(destPath).size === 0) {
        throw new Error(`Staged file verification failed for "${destName}" (file missing or 0 bytes)`);
      }
    }

    // Verify staging directory count
    const stagedFiles = fs.readdirSync(stagingDir).filter((f) => !f.startsWith('.'));
    if (stagedFiles.length !== uniqueClips.length) {
      throw new Error(
        `Staging count mismatch: expected ${uniqueClips.length} unique clips, but ${stagedFiles.length} files were staged.`
      );
    }

    const cleanProjectName = (project.name || 'Project').replace(/[^a-zA-Z0-9_-]/g, '_');
    const zipFilename = `${cleanProjectName}_Best_${uniqueClips.length}_Shorts_916.zip`;
    zipPath = path.join(config.rendersDir, `bundle_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.zip`);

    // ── Package & Verify ZIP ──
    await createAndVerifyZipArchive(stagingDir, zipPath, uniqueClips.length);

    // Clean up staging folder immediately
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
    res.status(400).json({ success: false, error: `Failed to create shorts archive: ${err.message}` });
  }
}

router.get('/projects/:id/shorts/download-all', handleDownloadAllShorts);
router.post('/projects/:id/shorts/download-all', handleDownloadAllShorts);

// POST /api/highlights/:highlightId/generate — Generate short from highlight
router.post('/highlights/:highlightId/generate', async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const highlight = db.prepare('SELECT * FROM highlight_candidates WHERE id = ?')
      .get(req.params.highlightId) as any;

    if (!highlight) {
      return res.status(404).json({ success: false, error: 'Highlight not found' });
    }

    // Verify project exists
    const project = db.prepare('SELECT id FROM projects WHERE id = ?')
      .get(highlight.project_id) as any;

    if (!project) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    // Get video
    const video = db.prepare('SELECT * FROM videos WHERE project_id = ?').get(project.id) as any;
    if (!video) {
      return res.status(400).json({ success: false, error: 'No video found' });
    }

    const {
      captionsEnabled = false,
      reframeMode: requestedMode,
    } = req.body;

    const chosenFraming = (requestedMode && requestedMode !== 'center' && requestedMode !== 'auto')
      ? requestedMode
      : (highlight.framing_mode || 'blur_fill');

    // Use AI-recommended timestamps if available, else use highlight timestamps
    const startTime = highlight.ai_recommended_start > 0
      ? highlight.ai_recommended_start
      : highlight.start_time;
    let endTime = highlight.ai_recommended_end > 0
      ? highlight.ai_recommended_end
      : highlight.end_time;

    // Enforce max duration
    if (endTime - startTime > config.maxShortDuration) {
      endTime = startTime + config.maxShortDuration;
    }

    const existing = db.prepare(
      'SELECT id, file_path FROM shorts WHERE project_id = ? AND highlight_id = ?'
    ).get(project.id, highlight.id) as any;

    const shortId = existing ? existing.id : uuid();
    const duration = endTime - startTime;
    const title = highlight.title || 'Short Moment';

    if (existing) {
      if (existing.file_path && fs.existsSync(existing.file_path)) {
        try { fs.unlinkSync(existing.file_path); } catch {}
      }
      db.prepare(`
        UPDATE shorts SET
          title = ?, framing_mode = ?, reframe_mode = ?, start_time = ?, end_time = ?, duration = ?,
          captions_enabled = ?, status = 'rendering', render_progress = 0, file_path = NULL, updated_at = datetime('now')
        WHERE id = ?
      `).run(title, chosenFraming, chosenFraming, startTime, endTime, duration,
        captionsEnabled ? 1 : 0, shortId);
    } else {
      db.prepare(`
        INSERT INTO shorts (id, project_id, highlight_id, title, framing_mode, start_time, end_time, duration,
          captions_enabled, reframe_mode, status, width, height)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'rendering', ?, ?)
      `).run(shortId, project.id, highlight.id, title, chosenFraming, startTime, endTime, duration,
        captionsEnabled ? 1 : 0, chosenFraming, config.outputWidth, config.outputHeight);
    }

    // Process through centralized queue
    globalRenderQueue.add({
      shortId,
      videoPath: video.file_path,
      projectId: project.id,
      startTime,
      endTime,
      captionsEnabled,
      reframeMode: chosenFraming,
    });

    res.json({
      success: true,
      data: {
        id: shortId,
        status: 'rendering',
        startTime,
        endTime,
        duration,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to generate short' });
  }
});

// GET /api/shorts/:id — Get short detail
router.get('/shorts/:id', (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const short = db.prepare(`
      SELECT s.*, h.title as highlight_title, h.framing_mode as highlight_framing_mode
      FROM shorts s
      LEFT JOIN highlight_candidates h ON s.highlight_id = h.id
      WHERE s.id = ?
    `).get(req.params.id) as any;

    if (!short) {
      return res.status(404).json({ success: false, error: 'Short not found' });
    }

    // Verify project exists
    const project = db.prepare('SELECT id FROM projects WHERE id = ?')
      .get(short.project_id) as any;

    if (!project) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    res.json({
      success: true,
      data: formatShort(short),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to get short' });
  }
});

// GET /api/projects/:id/shorts — List shorts for project
router.get('/projects/:id/shorts', (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const project = db.prepare('SELECT id FROM projects WHERE id = ?')
      .get(req.params.id) as any;

    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const shorts = db.prepare(`
      SELECT s.*, h.title as highlight_title, h.framing_mode as highlight_framing_mode
      FROM shorts s
      LEFT JOIN highlight_candidates h ON s.highlight_id = h.id
      WHERE s.project_id = ?
      ORDER BY s.created_at DESC
    `).all(project.id) as any[];

    // Auto-recover completed files or reset orphaned renders from prior server restarts
    const renderDir = getRenderDir(project.id);
    for (const sh of shorts) {
      if (sh.status === 'rendering') {
        const possibleFiles = [
          sh.file_path,
          path.join(renderDir, `short_${sh.id}.mp4`),
          path.join(renderDir, `final_${sh.id}.mp4`),
          path.join(renderDir, `vertical_${sh.id}.mp4`),
        ].filter(Boolean);
        const foundFile = possibleFiles.find((p) => p && fs.existsSync(p) && fs.statSync(p).size > 1000);

        if (foundFile) {
          sh.status = 'completed';
          sh.file_path = foundFile;
          sh.render_progress = 100;
          db.prepare("UPDATE shorts SET status = 'completed', file_path = ?, render_progress = 100 WHERE id = ?").run(foundFile, sh.id);
        } else if (!activeRenderingShortIds.has(sh.id)) {
          // Orphaned render from before server restart — reset to idle so user can click Render
          sh.status = 'idle';
          sh.render_progress = 0;
          db.prepare("UPDATE shorts SET status = 'idle', render_progress = 0 WHERE id = ?").run(sh.id);
        }
      }
    }

    // Ensure 1 latest short per highlight
    const seenHighlightIds = new Set<string>();
    const deduplicatedShorts: any[] = [];
    for (const sh of shorts) {
      if (sh.highlight_id) {
        if (seenHighlightIds.has(sh.highlight_id)) continue;
        seenHighlightIds.add(sh.highlight_id);
      }
      deduplicatedShorts.push(sh);
    }

    res.json({
      success: true,
      data: deduplicatedShorts.map(formatShort),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to get shorts' });
  }
});

// POST /api/projects/:id/shorts/reset-stuck — Reset any stuck rendering jobs
router.post('/projects/:id/shorts/reset-stuck', (req: AuthRequest, res) => {
  try {
    const db = getDb();
    globalRenderQueue.killAll();
    activeRenderingShortIds.clear();
    db.prepare("UPDATE shorts SET status = 'idle', render_progress = 0 WHERE project_id = ? AND status = 'rendering'").run(req.params.id);
    res.json({ success: true, message: 'Stuck renders reset to idle' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to reset renders' });
  }
});

// PATCH /api/shorts/:id — Update short (adjust start/end)
router.patch('/shorts/:id', async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const short = db.prepare('SELECT * FROM shorts WHERE id = ?').get(req.params.id) as any;

    if (!short) {
      return res.status(404).json({ success: false, error: 'Short not found' });
    }

    const project = db.prepare('SELECT id FROM projects WHERE id = ?')
      .get(short.project_id) as any;

    if (!project) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const { startTime, endTime, captionsEnabled, reframeMode, title } = req.body;

    const updates: string[] = [];
    const values: any[] = [];

    if (title !== undefined) { updates.push('title = ?'); values.push(title); }
    if (startTime !== undefined) { updates.push('start_time = ?'); values.push(startTime); }
    if (endTime !== undefined) { updates.push('end_time = ?'); values.push(endTime); }
    if (captionsEnabled !== undefined) { updates.push('captions_enabled = ?'); values.push(captionsEnabled ? 1 : 0); }
    if (reframeMode !== undefined) {
      updates.push('reframe_mode = ?'); values.push(reframeMode);
      updates.push('framing_mode = ?'); values.push(reframeMode);
    }

    if (startTime !== undefined || endTime !== undefined) {
      const newStart = startTime ?? short.start_time;
      const newEnd = endTime ?? short.end_time;
      updates.push('duration = ?');
      values.push(newEnd - newStart);
    }

    updates.push("updated_at = datetime('now')");
    values.push(short.id);

    db.prepare(`UPDATE shorts SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    const updated = db.prepare(`
      SELECT s.*, h.title as highlight_title, h.framing_mode as highlight_framing_mode
      FROM shorts s
      LEFT JOIN highlight_candidates h ON s.highlight_id = h.id
      WHERE s.id = ?
    `).get(short.id) as any;

    res.json({
      success: true,
      data: formatShort(updated),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to update short' });
  }
});

// POST /api/shorts/:id/export — Re-render and export
router.post('/shorts/:id/export', async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const short = db.prepare('SELECT * FROM shorts WHERE id = ?').get(req.params.id) as any;

    if (!short) {
      return res.status(404).json({ success: false, error: 'Short not found' });
    }

    const project = db.prepare('SELECT id FROM projects WHERE id = ?')
      .get(short.project_id) as any;

    if (!project) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const video = db.prepare('SELECT * FROM videos WHERE project_id = ?').get(project.id) as any;
    if (!video) {
      return res.status(400).json({ success: false, error: 'No video found' });
    }

    // Re-render via queue
    db.prepare("UPDATE shorts SET status = 'rendering', render_progress = 0 WHERE id = ?").run(short.id);

    globalRenderQueue.add({
      shortId: short.id,
      videoPath: video.file_path,
      projectId: project.id,
      startTime: short.start_time,
      endTime: short.end_time,
      captionsEnabled: !!short.captions_enabled,
      reframeMode: short.reframe_mode,
    });

    res.json({ success: true, data: { status: 'rendering' } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Export failed' });
  }
});

// GET /api/shorts/:id/download — Download short file
router.get('/shorts/:id/download', (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const short = db.prepare('SELECT * FROM shorts WHERE id = ?').get(req.params.id) as any;

    if (!short || !short.file_path) {
      return res.status(404).json({ success: false, error: 'Short not found or not yet rendered' });
    }

    const project = db.prepare('SELECT id, name FROM projects WHERE id = ?')
      .get(short.project_id) as any;

    if (!project) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    if (!fs.existsSync(short.file_path)) {
      return res.status(404).json({ success: false, error: 'File not found on disk' });
    }

    const highlight = short.highlight_id
      ? db.prepare('SELECT rank, score_total, title FROM highlight_candidates WHERE id = ?').get(short.highlight_id) as any
      : null;

    const shortTitle = short.title || highlight?.title || `Short ${short.id.substring(0, 6)}`;
    const filename = generateSafeFilename(shortTitle, short.id);

    res.download(short.file_path, filename);
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Download failed' });
  }
});

// DELETE /api/shorts/:id — Delete generated short
router.delete('/shorts/:id', (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const short = db.prepare('SELECT * FROM shorts WHERE id = ?').get(req.params.id) as any;

    if (!short) {
      return res.status(404).json({ success: false, error: 'Short not found' });
    }

    const project = db.prepare('SELECT id FROM projects WHERE id = ?')
      .get(short.project_id) as any;

    if (!project) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    // Delete render file if exists
    if (short.file_path && fs.existsSync(short.file_path)) {
      try { fs.unlinkSync(short.file_path); } catch {}
    }

    db.prepare('DELETE FROM shorts WHERE id = ?').run(short.id);

    res.json({ success: true, message: 'Short deleted' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to delete short' });
  }
});


// ── Zip Archive Creation Helper (delegates to zipService with verification) ──

export { createAndVerifyZipArchive, listZipEntries };

export async function createZipArchive(sourceDir: string, zipPath: string): Promise<void> {
  const files = fs.readdirSync(sourceDir).filter((f) => !f.startsWith('.') && fs.statSync(path.join(sourceDir, f)).isFile());
  await createAndVerifyZipArchive(sourceDir, zipPath, files.length);
}

// ── Async Short Generation ──

async function generateShortAsync(
  shortId: string,
  videoPath: string,
  projectId: string,
  startTime: number,
  endTime: number,
  captionsEnabled: boolean,
  reframeMode: string
): Promise<void> {
  const db = getDb();
  activeRenderingShortIds.add(shortId);

  try {
    const renderDir = getRenderDir(projectId);
    const finalPath = path.join(renderDir, `short_${shortId}.mp4`);

    const currentShort = db.prepare('SELECT reframe_mode, framing_mode, status FROM shorts WHERE id = ?').get(shortId) as any;
    const requestedMode = (reframeMode === 'auto' || !reframeMode)
      ? (currentShort?.reframe_mode || currentShort?.framing_mode || 'blur_fill')
      : reframeMode;

    // Check if output or prior vertical already exists with the exact same framing mode
    const existingFile = [
      finalPath,
      path.join(renderDir, `final_${shortId}.mp4`),
      path.join(renderDir, `vertical_${shortId}.mp4`),
    ].find((p) => fs.existsSync(p) && fs.statSync(p).size > 0);

    if (existingFile && (currentShort?.reframe_mode === requestedMode || currentShort?.framing_mode === requestedMode) && (currentShort?.status === 'completed' || fs.statSync(existingFile).size > 10000)) {
      const stat = fs.statSync(existingFile);
      db.prepare(`
        UPDATE shorts SET
          status = 'completed',
          render_progress = 100,
          file_path = ?,
          file_size = ?,
          updated_at = datetime('now')
        WHERE id = ?
      `).run(existingFile, stat.size, shortId);
      broadcastShortProgress(projectId, shortId, 100, 'completed');
      return;
    }

    // If changing framing mode or re-rendering, delete stale files to render fresh
    if (existingFile) {
      try { fs.unlinkSync(existingFile); } catch {}
    }

    const shortRecord = db.prepare('SELECT highlight_id FROM shorts WHERE id = ?').get(shortId) as any;
    const highlight = shortRecord?.highlight_id
      ? db.prepare('SELECT * FROM highlight_candidates WHERE id = ?').get(shortRecord.highlight_id) as any
      : null;

    const effectiveReframeMode = (reframeMode === 'auto' || !reframeMode)
      ? (currentShort?.reframe_mode || currentShort?.framing_mode || highlight?.framing_mode || 'blur_fill')
      : reframeMode;

    let smartCrop: any = null;

    // Step 1: Visual Framing (Lossless Blur is 100% full frame - skip OpenCV Python spawn!)
    if (effectiveReframeMode !== 'blur_fill') {
      db.prepare("UPDATE shorts SET render_progress = 15 WHERE id = ?").run(shortId);
      broadcastShortProgress(projectId, shortId, 15, 'framing');

      const precomputedMode = highlight?.framing_mode;
      const precomputedCropX = highlight?.crop_offset_x;

      if (precomputedMode && precomputedCropX !== undefined && precomputedCropX !== null) {
        const scaledW = Math.round(1920 * (config.outputHeight / 1080));
        const maxCropX = Math.max(0, scaledW - config.outputWidth);
        smartCrop = {
          recommendedMode: precomputedMode,
          cropOffsetX: precomputedCropX,
          cropPixelsX: Math.round(precomputedCropX * maxCropX),
          cropExpr: `scale=-1:${config.outputHeight}:force_original_aspect_ratio=increase:flags=bicubic,crop=${config.outputWidth}:${config.outputHeight}:${Math.round(precomputedCropX * maxCropX)}:0,setsar=1`,
        };
      } else {
        try {
          smartCrop = await computeSmartFraming(
            videoPath,
            startTime,
            endTime,
            config.outputWidth,
            config.outputHeight
          );
        } catch (cropErr) {
          console.warn('Smart framing fallback:', cropErr);
        }
      }
    }

    // Step 2: Subtitle captions generation (only if speech is present)
    let srtPath: string | null = null;
    if (captionsEnabled) {
      srtPath = await generateClipCaptions(projectId, startTime, endTime, shortId);
    }

    // Step 3: Single-pass direct smart render (fast optical blur + 30fps + captions)
    db.prepare("UPDATE shorts SET render_progress = 35, framing_mode = ?, reframe_mode = ? WHERE id = ?").run(effectiveReframeMode, effectiveReframeMode, shortId);
    broadcastShortProgress(projectId, shortId, 35, 'rendering');

    await renderShortDirect(videoPath, finalPath, startTime, endTime, {
      width: config.outputWidth,
      height: config.outputHeight,
      fps: config.outputFps,
      srtPath,
      cropX: smartCrop?.cropPixelsX,
      cropExpr: smartCrop?.cropExpr,
      reframeMode: effectiveReframeMode,
      blurFillExpr: smartCrop?.blurFillExpr,
      onProc: (proc) => globalRenderQueue.registerProcess(shortId, proc),
      onProgress: (percent) => {
        const mappedProgress = Math.min(98, 40 + Math.round(percent * 0.58));
        db.prepare("UPDATE shorts SET render_progress = ? WHERE id = ?").run(mappedProgress, shortId);
        broadcastShortProgress(projectId, shortId, mappedProgress, 'rendering');
      },
    });

    // Step 4: Validate output file
    const stat = fs.statSync(finalPath);

    // Update record
    db.prepare(`
      UPDATE shorts SET
        status = 'completed',
        render_progress = 100,
        file_path = ?,
        file_size = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(finalPath, stat.size, shortId);
    broadcastShortProgress(projectId, shortId, 100, 'completed');

  } catch (err: any) {
    console.error(`Short generation failed for ${shortId}:`, err.message);
    db.prepare("UPDATE shorts SET status = 'failed', error = ? WHERE id = ?")
      .run(err.message, shortId);
    broadcastShortProgress(projectId, shortId, 0, 'failed');
    throw err;
  } finally {
    activeRenderingShortIds.delete(shortId);
  }
}

async function generateClipCaptions(
  projectId: string,
  startTime: number,
  endTime: number,
  shortId: string
): Promise<string | null> {
  const db = getDb();
  const transcript = db.prepare('SELECT id FROM transcripts WHERE project_id = ?').get(projectId) as any;
  if (!transcript) return null;

  const segments = db.prepare(`
    SELECT * FROM transcript_segments
    WHERE transcript_id = ? AND start_time < ? AND end_time > ?
    ORDER BY start_time
  `).all(transcript.id, endTime, startTime) as any[];

  if (segments.length === 0) return null;

  // Generate clean, short SRT lines (max 4-5 words per entry)
  const srtLines: string[] = [];
  let entryIdx = 1;
  segments.forEach((seg: any) => {
    const text = (seg.text || '').trim();
    if (!text) return;

    const relStart = Math.max(0, seg.start_time - startTime);
    const relEnd = Math.min(endTime - startTime, seg.end_time - startTime);
    if (relEnd <= relStart) return;

    const words = text.split(/\s+/);
    if (words.length <= 5) {
      srtLines.push(`${entryIdx++}`);
      srtLines.push(`${formatSRTTime(relStart)} --> ${formatSRTTime(relEnd)}`);
      srtLines.push(words.join(' '));
      srtLines.push('');
    } else {
      const mid = Math.ceil(words.length / 2);
      srtLines.push(`${entryIdx++}`);
      srtLines.push(`${formatSRTTime(relStart)} --> ${formatSRTTime(relEnd)}`);
      srtLines.push(`${words.slice(0, mid).join(' ')}\n${words.slice(mid).join(' ')}`);
      srtLines.push('');
    }
  });

  if (srtLines.length === 0) return null;

  const captionsDir = getProjectCaptionsDir(projectId);
  const srtPath = path.join(captionsDir, `captions_${shortId}.srt`);
  fs.writeFileSync(srtPath, srtLines.join('\n'), 'utf-8');

  return srtPath;
}

function formatSRTTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function formatShort(row: any) {
  return {
    id: row.id,
    projectId: row.project_id,
    highlightId: row.highlight_id,
    title: row.title || row.highlight_title || '',
    framingMode: row.framing_mode || row.highlight_framing_mode || row.reframe_mode || 'action',
    startTime: row.start_time,
    endTime: row.end_time,
    duration: row.duration,
    filePath: row.file_path,
    fileSize: row.file_size,
    width: row.width,
    height: row.height,
    captionsEnabled: !!row.captions_enabled,
    captionStyle: row.caption_style ? JSON.parse(row.caption_style) : null,
    reframeMode: row.reframe_mode || row.framing_mode || 'action',
    status: row.status,
    renderProgress: row.render_progress,
    error: row.error,
    thumbnailUrl: row.thumbnail_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export default router;
