// ============================================================
// Voiceover Routes — AI Visual Director Production Workflow
// Handles voiceover upload, footage indexing, timeline generation,
// locked segment management, alternatives, and master rendering.
// ============================================================

import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuid } from 'uuid';
import { voiceoverStore } from '../services/voiceover/VoiceoverStore.js';
import { voiceoverAnalyzer } from '../services/voiceover/VoiceoverAnalyzer.js';
import { footageAnalyzer } from '../services/voiceover/FootageAnalyzer.js';
import { aiDirector } from '../services/voiceover/AIDirector.js';
import { semanticVisualMatcher } from '../services/voiceover/SemanticVisualMatcher.js';
import { voiceoverQualityGate } from '../services/voiceover/VoiceoverQualityGate.js';
import { voiceoverRenderer } from '../services/voiceover/VoiceoverRenderer.js';
import { extractMetadata } from '../services/ffmpeg.js';
import {
  getVoiceoverAudioDir,
  getVoiceoverFootageDir,
  ensureDir,
} from '../services/storage.js';
import { SUPPORTED_VOICEOVER_EXTENSIONS } from '../../../shared/constants.js';
import type {
  VoiceoverMatchingMode,
  VoiceoverOutputAspectRatio,
  VoiceoverTimelineShot,
  FootageAsset,
  VisualFootageIndex,
} from '../../../shared/types.js';

const router = Router();

// Helper to get string projectId safely
function getProjectId(req: Request): string {
  const p = req.params.id;
  return Array.isArray(p) ? p[0] : (p as string);
}

// WebSocket broadcast handle
let wsBroadcast: ((projectId: string, data: any) => void) | null = null;

export function setVoiceoverWebSocketBroadcast(fn: (projectId: string, data: any) => void) {
  wsBroadcast = fn;
}

function broadcastProgress(
  projectId: string,
  progress: number,
  stage: string,
  detail?: string,
  status: 'setup' | 'analyzing' | 'timeline_ready' | 'rendering' | 'completed' | 'failed' = 'analyzing'
) {
  voiceoverStore.updateProject(projectId, {
    renderProgress: progress,
    renderStage: stage,
    renderDetail: detail,
    status,
  });

  if (wsBroadcast) {
    wsBroadcast(projectId, {
      type: 'voiceover_progress',
      payload: {
        projectId,
        progress,
        stage,
        detail,
        status,
      },
    });
  }
}

// ── Multer Storage Configurations ──

// Audio upload storage (direct disk streaming)
const audioDiskStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const projectId = getProjectId(req);
    const dir = getVoiceoverAudioDir(projectId);
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique = `voice_${Date.now()}_${uuid().slice(0, 6)}${ext}`;
    cb(null, unique);
  },
});

const AUDIO_EXTENSIONS = new Set([
  '.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg',
  '.wma', '.opus', '.mp4', '.webm', '.mov', '.mkv',
]);

const audioUpload = multer({
  storage: audioDiskStorage,
  limits: { fileSize: 1024 * 1024 * 500 }, // 500MB max audio
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (AUDIO_EXTENSIONS.has(ext)) {
      cb(null, true);
    } else {
      // Reject file without terminating HTTP socket
      cb(null, false);
    }
  },
});

// Footage clips upload storage (direct disk streaming preserving original quality)
const footageDiskStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const projectId = getProjectId(req);
    const dir = getVoiceoverFootageDir(projectId);
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const sanitized = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const unique = `${path.basename(sanitized, ext)}_${Date.now()}_${uuid().slice(0, 4)}${ext}`;
    cb(null, unique);
  },
});

const footageUpload = multer({
  storage: footageDiskStorage,
  limits: { fileSize: 1024 * 1024 * 1024 * 10 }, // 10GB per clip
});

// ── Project Management Endpoints ──

// POST /api/voiceover/projects — Create new project
router.post('/projects', (_req: Request, res: Response) => {
  try {
    const projectId = `vo_${uuid().slice(0, 10)}`;
    const project = voiceoverStore.createProject(projectId);
    res.status(201).json({ success: true, data: project });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/voiceover/projects — List projects
router.get('/projects', (_req: Request, res: Response) => {
  try {
    const projects = voiceoverStore.listProjects();
    res.json({ success: true, data: projects });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/voiceover/:id/state — Get state
router.get('/:id/state', (req: Request, res: Response) => {
  try {
    const projectId = getProjectId(req);
    const project = voiceoverStore.getProject(projectId);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Voiceover project not found' });
    }
    res.json({ success: true, data: project });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/voiceover/:id — Delete project
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const projectId = getProjectId(req);
    const ok = voiceoverStore.deleteProject(projectId);
    res.json({ success: ok });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Upload Endpoints ──

// POST /api/voiceover/:id/upload-voiceover — Upload narration audio
router.post(
  '/:id/upload-voiceover',
  audioUpload.single('voiceover'),
  async (req: Request, res: Response) => {
    try {
      const projectId = getProjectId(req);
      let project = voiceoverStore.getProject(projectId);
      if (!project) {
        project = voiceoverStore.createProject(projectId);
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No audio file provided or unsupported format. Supported: MP3, WAV, M4A, AAC, FLAC, OGG, OPUS, MP4, WEBM.',
        });
      }

      const filePath = req.file.path;
      const meta = await extractMetadata(filePath).catch(() => ({
        duration: 0,
        sampleRate: 44100,
        channels: 2,
        codec: 'unknown',
      }));

      const voiceoverData = {
        id: `voice_${uuid().slice(0, 8)}`,
        filename: req.file.filename,
        originalFilename: req.file.originalname,
        filePath,
        duration: meta.duration || 0,
        format: path.extname(req.file.originalname).slice(1),
        sampleRate: (meta as any).sampleRate || 44100,
        channels: (meta as any).channels || 2,
        status: 'ready' as const,
      };

      const updated = voiceoverStore.updateProject(projectId, {
        voiceover: voiceoverData,
        // Reset downstream results on new voiceover upload
        transcription: undefined,
        timeline: undefined,
        qualityReport: undefined,
        status: 'setup',
      });

      res.status(201).json({ success: true, data: updated.voiceover });
    } catch (err: any) {
      res.status(500).json({ success: false, error: 'Audio upload failed: ' + err.message });
    }
  }
);

// POST /api/voiceover/:id/upload-footage — Upload footage clips (up to 200+ clips)
router.post(
  '/:id/upload-footage',
  footageUpload.array('footage', 250),
  async (req: Request, res: Response) => {
    try {
      const projectId = getProjectId(req);
      let project = voiceoverStore.getProject(projectId);
      if (!project) {
        project = voiceoverStore.createProject(projectId);
      }

      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ success: false, error: 'No video files uploaded' });
      }

      const existingIndex = project.footageIndex || [];
      const newClips: FootageAsset[] = [];

      for (const file of files) {
        try {
          const meta = await extractMetadata(file.path);
          const clipId = `clip_${uuid().slice(0, 8)}`;

          newClips.push({
            clipId,
            projectId,
            filename: file.filename,
            originalFilename: file.originalname,
            sourceFile: file.path,
            fileSize: file.size,
            duration: meta.duration,
            width: meta.width,
            height: meta.height,
            fps: meta.fps,
            codec: meta.codec,
            visualSegments: [],
            visualTags: [path.basename(file.originalname, path.extname(file.originalname))],
            qualityScore: 85,
            usageCount: 0,
            matchCount: 0,
            analysisStatus: 'pending',
            createdAt: new Date().toISOString(),
          });
        } catch (err) {
          console.error(`Failed to probe uploaded clip ${file.originalname}:`, err);
        }
      }

      const mergedClips = [...existingIndex, ...newClips];
      const updated = voiceoverStore.updateProject(projectId, {
        footageIndex: mergedClips,
      });

      res.status(201).json({
        success: true,
        data: {
          uploadedCount: newClips.length,
          totalClips: mergedClips.length,
          clips: updated.footageIndex,
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: 'Footage upload failed: ' + err.message });
    }
  }
);

// ── Intelligence & Analysis Endpoints ──

// POST /api/voiceover/:id/analyze-voiceover — Transcribe and segment voiceover
router.post('/:id/analyze-voiceover', async (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  const project = voiceoverStore.getProject(projectId);

  if (!project || !project.voiceover) {
    return res.status(400).json({ success: false, error: 'No voiceover uploaded for this project' });
  }

  // Acknowledge request immediately; analysis runs with WebSocket progress updates
  res.json({ success: true, message: 'Voiceover analysis initiated' });

  (async () => {
    try {
      const voiceover = project.voiceover;
      if (!voiceover) return;

      broadcastProgress(projectId, 5, 'transcribing', 'Transcribing audio with Whisper speech recognition...', 'analyzing');

      const analysis = await voiceoverAnalyzer.analyzeVoiceover(
        voiceover.filePath,
        projectId,
        (pct, detail) => {
          broadcastProgress(projectId, pct, 'transcribing', detail, 'analyzing');
        }
      );

      voiceoverStore.updateProject(projectId, {
        transcription: {
          language: analysis.language,
          fullText: analysis.fullText,
          segments: analysis.segments,
          wordCount: analysis.summary.wordCount,
        },
        voiceover: {
          ...voiceover,
          duration: analysis.duration || voiceover.duration,
          status: 'transcribed',
        },
        status: project.footageIndex.length > 0 ? 'analyzing' : 'setup',
      });

      broadcastProgress(projectId, 100, 'transcription_complete', `Analyzed ${analysis.segments.length} narration segments.`, 'setup');
    } catch (err: any) {
      console.error(`[VoiceoverRoute] Voiceover analysis failed for ${projectId}:`, err);
      broadcastProgress(projectId, 0, 'error', `Voiceover analysis failed: ${err.message}`, 'failed');
    }
  })();
});

// POST /api/voiceover/:id/analyze-footage — Multi-level vision indexing
router.post('/:id/analyze-footage', async (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  const project = voiceoverStore.getProject(projectId);

  if (!project || project.footageIndex.length === 0) {
    return res.status(400).json({ success: false, error: 'No footage clips uploaded to index' });
  }

  res.json({ success: true, message: 'Footage indexing initiated' });

  (async () => {
    try {
      broadcastProgress(projectId, 5, 'indexing_footage', `Indexing ${project.footageIndex.length} footage assets...`, 'analyzing');

      const clipFiles = project.footageIndex.map((c) => ({
        clipId: c.clipId,
        filePath: c.sourceFile,
        originalFilename: c.originalFilename,
      }));

      const index = await footageAnalyzer.analyzeClipsCollection(
        projectId,
        clipFiles,
        project.footageIndex,
        (pct: number, detail: string) => {
          broadcastProgress(projectId, pct, 'indexing_footage', detail, 'analyzing');
        }
      );

      voiceoverStore.updateProject(projectId, {
        footageIndex: index.clips,
        status: project.transcription ? 'timeline_ready' : 'setup',
      });

      broadcastProgress(projectId, 100, 'indexing_complete', `Indexed ${index.totalSegments} visual segments across ${index.clips.length} clips.`, 'setup');
    } catch (err: any) {
      console.error(`[VoiceoverRoute] Footage analysis failed for ${projectId}:`, err);
      broadcastProgress(projectId, 0, 'error', `Footage analysis failed: ${err.message}`, 'failed');
    }
  })();
});

// ── Timeline Generation & Editorial Control ──

// POST /api/voiceover/:id/generate-timeline — AI Visual Director generates timeline
router.post('/:id/generate-timeline', async (req: Request, res: Response) => {
  try {
    const projectId = getProjectId(req);
    const project = voiceoverStore.getProject(projectId);

    if (!project || !project.transcription || !project.voiceover) {
      return res.status(400).json({ success: false, error: 'Voiceover must be analyzed before generating timeline' });
    }

    if (!project.footageIndex || project.footageIndex.length === 0) {
      return res.status(400).json({ success: false, error: 'Footage must be uploaded before generating timeline' });
    }

    const {
      matchingMode = 'balanced',
      outputAspectRatio = '16:9',
      captionsEnabled = true,
    } = req.body;

    const segments = project.transcription.segments;
    const duration = project.voiceover.duration;

    // Build VisualFootageIndex structure
    const totalSegments = project.footageIndex.reduce((sum, c) => sum + (c.visualSegments?.length || 0), 0);
    const footageIndex: VisualFootageIndex = {
      projectId,
      totalClips: project.footageIndex.length,
      totalDuration: project.footageIndex.reduce((sum, c) => sum + (c.duration || 0), 0),
      totalSegments,
      clips: project.footageIndex,
      indexedAt: new Date().toISOString(),
    };

    broadcastProgress(projectId, 20, 'director_planning', 'AI Visual Director generating synchronized shot timeline...', 'analyzing');

    const timeline = aiDirector.generateTimeline(
      projectId,
      project.voiceover.id,
      segments,
      footageIndex,
      duration,
      {
        matchingMode: matchingMode as VoiceoverMatchingMode,
        outputAspectRatio: outputAspectRatio as VoiceoverOutputAspectRatio,
        captionsEnabled,
      }
    );

    // Run 12-point Quality Gate audit
    const qualityReport = voiceoverQualityGate.evaluateTimeline(timeline, project.footageIndex, duration);

    const updated = voiceoverStore.updateProject(projectId, {
      timeline,
      qualityReport,
      status: 'timeline_ready',
    });

    broadcastProgress(projectId, 100, 'timeline_ready', `Timeline generated with ${timeline.segments.reduce((acc, s) => acc + s.shots.length, 0)} shots. Score: ${qualityReport.productionReadinessScore}/100`, 'timeline_ready');

    res.json({
      success: true,
      data: {
        timeline: updated.timeline,
        qualityReport: updated.qualityReport,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Timeline generation failed: ' + err.message });
  }
});

// POST /api/voiceover/:id/regenerate-timeline — Regenerate unlocked segments only
router.post('/:id/regenerate-timeline', async (req: Request, res: Response) => {
  try {
    const projectId = getProjectId(req);
    const project = voiceoverStore.getProject(projectId);

    if (!project || !project.timeline || !project.transcription || !project.voiceover) {
      return res.status(400).json({ success: false, error: 'Existing timeline and transcription required to regenerate' });
    }

    const { matchingMode, outputAspectRatio } = req.body;
    const totalSegments = project.footageIndex.reduce((sum, c) => sum + (c.visualSegments?.length || 0), 0);
    const footageIndex: VisualFootageIndex = {
      projectId,
      totalClips: project.footageIndex.length,
      totalDuration: project.footageIndex.reduce((sum, c) => sum + (c.duration || 0), 0),
      totalSegments,
      clips: project.footageIndex,
      indexedAt: new Date().toISOString(),
    };

    const regenerated = aiDirector.generateTimeline(
      projectId,
      project.voiceover.id,
      project.transcription.segments,
      footageIndex,
      project.voiceover.duration,
      {
        matchingMode: matchingMode || project.timeline.matchingMode,
        outputAspectRatio: outputAspectRatio || project.timeline.outputAspectRatio,
        existingTimeline: project.timeline, // Strictly preserves locked shots!
        captionsEnabled: project.timeline.captionsEnabled,
      }
    );

    const qualityReport = voiceoverQualityGate.evaluateTimeline(regenerated, project.footageIndex, project.voiceover.duration);

    const updated = voiceoverStore.updateProject(projectId, {
      timeline: regenerated,
      qualityReport,
      status: 'timeline_ready',
    });

    res.json({
      success: true,
      data: {
        timeline: updated.timeline,
        qualityReport: updated.qualityReport,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Regeneration failed: ' + err.message });
  }
});

// GET /api/voiceover/:id/alternatives/:shotId — "Find Better Clip" alternatives
router.get('/:id/alternatives/:shotId', (req: Request, res: Response) => {
  try {
    const projectId = getProjectId(req);
    const shotId = req.params.shotId as string;
    const project = voiceoverStore.getProject(projectId);

    if (!project || !project.timeline || !project.transcription) {
      return res.status(404).json({ success: false, error: 'Project or timeline not found' });
    }

    // Locate the shot and its corresponding narration segment
    let foundShot: VoiceoverTimelineShot | null = null;
    let foundSegment: any = null;

    for (const seg of project.timeline.segments) {
      for (const sh of seg.shots) {
        if (sh.shotId === shotId) {
          foundShot = sh;
          foundSegment = seg;
          break;
        }
      }
      if (foundShot) break;
    }

    if (!foundShot || !foundSegment) {
      return res.status(404).json({ success: false, error: 'Shot not found on timeline' });
    }

    // Retrieve matching NarrationSegment for semantic context
    const narrSeg = project.transcription.segments.find(s => s.segmentId === foundSegment.segmentId) || {
      segmentId: foundSegment.segmentId,
      start: foundSegment.voiceStart,
      end: foundSegment.voiceEnd,
      duration: foundSegment.duration,
      text: foundSegment.text,
      cleanText: foundSegment.text,
      keywords: [],
      entities: [],
      visualTags: [],
      actions: [],
      environment: [],
      narrativeConcepts: [],
      shotCharacteristics: ['medium'],
      sentiment: 'neutral',
      narrativePurpose: foundSegment.narrativePurpose || 'narrative',
      speechRateWpm: 140,
      visualChangeTrigger: false,
    };

    const totalSegments = project.footageIndex.reduce((sum, c) => sum + (c.visualSegments?.length || 0), 0);
    const footageIndex: VisualFootageIndex = {
      projectId,
      totalClips: project.footageIndex.length,
      totalDuration: project.footageIndex.reduce((sum, c) => sum + (c.duration || 0), 0),
      totalSegments,
      clips: project.footageIndex,
      indexedAt: new Date().toISOString(),
    };

    const candidates = semanticVisualMatcher.findBestCandidates(
      narrSeg as any,
      footageIndex,
      {
        mode: project.timeline.matchingMode || 'balanced',
        clipUsageCount: new Map(),
        lastUsedTimestamp: new Map(),
        currentTimelineTime: foundShot.timelineStart,
      },
      15
    );

    res.json({
      success: true,
      data: {
        shotId,
        currentShot: foundShot,
        alternatives: candidates.slice(0, 15), // Return top 15 candidates
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch alternatives: ' + err.message });
  }
});

// PATCH /api/voiceover/:id/timeline/shot/:shotId — Lock/unlock or manual override clip
router.patch('/:id/timeline/shot/:shotId', (req: Request, res: Response) => {
  try {
    const projectId = getProjectId(req);
    const shotId = req.params.shotId as string;
    const project = voiceoverStore.getProject(projectId);

    if (!project || !project.timeline) {
      return res.status(404).json({ success: false, error: 'Project timeline not found' });
    }

    const {
      isLocked,
      clipId,
      sourceStart,
      sourceEnd,
      framingMode,
      cropOffsetX,
      scaleFactor,
    } = req.body;

    let targetShot: VoiceoverTimelineShot | null = null;
    const clipsMap = new Map(project.footageIndex.map(c => [c.clipId, c]));

    for (const seg of project.timeline.segments) {
      for (const sh of seg.shots) {
        if (sh.shotId === shotId) {
          targetShot = sh;

          // Toggle lock state
          if (typeof isLocked === 'boolean') {
            sh.isLocked = isLocked;
          }

          // Manual clip replacement
          if (clipId && clipId !== sh.clipId) {
            const clip = clipsMap.get(clipId);
            if (clip) {
              sh.clipId = clipId;
              sh.clipFilename = clip.originalFilename;
              sh.sourceFile = clip.sourceFile;
              sh.sourceStart = typeof sourceStart === 'number' ? sourceStart : 0;
              sh.sourceEnd = typeof sourceEnd === 'number' ? sourceEnd : sh.sourceStart + sh.duration;
              sh.isManualOverride = true;
              sh.isLocked = true; // Auto-lock manually replaced shots
              sh.reasons = ['Manual Director Override'];
              sh.matchScore = 95;
              sh.confidence = 0.95;
              sh.isLowConfidence = false;
            }
          }

          if (typeof sourceStart === 'number') sh.sourceStart = sourceStart;
          if (typeof sourceEnd === 'number') sh.sourceEnd = sourceEnd;
          if (framingMode) sh.framingMode = framingMode;
          if (typeof cropOffsetX === 'number') sh.cropOffsetX = cropOffsetX;
          if (typeof scaleFactor === 'number') sh.scaleFactor = scaleFactor;

          break;
        }
      }
      if (targetShot) break;
    }

    if (!targetShot) {
      return res.status(404).json({ success: false, error: 'Shot not found' });
    }

    // Re-evaluate Quality Gate
    const qualityReport = voiceoverQualityGate.evaluateTimeline(
      project.timeline,
      project.footageIndex,
      project.voiceover?.duration || project.timeline.duration
    );

    voiceoverStore.updateProject(projectId, {
      timeline: project.timeline,
      qualityReport,
    });

    res.json({
      success: true,
      data: {
        shot: targetShot,
        qualityReport,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to update shot: ' + err.message });
  }
});

// GET /api/voiceover/:id/quality-report — Fetch Quality Gate report
router.get('/:id/quality-report', (req: Request, res: Response) => {
  try {
    const projectId = getProjectId(req);
    const project = voiceoverStore.getProject(projectId);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    if (!project.timeline) {
      return res.status(400).json({ success: false, error: 'No timeline generated yet' });
    }

    const report = voiceoverQualityGate.evaluateTimeline(
      project.timeline,
      project.footageIndex,
      project.voiceover?.duration || project.timeline.duration
    );

    voiceoverStore.updateProject(projectId, { qualityReport: report });
    res.json({ success: true, data: report });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Rendering & Master Video Endpoints ──

// POST /api/voiceover/:id/render — Render master video directly from original media
router.post('/:id/render', async (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  const project = voiceoverStore.getProject(projectId);

  if (!project || !project.timeline || !project.voiceover) {
    return res.status(400).json({ success: false, error: 'Timeline and voiceover audio required for rendering' });
  }

  // Pre-render verification: ensure source files exist
  const missingFiles: string[] = [];
  for (const seg of project.timeline.segments) {
    for (const sh of seg.shots) {
      const clip = project.footageIndex.find(c => c.clipId === sh.clipId);
      const src = clip?.sourceFile || sh.sourceFile;
      if (!src || !fs.existsSync(src)) {
        missingFiles.push(sh.clipFilename);
      }
    }
  }

  if (missingFiles.length > 0) {
    return res.status(400).json({
      success: false,
      error: `Missing original source footage: ${missingFiles.slice(0, 3).join(', ')}`,
    });
  }

  res.json({ success: true, message: 'Master video render initiated' });

  (async () => {
    try {
      broadcastProgress(projectId, 1, 'preparing_render', 'Verifying original source media files...', 'rendering');

      const narrationSegments = project.transcription?.segments || [];
      const result = await voiceoverRenderer.renderVideo(
        projectId,
        project.timeline!,
        project.footageIndex,
        project.voiceover!.filePath,
        narrationSegments,
        (pct, stage, detail) => {
          broadcastProgress(projectId, pct, stage, detail, 'rendering');
        }
      );

      const videoUrl = `/api/voiceover/${projectId}/stream`;
      voiceoverStore.updateProject(projectId, {
        status: 'completed',
        renderedVideoPath: result.outputPath,
        renderedVideoUrl: videoUrl,
        renderedFileSize: result.fileSize,
        renderProgress: 100,
        renderStage: 'completed',
        renderDetail: 'Render completed successfully!',
      });

      broadcastProgress(projectId, 100, 'completed', 'Master video ready for streaming and download!', 'completed');
    } catch (err: any) {
      console.error(`[VoiceoverRoute] Render failed for ${projectId}:`, err);
      broadcastProgress(projectId, 0, 'failed', `Rendering failed: ${err.message}`, 'failed');
    }
  })();
});

// GET /api/voiceover/:id/stream — Stream master video with HTTP 206 Range support
router.get('/:id/stream', (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  const project = voiceoverStore.getProject(projectId);
  if (!project || !project.renderedVideoPath || !fs.existsSync(project.renderedVideoPath)) {
    return res.status(404).json({ success: false, error: 'Rendered video not found' });
  }

  const filePath = project.renderedVideoPath;
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = end - start + 1;
    const file = fs.createReadStream(filePath, { start, end });

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'video/mp4',
    });
    file.pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

// GET /api/voiceover/:id/download — Download final rendered master video
router.get('/:id/download', (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  const project = voiceoverStore.getProject(projectId);
  if (!project || !project.renderedVideoPath || !fs.existsSync(project.renderedVideoPath)) {
    return res.status(404).json({ success: false, error: 'Rendered video not found' });
  }

  const filename = `ClipGen_AutoVideo_${projectId}.mp4`;
  res.download(project.renderedVideoPath, filename);
});

export { router as voiceoverRouter };
