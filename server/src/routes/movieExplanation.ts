// ============================================================
// Movie Explanation Routes — Story-Aware AI Movie Explanation Studio
// Manages original episode ingestion, script alignment, episode intelligence,
// AI director timeline generation, review controls, and master rendering.
// ============================================================

import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuid } from 'uuid';
import { movieExplanationStore } from '../services/movieExplanation/MovieExplanationStore.js';
import { episodeIntelligenceEngine } from '../services/movieExplanation/EpisodeIntelligenceEngine.js';
import { scriptAlignmentEngine } from '../services/movieExplanation/ScriptAlignmentEngine.js';
import { aiDirectorEngine } from '../services/movieExplanation/AIDirectorEngine.js';
import { storySceneMatcher } from '../services/movieExplanation/StorySceneMatcher.js';
import { movieExplanationQualityGate } from '../services/movieExplanation/MovieExplanationQualityGate.js';
import { movieExplanationRenderer } from '../services/movieExplanation/MovieExplanationRenderer.js';
import { ollamaVisionService } from '../services/movieExplanation/OllamaVisionService.js';
import { analysisJobManager } from '../services/movieExplanation/AnalysisJobManager.js';
import { openingVerificationGate } from '../services/movieExplanation/OpeningVerificationGate.js';
import { extractMetadata } from '../services/ffmpeg.js';
import { getMovieExplanationProjectDir, ensureDir } from '../services/storage.js';
import { rightsManagementService } from '../services/movieExplanation/RightsManagementService.js';
import { provenanceManifestService } from '../services/movieExplanation/ProvenanceManifestService.js';
import { scriptReviewService } from '../services/movieExplanation/ScriptReviewService.js';
import { studioPipelineOrchestrator } from '../services/movieExplanation/StudioPipelineOrchestrator.js';
import { transcriptAlignmentEngine } from '../services/movieExplanation/TranscriptAlignmentEngine.js';
import type {
  MovieExplanationProjectState,
  VoiceoverOutputAspectRatio,
  MovieTimelineShot,
  MovieExplanationClipAsset,
  TransformativeEditingSettings,
  AssetRightsStatus,
  AssetRightsMetadata,
  VisualAssetCategory,
  ShotAlignmentMode,
} from '../../../shared/types.js';

const router = Router();

function getProjectId(req: Request): string {
  const p = req.params.id;
  return Array.isArray(p) ? p[0] : (p as string);
}

// WebSocket broadcast
let wsBroadcast: ((projectId: string, data: any) => void) | null = null;

export function setMovieExplanationWebSocketBroadcast(fn: (projectId: string, data: any) => void) {
  wsBroadcast = fn;
}

function broadcastProgress(
  projectId: string,
  progress: number,
  stage: string,
  detail?: string,
  status: MovieExplanationProjectState['status'] = 'indexing_episode'
) {
  movieExplanationStore.updateProject(projectId, {
    renderProgress: progress,
    renderStage: stage,
    renderDetail: detail,
    status,
  });

  if (wsBroadcast) {
    wsBroadcast(projectId, {
      type: 'movie_explanation_progress',
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

const videoDiskStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const projectId = getProjectId(req);
    const dir = path.join(getMovieExplanationProjectDir(projectId), 'episode_source');
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique = `episode_${Date.now()}_${uuid().slice(0, 6)}${ext}`;
    cb(null, unique);
  },
});

const audioDiskStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const projectId = getProjectId(req);
    const dir = path.join(getMovieExplanationProjectDir(projectId), 'voiceover');
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique = `voiceover_${Date.now()}_${uuid().slice(0, 6)}${ext}`;
    cb(null, unique);
  },
});

const scriptDiskStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const projectId = getProjectId(req);
    const dir = path.join(getMovieExplanationProjectDir(projectId), 'script');
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique = `script_${Date.now()}_${uuid().slice(0, 6)}${ext}`;
    cb(null, unique);
  },
});

const videoUpload = multer({
  storage: videoDiskStorage,
  limits: { fileSize: 20 * 1024 * 1024 * 1024 }, // 20GB max upload
});

const audioUpload = multer({
  storage: audioDiskStorage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2GB max upload
});

const scriptUpload = multer({
  storage: scriptDiskStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max upload
});

const clipsDiskStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const projectId = getProjectId(req);
    const dir = path.join(getMovieExplanationProjectDir(projectId), 'pre_cut_clips');
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique = `clip_${Date.now()}_${uuid().slice(0, 6)}${ext}`;
    cb(null, unique);
  },
});

const clipsUpload = multer({
  storage: clipsDiskStorage,
  limits: { fileSize: 4 * 1024 * 1024 * 1024 }, // 4GB max per clip
});

const replacementVisualDiskStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const projectId = getProjectId(req);
    const dir = path.join(getMovieExplanationProjectDir(projectId), 'replacement_assets');
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique = `visual_${Date.now()}_${uuid().slice(0, 6)}${ext}`;
    cb(null, unique);
  },
});

const visualUpload = multer({
  storage: replacementVisualDiskStorage,
  limits: { fileSize: 4 * 1024 * 1024 * 1024 }, // 4GB max per visual asset
});

// ── Ollama & Vision Model Status Endpoint ──
router.get('/ollama/status', async (_req: Request, res: Response) => {
  try {
    const status = await ollamaVisionService.checkStatus();
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Project CRUD Endpoints ──

// List projects
router.get('/projects', (_req: Request, res: Response) => {
  const projects = movieExplanationStore.listProjects();
  res.json({ projects });
});

// Create project
router.post('/projects', (req: Request, res: Response) => {
  const projectId = req.body?.projectId || uuid();
  const name = req.body?.projectName;
  const project = movieExplanationStore.createProject(projectId, name);
  res.json({ project });
});

// Get project state
router.get('/projects/:id', (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  const project = movieExplanationStore.getProject(projectId);
  if (!project) {
    return res.status(404).json({ error: `Project ${projectId} not found` });
  }
  res.json({ project });
});

// Delete project
router.delete('/projects/:id', (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  movieExplanationRenderer.abortRender(projectId);
  const deleted = movieExplanationStore.deleteProject(projectId);
  res.json({ success: deleted });
});

// Cancel ongoing render
router.post('/projects/:id/cancel-render', (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  movieExplanationRenderer.abortRender(projectId);
  const project = movieExplanationStore.getProject(projectId);
  const hasExistingRender = Boolean(project?.renderedVideoPath && fs.existsSync(project.renderedVideoPath));
  const newStatus = hasExistingRender ? 'completed' : 'timeline_ready';

  movieExplanationStore.updateProject(projectId, {
    status: newStatus,
    renderStage: 'idle',
    renderProgress: hasExistingRender ? 100 : 0,
    exportStatus: hasExistingRender ? (project?.exportStatus === 'rendering' ? 'up_to_date' : (project?.exportStatus || 'up_to_date')) : 'outdated',
  });
  broadcastProgress(projectId, hasExistingRender ? 100 : 0, 'idle', 'Render cancelled by user.', newStatus);
  res.json({ success: true, message: 'Render cancelled successfully.', hasExistingRender, status: newStatus });
});

// ── Upload Endpoints ──

// Upload original episode video
router.post('/projects/:id/upload-episode', videoUpload.single('video'), async (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  const file = req.file;

  if (!file) {
    return res.status(400).json({ error: 'No video file provided' });
  }

  try {
    const meta = await extractMetadata(file.path);
    const current = movieExplanationStore.getProject(projectId);
    const isNewVideo = !current?.originalVideo?.filePath || current.originalVideo.filePath !== file.path;

    const updated = movieExplanationStore.updateProject(projectId, {
      originalVideo: {
        id: uuid(),
        filename: file.filename,
        originalFilename: file.originalname,
        filePath: file.path,
        duration: meta.duration,
        width: meta.width,
        height: meta.height,
        fps: meta.fps,
        codec: meta.codec,
        audioCodec: meta.audioCodec,
        bitrate: meta.bitrate,
        fileSize: file.size,
      },
      ...(isNewVideo ? {
        episodeIndex: undefined,
        storyMap: undefined,
        timeline: undefined,
        status: 'setup',
        exportStatus: 'none',
      } : {}),
    });

    res.json({
      success: true,
      originalVideo: updated.originalVideo,
      project: updated,
    });
  } catch (err: any) {
    res.status(500).json({ error: `Failed reading video metadata: ${err.message}` });
  }
});

// Upload explanation voiceover audio
router.post('/projects/:id/upload-voiceover', audioUpload.single('audio'), async (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  const file = req.file;

  if (!file) {
    return res.status(400).json({ error: 'No audio file provided' });
  }

  try {
    const meta = await extractMetadata(file.path);
    const updated = movieExplanationStore.updateProject(projectId, {
      voiceoverAudio: {
        id: uuid(),
        filename: file.filename,
        originalFilename: file.originalname,
        filePath: file.path,
        duration: meta.duration,
        format: path.extname(file.originalname).slice(1),
      },
    });

    res.json({
      success: true,
      voiceoverAudio: updated.voiceoverAudio,
      project: updated,
    });
  } catch (err: any) {
    res.status(500).json({ error: `Failed reading audio metadata: ${err.message}` });
  }
});

// Upload explanation script (file or direct text)
router.post('/projects/:id/upload-script', scriptUpload.single('scriptFile'), async (req: Request, res: Response) => {
  try {
    const projectId = getProjectId(req);
    let scriptContent = '';

    if (req.file) {
      scriptContent = fs.readFileSync(req.file.path, 'utf8');
    } else if (req.body?.scriptText) {
      scriptContent = req.body.scriptText;
    }

    if (!scriptContent.trim()) {
      return res.status(400).json({ error: 'No script text or document provided' });
    }

    const project = movieExplanationStore.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // If voiceover is already uploaded, immediately run alignment
    if (project.voiceoverAudio?.filePath) {
      try {
        broadcastProgress(projectId, 10, 'aligning_script', 'Aligning script with voiceover timing...', 'aligning_script');
        const alignedScript = await scriptAlignmentEngine.alignScriptAndVoiceover(
          scriptContent,
          project.voiceoverAudio.filePath,
          projectId,
          (pct, detail) => {
            broadcastProgress(projectId, pct, 'aligning_script', detail, 'aligning_script');
          }
        );

        const updated = movieExplanationStore.updateProject(projectId, {
          script: alignedScript,
          status: project.episodeIndex ? 'timeline_ready' : 'setup',
        });

        return res.json({ success: true, script: alignedScript, project: updated });
      } catch (err: any) {
        return res.status(500).json({ error: `Script alignment error: ${err.message}` });
      }
    }

    // Otherwise store raw script
    const format = scriptAlignmentEngine.detectFormat(scriptContent);
    const updated = movieExplanationStore.updateProject(projectId, {
      script: {
        rawText: scriptContent,
        format,
        segments: [],
        alignmentConfidence: 1.0,
        isAlignedToVoiceover: false,
      },
    });

    res.json({ success: true, script: updated.script, project: updated });
  } catch (err: any) {
    console.error('[MovieExplanation] upload-script error:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to process script' });
  }
});

router.post('/projects/:id/upload-original-transcript', scriptUpload.single('transcriptFile'), async (req: Request, res: Response) => {
  try {
    const projectId = getProjectId(req);
    let transcriptContent = '';

    if (req.file) {
      transcriptContent = fs.readFileSync(req.file.path, 'utf8');
    } else if (req.body?.transcriptText) {
      transcriptContent = req.body.transcriptText;
    }

    if (!transcriptContent.trim()) {
      return res.status(400).json({ error: 'No transcript text provided' });
    }

    const project = movieExplanationStore.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const duration = project.originalVideo?.duration || 2700;
    const segments = transcriptAlignmentEngine.parseTranscriptText(transcriptContent, duration);

    const originalTranscriptObj = {
      id: `otx_${Date.now()}`,
      filename: req.file?.filename || 'movie_transcript.txt',
      originalFilename: req.file?.originalname || 'Movie Subtitles / Transcript',
      filePath: req.file?.path || '',
      format: 'txt' as const,
      segments,
      dialogueCount: segments.length,
    };

    const updated = movieExplanationStore.updateProject(projectId, {
      originalTranscript: originalTranscriptObj,
    });

    res.json({ success: true, originalTranscript: originalTranscriptObj, project: updated });
  } catch (err: any) {
    console.error('[MovieExplanation] upload-original-transcript error:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to process original transcript' });
  }
});

// ── Episode Intelligence Indexing & Job Tracking ──

// Query active or persistent analysis job
router.get('/projects/:id/analysis-job', (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  const job = analysisJobManager.getJob(projectId);
  res.json({ job });
});

// Cancel active analysis job
router.post('/projects/:id/cancel-analysis', (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  analysisJobManager.cancelJob(projectId);
  broadcastProgress(projectId, 0, 'idle', 'Analysis cancelled by user.', 'setup');
  res.json({ success: true, message: 'Analysis cancelled.' });
});

router.post('/projects/:id/index-episode', async (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  const project = movieExplanationStore.getProject(projectId);

  if (!project || !project.originalVideo?.filePath) {
    return res.status(400).json({ error: 'Original video must be uploaded before indexing.' });
  }

  // Idempotency: if a job is already actively running for this project, reconnect to it
  const activeJob = analysisJobManager.getJob(projectId);
  if (activeJob && activeJob.status === 'running') {
    return res.json({
      success: true,
      message: 'Analysis already in progress, reconnected to existing job.',
      job: activeJob,
      project,
    });
  }

  try {
    broadcastProgress(projectId, 5, 'indexing_episode', 'Beginning deep Episode Intelligence indexing...', 'indexing_episode');

    const index = await episodeIntelligenceEngine.analyzeEpisode(
      project.originalVideo.filePath,
      projectId,
      (pct, detail) => {
        broadcastProgress(projectId, pct, 'indexing_episode', detail, 'indexing_episode');
      }
    );

    const updated = movieExplanationStore.updateProject(projectId, {
      episodeIndex: index,
      status: project.script?.isAlignedToVoiceover ? 'timeline_ready' : 'setup',
    });

    res.json({
      success: true,
      episodeIndex: index,
      project: updated,
      job: analysisJobManager.getJob(projectId),
    });
  } catch (err: any) {
    analysisJobManager.failJob(projectId, err.message);
    broadcastProgress(projectId, 0, 'failed', err.message, 'failed');
    res.status(500).json({ error: `Episode indexing failed: ${err.message}` });
  }
});

// ── Align Script to Voiceover ──

router.post('/projects/:id/align-script', async (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  const project = movieExplanationStore.getProject(projectId);

  if (!project || !project.voiceoverAudio?.filePath || !project.script?.rawText) {
    return res.status(400).json({ error: 'Both voiceover audio and script must be uploaded to align.' });
  }

  try {
    broadcastProgress(projectId, 10, 'aligning_script', 'Aligning script with voiceover timing...', 'aligning_script');

    const aligned = await scriptAlignmentEngine.alignScriptAndVoiceover(
      project.script.rawText,
      project.voiceoverAudio.filePath,
      projectId,
      (pct, detail) => {
        broadcastProgress(projectId, pct, 'aligning_script', detail, 'aligning_script');
      }
    );

    const updated = movieExplanationStore.updateProject(projectId, {
      script: aligned,
      status: project.episodeIndex ? 'timeline_ready' : 'setup',
    });

    res.json({ success: true, script: aligned, project: updated });
  } catch (err: any) {
    broadcastProgress(projectId, 0, 'failed', err.message, 'failed');
    res.status(500).json({ error: `Script alignment failed: ${err.message}` });
  }
});

// ── AI Director Timeline Generation ──

router.post('/projects/:id/generate-timeline', async (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  const project = movieExplanationStore.getProject(projectId);

  if (!project?.episodeIndex || !project?.script?.segments || project.script.segments.length === 0) {
    return res.status(400).json({ error: 'Both Episode Intelligence Index and aligned Script are required to generate timeline.' });
  }

  const aspectRatio = (req.body?.aspectRatio || '16:9') as VoiceoverOutputAspectRatio;
  const enableVisualVerification = req.body?.enableVisualVerification === true;

  try {
    broadcastProgress(projectId, 40, 'generating_timeline', 'AI Director evaluating scenes & narrative progression...', 'indexing_episode');

    const timeline = await aiDirectorEngine.generateTimelineAsync(
      project.episodeIndex,
      project.script,
      aspectRatio,
      undefined,
      project.transformativeSettings,
      projectId,
      {
        enableVisualVerification,
        onProgress: (pct, detail) => {
          broadcastProgress(projectId, pct, 'generating_timeline', detail, 'indexing_episode');
        },
      }
    );

    broadcastProgress(projectId, 90, 'generating_timeline', 'Validating 16-point Quality Gate...', 'indexing_episode');

    // Evaluate Quality Gate
    const qualityReport = movieExplanationQualityGate.evaluateTimeline(
      timeline,
      project.voiceoverAudio?.duration || timeline.duration,
      project.episodeIndex
    );

    const nextRev = (project.timelineRevision || 1) + 1;
    timeline.timelineRevision = nextRev;

    const updated = movieExplanationStore.updateProject(projectId, {
      timeline,
      qualityReport,
      status: 'timeline_ready',
      timelineRevision: nextRev,
      exportStatus: 'outdated',
      renderProgress: 100,
      renderStage: 'timeline_ready',
      renderDetail: 'AI Director timeline synthesized.',
    });

    broadcastProgress(projectId, 100, 'timeline_ready', 'AI Director timeline synthesized.', 'timeline_ready');
    res.json({ success: true, timeline, qualityReport, project: updated });
  } catch (err: any) {
    res.status(500).json({ error: `Timeline generation failed: ${err.message}` });
  }
});

// Regenerate unlocked shots (preserving locked shots)
router.post('/projects/:id/regenerate-timeline', async (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  const project = movieExplanationStore.getProject(projectId);

  if (!project?.episodeIndex || !project?.script || !project.timeline) {
    return res.status(400).json({ error: 'Existing timeline and indexed assets required for regeneration.' });
  }

  const enableVisualVerification = req.body?.enableVisualVerification === true;

  try {
    const nextRev = (project.timelineRevision || project.timeline.timelineRevision || 1) + 1;
    const updatedTimeline = await aiDirectorEngine.generateTimelineAsync(
      project.episodeIndex,
      project.script,
      project.timeline.outputAspectRatio,
      project.timeline, // Pass existing to preserve locked shots
      project.transformativeSettings,
      projectId,
      {
        enableVisualVerification,
        onProgress: (pct, detail) => {
          broadcastProgress(projectId, pct, 'generating_timeline', detail, 'indexing_episode');
        },
      }
    );
    updatedTimeline.timelineRevision = nextRev;

    const qualityReport = movieExplanationQualityGate.evaluateTimeline(
      updatedTimeline,
      project.voiceoverAudio?.duration || updatedTimeline.duration,
      project.episodeIndex
    );

    const updated = movieExplanationStore.updateProject(projectId, {
      timeline: updatedTimeline,
      qualityReport,
      status: 'timeline_ready',
      timelineRevision: nextRev,
      exportStatus: 'outdated',
    });

    res.json({ success: true, timeline: updatedTimeline, qualityReport, project: updated });
  } catch (err: any) {
    res.status(500).json({ error: `Timeline regeneration failed: ${err.message}` });
  }
});

// Execute 1-Click Master Production Studio Pipeline
router.post('/projects/:id/run-full-pipeline', async (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  const project = movieExplanationStore.getProject(projectId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const { autoRender, aspectRatio, qualityPreset } = req.body || {};

  try {
    broadcastProgress(projectId, 5, 'pipeline_started', 'Starting 1-Click Master Production Studio...', 'pipeline_started');

    const result = await studioPipelineOrchestrator.runFullPipeline(
      project,
      {
        autoRender: Boolean(autoRender),
        aspectRatio: (aspectRatio as VoiceoverOutputAspectRatio) || project.timeline?.outputAspectRatio || '16:9',
        qualityPreset,
      },
      (step, pct, msg) => {
        broadcastProgress(projectId, pct, step, msg, step);
      }
    );

    const updated = movieExplanationStore.getProject(projectId);
    res.json({
      success: true,
      result,
      project: updated,
    });
  } catch (err: any) {
    console.error('[run-full-pipeline] Error:', err);
    broadcastProgress(projectId, 0, 'failed', err.message, 'failed');
    res.status(500).json({ error: `Production pipeline failed: ${err.message}` });
  }
});

// Update transformative creative settings (preset, speed, color, crop, audio mix)
router.post('/projects/:id/settings', (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  const project = movieExplanationStore.getProject(projectId);

  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const incomingSettings = req.body?.settings || req.body || {};
  const currentSettings: Partial<TransformativeEditingSettings> = project.transformativeSettings || {
    preset: 'neutral',
    enableFairUsePreset: false,
    maxShotDuration: 5.0,
    minShotDuration: 2.0,
    horizontalFlip: false,
    playbackSpeed: 1.0,
    zoomLevel: 1.0,
  };

  const updatedSettings: any = {
    ...currentSettings,
    ...incomingSettings,
    colorGrading: {
      ...(currentSettings.colorGrading || {}),
      ...(incomingSettings.colorGrading || {}),
    },
    audioMixing: {
      ...(currentSettings.audioMixing || {}),
      ...(incomingSettings.audioMixing || {}),
    },
    invisibleTransforms: {
      ...(currentSettings.invisibleTransforms || {}),
      ...(incomingSettings.invisibleTransforms || {}),
    },
  };

  project.transformativeSettings = updatedSettings;
  if (project.timeline) {
    project.timeline.transformativeSettings = updatedSettings;
    const nextRev = (project.timelineRevision || project.timeline.timelineRevision || 1) + 1;
    project.timelineRevision = nextRev;
    project.timeline.timelineRevision = nextRev;
    project.exportStatus = 'outdated';
  }

  movieExplanationStore.saveProject(project);
  res.json({ success: true, settings: updatedSettings, project });
});

// ── Manual Shot Controls: Lock / Replace / Trim / Alternatives ──

// Toggle shot lock (🔒)
router.post('/projects/:id/shots/:shotId/lock', (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  const { shotId } = req.params;
  const project = movieExplanationStore.getProject(projectId);

  if (!project?.timeline) {
    return res.status(404).json({ error: 'Timeline not found' });
  }

  const shot = project.timeline.shots.find((s) => s.shotId === shotId);
  if (!shot) {
    return res.status(404).json({ error: `Shot ${shotId} not found` });
  }

  shot.isLocked = !shot.isLocked;
  movieExplanationStore.saveProject(project);

  res.json({ success: true, shotId, isLocked: shot.isLocked });
});

// Find alternative candidate scenes for a shot
router.get('/projects/:id/shots/:shotId/alternatives', (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  const { shotId } = req.params;
  const project = movieExplanationStore.getProject(projectId);

  if (!project?.timeline || !project?.episodeIndex || !project?.script) {
    return res.status(400).json({ error: 'Project data missing' });
  }

  const shot = project.timeline.shots.find((s) => s.shotId === shotId);
  if (!shot) {
    return res.status(404).json({ error: `Shot ${shotId} not found` });
  }

  const segIndex = project.script.segments.findIndex((s) => s.segmentId === shot.segmentId);
  const seg = project.script.segments[segIndex] || {
    segmentId: shot.segmentId,
    text: shot.sceneDescription || '',
    voiceoverStart: shot.timelineStart,
    voiceoverEnd: shot.timelineEnd,
    duration: shot.duration,
    sentenceIndex: 0,
    paragraphIndex: 0,
    eventsDescribed: [],
    narrativePurpose: 'setup',
    visualIntent: '',
    requiresMultiShot: false,
    targetShotCount: 1,
  };

  const candidates = storySceneMatcher.matchCandidatesForSegment(
    seg,
    project.episodeIndex,
    project.script.segments,
    segIndex >= 0 ? segIndex : 0,
    new Set()
  );

  res.json({
    shotId,
    currentSceneId: shot.sceneId,
    candidates: candidates.slice(0, 10).map((c) => ({
      sceneId: c.scene.sceneId,
      startTime: c.scene.startTime,
      endTime: c.scene.endTime,
      duration: c.scene.duration,
      description: c.scene.description,
      dialogue: c.scene.dialogueSnippet,
      characters: c.scene.characters,
      actions: c.scene.actions,
      location: c.scene.location,
      emotionalTone: c.scene.emotionalTone,
      thumbnailUrl: c.scene.thumbnailUrl,
      matchScore: c.matchScore,
      isLowConfidence: c.isLowConfidence,
      reasons: c.reasons,
    })),
  });
});

// Replace a timeline shot with a chosen scene
router.post('/projects/:id/shots/:shotId/replace', (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  const { shotId } = req.params;
  const { newSceneId } = req.body;
  const project = movieExplanationStore.getProject(projectId);

  if (!project?.timeline || !project?.episodeIndex) {
    return res.status(400).json({ error: 'Timeline or index not found' });
  }

  const shot = project.timeline.shots.find((s) => s.shotId === shotId);
  if (!shot) {
    return res.status(404).json({ error: `Shot ${shotId} not found` });
  }

  const newScene = project.episodeIndex.scenes.find((s) => s.sceneId === newSceneId);
  if (!newScene) {
    return res.status(404).json({ error: `Scene ${newSceneId} not found` });
  }

  shot.sceneId = newScene.sceneId;
  shot.sourceFile = newScene.sourceFile || project.episodeIndex.originalVideoPath;
  shot.sourceStart = newScene.startTime;
  shot.sourceEnd = Number(Math.min(newScene.endTime, newScene.startTime + shot.duration).toFixed(3));
  shot.isManualOverride = true;
  shot.isLocked = req.body.isLocked !== undefined ? Boolean(req.body.isLocked) : (shot.isLocked ?? false);
  shot.thumbnailUrl = newScene.thumbnailUrl;
  shot.sceneDescription = newScene.description;
  shot.sceneDialogue = newScene.dialogueSnippet;
  shot.whyThisScene = {
    characterMatch: `User selected scene featuring ${newScene.characters.join(', ')}.`,
    actionMatch: `Manual selection: ${newScene.actions.join(', ')}.`,
    storyContextReason: 'Manually chosen by editor as optimal visual accompaniment.',
    chronologyCheck: 'Verified by editor.',
    emotionalFit: newScene.emotionalTone,
    fullSummary: `Manually replaced with Scene ${newScene.sceneId} (${newScene.description}).`,
  };

  // Transactional revision increment and export invalidation
  const nextRev = (project.timelineRevision || project.timeline.timelineRevision || 1) + 1;
  project.timelineRevision = nextRev;
  project.timeline.timelineRevision = nextRev;
  project.exportStatus = 'outdated';
  project.status = 'timeline_ready';

  movieExplanationStore.saveProject(project);
  res.json({ success: true, shot, timelineRevision: nextRev, exportStatus: 'outdated' });
});

// Explicitly accept a match and lock it against automatic overwrite
router.post('/projects/:id/shots/:shotId/accept-match', (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  const { shotId } = req.params;
  const project = movieExplanationStore.getProject(projectId);

  if (!project?.timeline) {
    return res.status(404).json({ error: 'Timeline not found' });
  }

  const shot = project.timeline.shots.find((s) => s.shotId === shotId);
  if (!shot) {
    return res.status(404).json({ error: `Shot ${shotId} not found` });
  }

  shot.isManualOverride = true;
  shot.isLocked = true;
  shot.duplicateWarning = undefined;

  const qualityReport = movieExplanationQualityGate.evaluateTimeline(
    project.timeline,
    project.voiceoverAudio?.duration || project.timeline.duration,
    project.episodeIndex
  );
  project.qualityReport = qualityReport;

  movieExplanationStore.saveProject(project);
  res.json({ success: true, shot, qualityReport });
});

// Convert a shot to a moving cinematic screenshot with specified motion effect
router.post('/projects/:id/shots/:shotId/convert-to-screenshot', (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  const { shotId } = req.params;
  const { motionEffect } = req.body;
  const project = movieExplanationStore.getProject(projectId);

  if (!project?.timeline) {
    return res.status(404).json({ error: 'Timeline not found' });
  }

  const shot = project.timeline.shots.find((s) => s.shotId === shotId);
  if (!shot) {
    return res.status(404).json({ error: `Shot ${shotId} not found` });
  }

  const validMotions = ['pan_left_to_right', 'gentle_zoom_in', 'pan_right_to_left', 'subtle_diagonal', 'gentle_zoom_out'];
  const selectedMotion = validMotions.includes(motionEffect) ? motionEffect : 'gentle_zoom_in';

  shot.presentationType = 'screenshot';
  shot.isScreenshot = true;
  shot.motionEffect = selectedMotion;
  shot.screenshotDuration = shot.duration;
  shot.screenshotCadenceStatus = 'compliant';
  shot.isManualOverride = true;
  shot.isLocked = true;

  const nextRev = (project.timelineRevision || 1) + 1;
  project.timelineRevision = nextRev;
  project.timeline.timelineRevision = nextRev;
  project.exportStatus = 'outdated';

  const qualityReport = movieExplanationQualityGate.evaluateTimeline(
    project.timeline,
    project.voiceoverAudio?.duration || project.timeline.duration,
    project.episodeIndex
  );
  project.qualityReport = qualityReport;

  movieExplanationStore.saveProject(project);
  res.json({ success: true, shot, qualityReport, timelineRevision: nextRev });
});

// Accept and lock ALL screenshot shots across the entire timeline
router.post('/projects/:id/accept-all-screenshots', (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  const project = movieExplanationStore.getProject(projectId);

  if (!project?.timeline) {
    return res.status(404).json({ error: 'Timeline not found' });
  }

  let count = 0;
  for (const shot of project.timeline.shots) {
    if (shot.isScreenshot || shot.presentationType === 'screenshot') {
      shot.isLocked = true;
      shot.isManualOverride = true;
      shot.duplicateWarning = undefined;
      shot.isLowConfidence = false;
      count++;
    }
  }

  const nextRev = (project.timelineRevision || 1) + 1;
  project.timelineRevision = nextRev;
  project.timeline.timelineRevision = nextRev;
  project.exportStatus = 'outdated';

  const { repairedTimeline } = movieExplanationQualityGate.autoEnforceScreenshotCadence(
    project.timeline,
    project.episodeIndex
  );
  project.timeline = repairedTimeline;

  const qualityReport = movieExplanationQualityGate.evaluateTimeline(
    project.timeline,
    project.voiceoverAudio?.duration || project.timeline.duration,
    project.episodeIndex
  );
  project.qualityReport = qualityReport;

  movieExplanationStore.saveProject(project);
  res.json({ success: true, count, shots: project.timeline.shots, qualityReport });
});

// Accept and lock ALL valid matches and screenshots across the entire timeline
router.post('/projects/:id/accept-all-matches', (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  const project = movieExplanationStore.getProject(projectId);

  if (!project?.timeline) {
    return res.status(404).json({ error: 'Timeline not found' });
  }

  let count = 0;
  for (const shot of project.timeline.shots) {
    if ((shot.sceneId && shot.sceneId !== 'unmatched') || shot.isScreenshot) {
      shot.isLocked = true;
      shot.isManualOverride = true;
      shot.duplicateWarning = undefined;
      shot.isLowConfidence = false;
      count++;
    }
  }

  const { repairedTimeline } = movieExplanationQualityGate.autoEnforceScreenshotCadence(
    project.timeline,
    project.episodeIndex
  );
  project.timeline = repairedTimeline;

  const nextRev = (project.timelineRevision || 1) + 1;
  project.timelineRevision = nextRev;
  project.timeline.timelineRevision = nextRev;
  project.exportStatus = 'outdated';

  const qualityReport = movieExplanationQualityGate.evaluateTimeline(
    project.timeline,
    project.voiceoverAudio?.duration || project.timeline.duration,
    project.episodeIndex
  );
  project.qualityReport = qualityReport;

  movieExplanationStore.saveProject(project);
  res.json({ success: true, count, shots: project.timeline.shots, qualityReport });
});

// Convert all unmatched narration beats to moving screenshots with valid movie footage
router.post('/projects/:id/convert-unmatched-to-screenshots', (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  const project = movieExplanationStore.getProject(projectId);

  if (!project?.timeline) {
    return res.status(404).json({ error: 'Timeline not found' });
  }

  const availableScenes = (project.episodeIndex?.scenes || []).filter(
    (s) => !s.isTitleOrBumper && !s.isExcludedFromNarration
  );
  const fallbackScene = availableScenes[0];

  let convertedCount = 0;
  for (let i = 0; i < project.timeline.shots.length; i++) {
    const shot = project.timeline.shots[i];
    if (shot.isUnmatched || shot.sceneId === 'unmatched' || shot.matchScore === 0) {
      const chosenScene = (availableScenes.length > 0)
        ? (availableScenes[i % availableScenes.length] || fallbackScene)
        : undefined;
      if (chosenScene) {
        shot.sceneId = chosenScene.sceneId;
        shot.sourceFile = chosenScene.sourceFile || project.episodeIndex?.originalVideoPath || '';
        shot.thumbnailUrl = chosenScene.thumbnailUrl;
        shot.sourceStart = chosenScene.startTime;
        shot.sourceEnd = Math.min(chosenScene.endTime, chosenScene.startTime + Math.max(3.0, shot.duration));
      }
      shot.presentationType = 'screenshot';
      shot.isScreenshot = true;
      shot.motionEffect = 'gentle_zoom_in';
      shot.screenshotDuration = shot.duration;
      shot.screenshotCadenceStatus = 'compliant';
      shot.isUnmatched = false;
      shot.unmatchedReason = undefined;
      shot.matchScore = 80;
      shot.confidence = 0.85;
      shot.isLowConfidence = false;
      shot.isLocked = true;
      shot.isManualOverride = true;
      shot.duplicateWarning = undefined;
      convertedCount++;
    }
  }

  const nextRev = (project.timelineRevision || 1) + 1;
  project.timelineRevision = nextRev;
  project.timeline.timelineRevision = nextRev;
  project.exportStatus = 'outdated';

  const qualityReport = movieExplanationQualityGate.evaluateTimeline(
    project.timeline,
    project.voiceoverAudio?.duration || project.timeline.duration,
    project.episodeIndex
  );
  project.qualityReport = qualityReport;

  movieExplanationStore.saveProject(project);
  res.json({ success: true, convertedCount, shots: project.timeline.shots, qualityReport });
});

// Auto-review complete timeline: resolve unmatched, approve all shots, and update Quality Gate
router.post('/projects/:id/auto-review-and-approve', (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  const project = movieExplanationStore.getProject(projectId);

  if (!project?.timeline) {
    return res.status(404).json({ error: 'Timeline not found' });
  }

  const availableScenes = (project.episodeIndex?.scenes || []).filter(
    (s) => !s.isTitleOrBumper && !s.isExcludedFromNarration
  );
  const fallbackScene = availableScenes[0];

  let approvedCount = 0;
  for (let i = 0; i < project.timeline.shots.length; i++) {
    const shot = project.timeline.shots[i];
    // If unmatched, convert to screenshot from clean scene pool
    if (shot.isUnmatched || shot.sceneId === 'unmatched' || shot.matchScore === 0) {
      const chosenScene = (availableScenes.length > 0)
        ? (availableScenes[i % availableScenes.length] || fallbackScene)
        : undefined;
      if (chosenScene) {
        shot.sceneId = chosenScene.sceneId;
        shot.sourceFile = chosenScene.sourceFile || project.episodeIndex?.originalVideoPath || '';
        shot.thumbnailUrl = chosenScene.thumbnailUrl;
        shot.sourceStart = chosenScene.startTime;
        shot.sourceEnd = Math.min(chosenScene.endTime, chosenScene.startTime + Math.max(3.0, shot.duration));
      }
      shot.presentationType = 'screenshot';
      shot.isScreenshot = true;
      shot.motionEffect = 'gentle_zoom_in';
      shot.screenshotDuration = shot.duration;
      shot.screenshotCadenceStatus = 'compliant';
      shot.isUnmatched = false;
      shot.unmatchedReason = undefined;
      shot.matchScore = 80;
      shot.confidence = 0.85;
    }

    // Approve and lock
    shot.isLocked = true;
    shot.isManualOverride = true;
    shot.duplicateWarning = undefined;
    shot.isLowConfidence = false;
    approvedCount++;
  }

  const nextRev = (project.timelineRevision || 1) + 1;
  project.timelineRevision = nextRev;
  project.timeline.timelineRevision = nextRev;
  project.exportStatus = 'outdated';

  const qualityReport = movieExplanationQualityGate.evaluateTimeline(
    project.timeline,
    project.voiceoverAudio?.duration || project.timeline.duration,
    project.episodeIndex
  );
  project.qualityReport = qualityReport;

  movieExplanationStore.saveProject(project);
  res.json({ success: true, approvedCount, shots: project.timeline.shots, qualityReport });
});

// Recheck scene matching for an individual segment
router.post('/projects/:id/recheck-segment/:segmentId', (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  const { segmentId } = req.params;
  const project = movieExplanationStore.getProject(projectId);

  if (!project?.timeline || !project?.script || !project?.episodeIndex) {
    return res.status(400).json({ error: 'Project data missing for segment recheck' });
  }

  const segIndex = project.script.segments.findIndex((s) => s.segmentId === segmentId);
  if (segIndex < 0) {
    return res.status(404).json({ error: `Segment ${segmentId} not found` });
  }

  const seg = project.script.segments[segIndex];
  const candidates = storySceneMatcher.matchCandidatesForSegment(
    seg,
    project.episodeIndex,
    project.script.segments,
    segIndex,
    {
      duplicatePolicy: project.transformativeSettings?.duplicatePolicy || 'strict_no_reuse',
    }
  );

  const validCandidates = candidates.filter(
    (c) =>
      c.matchScore > 0 &&
      !c.isUnmatched &&
      !c.scene.isTitleOrBumper &&
      !c.scene.isExcludedFromNarration &&
      c.scene.endTime > (project.episodeIndex?.narrativeStartTime || 0)
  );

  const topCandidate = validCandidates[0];
  if (topCandidate) {
    // Update affected shots for this segment
    for (const sh of project.timeline.shots) {
      if (sh.segmentId === segmentId && !sh.isLocked) {
        sh.sceneId = topCandidate.scene.sceneId;
        sh.sourceFile = topCandidate.scene.sourceFile || project.episodeIndex.originalVideoPath;
        sh.sourceStart = topCandidate.scene.startTime;
        sh.sourceEnd = Number((sh.sourceStart + sh.duration).toFixed(3));
        sh.matchScore = topCandidate.matchScore;
        sh.confidence = topCandidate.confidence;
        sh.isLowConfidence = topCandidate.isLowConfidence;
        sh.isUnmatched = false;
        sh.thumbnailUrl = topCandidate.scene.thumbnailUrl;
        sh.sceneDescription = topCandidate.scene.description;
        sh.sceneDialogue = topCandidate.scene.dialogueSnippet;
        sh.duplicateWarning = topCandidate.duplicateWarning;
      }
    }

    seg.relevantSceneIds = validCandidates.slice(0, 5).map((c) => c.scene.sceneId);
    seg.selectedSceneId = topCandidate.scene.sceneId;
    seg.confidenceScore = topCandidate.confidence;
    seg.candidateAlternatives = validCandidates.slice(1, 4).map((c) => ({
      sceneId: c.scene.sceneId,
      startTime: c.scene.startTime,
      endTime: c.scene.endTime,
      score: c.matchScore,
      reason: c.reasons[0] || 'Alternative candidate',
    }));
  }

  const nextRev = (project.timelineRevision || 1) + 1;
  project.timelineRevision = nextRev;
  project.timeline.timelineRevision = nextRev;
  project.exportStatus = 'outdated';

  const qualityReport = movieExplanationQualityGate.evaluateTimeline(
    project.timeline,
    project.voiceoverAudio?.duration || project.timeline.duration,
    project.episodeIndex
  );
  project.qualityReport = qualityReport;

  movieExplanationStore.saveProject(project);
  res.json({ success: true, segment: seg, qualityReport, timelineRevision: nextRev });
});

// Revalidate complete timeline
router.post('/projects/:id/revalidate-timeline', (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  const project = movieExplanationStore.getProject(projectId);

  if (!project?.timeline) {
    return res.status(404).json({ error: 'Timeline not found' });
  }

  const qualityReport = movieExplanationQualityGate.evaluateTimeline(
    project.timeline,
    project.voiceoverAudio?.duration || project.timeline.duration,
    project.episodeIndex
  );

  project.qualityReport = qualityReport;
  movieExplanationStore.saveProject(project);

  res.json({ success: true, qualityReport });
});

// Trim source in/out points for a shot
router.post('/projects/:id/shots/:shotId/trim', (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  const { shotId } = req.params;
  const { sourceStart, sourceEnd } = req.body;
  const project = movieExplanationStore.getProject(projectId);

  if (!project?.timeline) {
    return res.status(404).json({ error: 'Timeline not found' });
  }

  const shot = project.timeline.shots.find((s) => s.shotId === shotId);
  if (!shot) {
    return res.status(404).json({ error: `Shot ${shotId} not found` });
  }

  if (sourceStart !== undefined) shot.sourceStart = Number(sourceStart);
  if (sourceEnd !== undefined) shot.sourceEnd = Number(sourceEnd);
  shot.duration = Number((shot.sourceEnd - shot.sourceStart).toFixed(3));
  shot.timelineEnd = Number((shot.timelineStart + shot.duration).toFixed(3));
  shot.isManualOverride = true;
  if (req.body.isLocked !== undefined) shot.isLocked = Boolean(req.body.isLocked);

  const nextRev = (project.timelineRevision || project.timeline.timelineRevision || 1) + 1;
  project.timelineRevision = nextRev;
  project.timeline.timelineRevision = nextRev;
  project.exportStatus = 'outdated';
  project.status = 'timeline_ready';

  movieExplanationStore.saveProject(project);
  res.json({ success: true, shot, timelineRevision: nextRev, exportStatus: 'outdated' });
});

// ── Manual NLE Video Editor Endpoints ──

// Split a shot at playhead timestamp
router.post('/projects/:id/shots/:shotId/split', (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  const { shotId } = req.params;
  const { splitTimestamp } = req.body;
  const project = movieExplanationStore.getProject(projectId);

  if (!project?.timeline) {
    return res.status(404).json({ error: 'Timeline not found' });
  }

  const shotIndex = project.timeline.shots.findIndex((s) => s.shotId === shotId);
  if (shotIndex === -1) {
    return res.status(404).json({ error: `Shot ${shotId} not found` });
  }

  const originalShot = project.timeline.shots[shotIndex];
  const splitTime = Number(splitTimestamp);

  if (isNaN(splitTime) || splitTime <= originalShot.timelineStart + 0.05 || splitTime >= originalShot.timelineEnd - 0.05) {
    return res.status(400).json({
      error: `Invalid split timestamp (${splitTime}s). Must be strictly between shot start (${originalShot.timelineStart}s) and end (${originalShot.timelineEnd}s).`,
    });
  }

  const dur1 = Number((splitTime - originalShot.timelineStart).toFixed(3));
  const dur2 = Number((originalShot.timelineEnd - splitTime).toFixed(3));
  const speed = originalShot.speedMultiplier || originalShot.speedSettings?.speedMultiplier || 1.0;
  const srcSplit = Number((originalShot.sourceStart + dur1 * speed).toFixed(3));

  const shot1: MovieTimelineShot = {
    ...originalShot,
    timelineEnd: splitTime,
    duration: dur1,
    sourceEnd: srcSplit,
    isManualOverride: true,
  };

  const shot2: MovieTimelineShot = {
    ...originalShot,
    shotId: `shot_${uuid().slice(0, 8)}`,
    timelineStart: splitTime,
    duration: dur2,
    sourceStart: srcSplit,
    sourceEnd: originalShot.sourceEnd,
    hasJumpCut: true,
    isManualOverride: true,
  };

  project.timeline.shots.splice(shotIndex, 1, shot1, shot2);

  const nextRev = (project.timelineRevision || project.timeline.timelineRevision || 1) + 1;
  project.timelineRevision = nextRev;
  project.timeline.timelineRevision = nextRev;
  project.exportStatus = 'outdated';
  project.status = 'timeline_ready';

  movieExplanationStore.saveProject(project);
  res.json({
    success: true,
    message: 'Shot successfully split at playhead',
    splitShots: [shot1, shot2],
    timeline: project.timeline,
    timelineRevision: nextRev,
    exportStatus: 'outdated',
  });
});

// Reorder shots in timeline
router.post('/projects/:id/shots/reorder', (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  const { shotIds } = req.body;
  const project = movieExplanationStore.getProject(projectId);

  if (!project?.timeline) {
    return res.status(404).json({ error: 'Timeline not found' });
  }

  if (!Array.isArray(shotIds) || shotIds.length === 0) {
    return res.status(400).json({ error: 'shotIds array is required' });
  }

  const shotMap = new Map(project.timeline.shots.map((s) => [s.shotId, s]));
  const reordered: MovieTimelineShot[] = [];

  for (const id of shotIds) {
    const s = shotMap.get(id);
    if (s) {
      reordered.push(s);
      shotMap.delete(id);
    }
  }

  // Append any shots not explicitly listed
  for (const remaining of shotMap.values()) {
    reordered.push(remaining);
  }

  // Recalculate sequential timelineStart and timelineEnd (Zero-Gap Rule)
  let runningTime = 0.000;
  for (let i = 0; i < reordered.length; i++) {
    reordered[i].timelineStart = runningTime;
    reordered[i].timelineEnd = Number((runningTime + reordered[i].duration).toFixed(3));
    reordered[i].isManualOverride = true;
    runningTime = reordered[i].timelineEnd;
  }

  project.timeline.shots = reordered;
  project.timeline.duration = Number(runningTime.toFixed(3));

  const nextRev = (project.timelineRevision || project.timeline.timelineRevision || 1) + 1;
  project.timelineRevision = nextRev;
  project.timeline.timelineRevision = nextRev;
  project.exportStatus = 'outdated';
  project.status = 'timeline_ready';

  movieExplanationStore.saveProject(project);
  res.json({
    success: true,
    message: 'Timeline shots successfully reordered',
    timeline: project.timeline,
    timelineRevision: nextRev,
    exportStatus: 'outdated',
  });
});

// Update transform, color grading, effects, borders, or speed on an individual shot
router.post('/projects/:id/shots/:shotId/transform', (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  const { shotId } = req.params;
  const {
    transform,
    colorGrading,
    filterEffect,
    border,
    speedSettings,
    isLocked,
    isFlipped,
    zoomLevel,
    speedMultiplier,
    framingMode,
  } = req.body;
  const project = movieExplanationStore.getProject(projectId);

  if (!project?.timeline) {
    return res.status(404).json({ error: 'Timeline not found' });
  }

  const shot = project.timeline.shots.find((s) => s.shotId === shotId);
  if (!shot) {
    return res.status(404).json({ error: `Shot ${shotId} not found` });
  }

  if (transform !== undefined) shot.transform = { ...shot.transform, ...transform };
  if (colorGrading !== undefined) shot.colorGrading = { ...shot.colorGrading, ...colorGrading };
  if (filterEffect !== undefined) shot.filterEffect = { ...shot.filterEffect, ...filterEffect };
  if (border !== undefined) shot.border = { ...shot.border, ...border };
  if (speedSettings !== undefined) shot.speedSettings = { ...shot.speedSettings, ...speedSettings };
  if (isLocked !== undefined) shot.isLocked = Boolean(isLocked);
  if (isFlipped !== undefined) shot.isFlipped = Boolean(isFlipped);
  if (zoomLevel !== undefined) shot.zoomLevel = Number(zoomLevel);
  if (speedMultiplier !== undefined) shot.speedMultiplier = Number(speedMultiplier);
  if (framingMode !== undefined) shot.framingMode = framingMode;

  shot.isManualOverride = true;

  const nextRev = (project.timelineRevision || project.timeline.timelineRevision || 1) + 1;
  project.timelineRevision = nextRev;
  project.timeline.timelineRevision = nextRev;
  project.exportStatus = 'outdated';
  project.status = 'timeline_ready';

  movieExplanationStore.saveProject(project);
  res.json({
    success: true,
    shot,
    timelineRevision: nextRev,
    exportStatus: 'outdated',
  });
});

// Batch update multiple or all shots (e.g. apply color grade, border, or filter)
router.post('/projects/:id/shots/batch-update', (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  const { shotIds, all, updates } = req.body;
  const project = movieExplanationStore.getProject(projectId);

  if (!project?.timeline) {
    return res.status(404).json({ error: 'Timeline not found' });
  }

  const idSet = Array.isArray(shotIds) ? new Set(shotIds) : null;
  let count = 0;

  for (const shot of project.timeline.shots) {
    if (all || (idSet && idSet.has(shot.shotId))) {
      if (updates.transform) shot.transform = { ...shot.transform, ...updates.transform };
      if (updates.colorGrading) shot.colorGrading = { ...shot.colorGrading, ...updates.colorGrading };
      if (updates.filterEffect) shot.filterEffect = { ...shot.filterEffect, ...updates.filterEffect };
      if (updates.border) shot.border = { ...shot.border, ...updates.border };
      if (updates.speedSettings) shot.speedSettings = { ...shot.speedSettings, ...updates.speedSettings };
      if (updates.framingMode) shot.framingMode = updates.framingMode;
      shot.isManualOverride = true;
      count++;
    }
  }

  const nextRev = (project.timelineRevision || project.timeline.timelineRevision || 1) + 1;
  project.timelineRevision = nextRev;
  project.timeline.timelineRevision = nextRev;
  project.exportStatus = 'outdated';

  movieExplanationStore.saveProject(project);
  res.json({ success: true, updatedCount: count, timelineRevision: nextRev, exportStatus: 'outdated' });
});

// Duplicate a shot
router.post('/projects/:id/shots/:shotId/duplicate', (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  const { shotId } = req.params;
  const project = movieExplanationStore.getProject(projectId);

  if (!project?.timeline) {
    return res.status(404).json({ error: 'Timeline not found' });
  }

  const shotIndex = project.timeline.shots.findIndex((s) => s.shotId === shotId);
  if (shotIndex === -1) {
    return res.status(404).json({ error: `Shot ${shotId} not found` });
  }

  const originalShot = project.timeline.shots[shotIndex];
  const duplicatedShot: MovieTimelineShot = {
    ...JSON.parse(JSON.stringify(originalShot)),
    shotId: `shot_${uuid().slice(0, 8)}`,
    timelineStart: originalShot.timelineEnd,
    timelineEnd: Number((originalShot.timelineEnd + originalShot.duration).toFixed(3)),
    isManualOverride: true,
  };

  project.timeline.shots.splice(shotIndex + 1, 0, duplicatedShot);

  // Ripple subsequent shots
  let runningTime = duplicatedShot.timelineEnd;
  for (let i = shotIndex + 2; i < project.timeline.shots.length; i++) {
    project.timeline.shots[i].timelineStart = runningTime;
    project.timeline.shots[i].timelineEnd = Number((runningTime + project.timeline.shots[i].duration).toFixed(3));
    runningTime = project.timeline.shots[i].timelineEnd;
  }
  project.timeline.duration = Number(runningTime.toFixed(3));

  const nextRev = (project.timelineRevision || project.timeline.timelineRevision || 1) + 1;
  project.timelineRevision = nextRev;
  project.timeline.timelineRevision = nextRev;
  project.exportStatus = 'outdated';

  movieExplanationStore.saveProject(project);
  res.json({ success: true, duplicatedShot, timeline: project.timeline, timelineRevision: nextRev });
});

// Delete a shot with seamless ripple
router.delete('/projects/:id/shots/:shotId', (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  const { shotId } = req.params;
  const project = movieExplanationStore.getProject(projectId);

  if (!project?.timeline) {
    return res.status(404).json({ error: 'Timeline not found' });
  }

  const shotIndex = project.timeline.shots.findIndex((s) => s.shotId === shotId);
  if (shotIndex === -1) {
    return res.status(404).json({ error: `Shot ${shotId} not found` });
  }

  project.timeline.shots.splice(shotIndex, 1);

  // Ripple remaining shots
  let runningTime = 0.000;
  for (let i = 0; i < project.timeline.shots.length; i++) {
    project.timeline.shots[i].timelineStart = runningTime;
    project.timeline.shots[i].timelineEnd = Number((runningTime + project.timeline.shots[i].duration).toFixed(3));
    runningTime = project.timeline.shots[i].timelineEnd;
  }
  project.timeline.duration = Number(runningTime.toFixed(3));

  const nextRev = (project.timelineRevision || project.timeline.timelineRevision || 1) + 1;
  project.timelineRevision = nextRev;
  project.timeline.timelineRevision = nextRev;
  project.exportStatus = 'outdated';

  movieExplanationStore.saveProject(project);
  res.json({ success: true, message: 'Shot deleted', timeline: project.timeline, timelineRevision: nextRev });
});

// Add an unused scene from the Media library to the timeline
router.post('/projects/:id/shots/add-scene', (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  const { sceneId, insertAfterShotId, duration } = req.body;
  const project = movieExplanationStore.getProject(projectId);

  if (!project?.timeline || !project?.episodeIndex) {
    return res.status(400).json({ error: 'Timeline or episode index not found' });
  }

  const scene = project.episodeIndex.scenes.find((s) => s.sceneId === sceneId);
  if (!scene) {
    return res.status(404).json({ error: `Scene ${sceneId} not found in indexed library` });
  }

  // Strict <= 3.0s cut rule
  const shotDuration = Number(Math.min(3.0, Math.max(1.0, Number(duration) || 2.5)).toFixed(3));
  const sourceStart = Number(scene.startTime.toFixed(3));
  const sourceEnd = Number(Math.min(scene.endTime, scene.startTime + shotDuration).toFixed(3));

  const newShot: MovieTimelineShot = {
    shotId: `shot_${uuid().slice(0, 8)}`,
    segmentId: `seg_${Date.now().toString(36)}`,
    sceneId: scene.sceneId,
    sourceFile: scene.sourceFile || project.episodeIndex.originalVideoPath,
    sourceStart,
    sourceEnd,
    timelineStart: 0,
    timelineEnd: shotDuration,
    duration: shotDuration,
    matchScore: 0.95,
    confidence: 0.95,
    isLowConfidence: false,
    isManualOverride: true,
    isLocked: false,
    framingMode: 'fit',
    thumbnailUrl: scene.thumbnailUrl,
    sceneDescription: scene.description || (scene as any).visualSummary,
    whyThisScene: {
      characterMatch: `Added from indexed scene library.`,
      actionMatch: `Manual insertion of source footage.`,
      storyContextReason: `Manually added by editor from scene library.`,
      chronologyCheck: 'Verified by editor.',
      emotionalFit: scene.emotionalTone || 'neutral',
      fullSummary: `Manually added Scene ${scene.sceneId} (${scene.description || 'Source footage'}).`,
    },
    transition: 'crossfade',
    transitionDuration: 0.15,
  };

  const shots = project.timeline.shots;
  if (insertAfterShotId) {
    const idx = shots.findIndex((s) => s.shotId === insertAfterShotId);
    if (idx !== -1) {
      shots.splice(idx + 1, 0, newShot);
    } else {
      shots.push(newShot);
    }
  } else {
    shots.push(newShot);
  }

  // Ripple timelineStart and timelineEnd
  let runningTime = 0.000;
  for (let i = 0; i < shots.length; i++) {
    shots[i].timelineStart = runningTime;
    shots[i].timelineEnd = Number((runningTime + shots[i].duration).toFixed(3));
    runningTime = shots[i].timelineEnd;
  }
  project.timeline.duration = Number(runningTime.toFixed(3));

  const nextRev = (project.timelineRevision || project.timeline.timelineRevision || 1) + 1;
  project.timelineRevision = nextRev;
  project.timeline.timelineRevision = nextRev;
  project.exportStatus = 'outdated';
  project.status = 'timeline_ready';

  movieExplanationStore.saveProject(project);
  res.json({
    success: true,
    message: 'Scene successfully added to timeline',
    shot: newShot,
    timeline: project.timeline,
    timelineRevision: nextRev,
  });
});

// Full timeline update (shots, textOverlays, captions, tracks, audioLayers, globalCanvas)
router.post('/projects/:id/timeline/update', (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  const project = movieExplanationStore.getProject(projectId);

  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const { shots, textOverlays, captions, audioLayers, tracks, globalCanvas, exportSettings, transformativeSettings } = req.body;

  if (!project.timeline) {
    project.timeline = {
      timelineId: `tl_${uuid().slice(0, 8)}`,
      projectId,
      duration: 0,
      shots: [],
      outputAspectRatio: '16:9',
      outputWidth: 1920,
      outputHeight: 1080,
      outputFps: 60,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  if (Array.isArray(shots)) {
    project.timeline.shots = shots;
    const last = shots[shots.length - 1];
    if (last) {
      project.timeline.duration = last.timelineEnd;
    }
  }
  if (Array.isArray(textOverlays)) project.timeline.textOverlays = textOverlays;
  if (Array.isArray(captions)) project.timeline.captions = captions;
  if (Array.isArray(audioLayers)) project.timeline.audioLayers = audioLayers;
  if (Array.isArray(tracks)) project.timeline.tracks = tracks;
  if (globalCanvas) project.timeline.globalCanvas = globalCanvas;
  if (exportSettings) project.timeline.exportSettings = exportSettings;
  if (transformativeSettings) project.transformativeSettings = { ...project.transformativeSettings, ...transformativeSettings };

  const nextRev = (project.timelineRevision || project.timeline.timelineRevision || 1) + 1;
  project.timelineRevision = nextRev;
  project.timeline.timelineRevision = nextRev;
  project.timeline.updatedAt = new Date().toISOString();
  project.exportStatus = 'outdated';
  project.status = 'timeline_ready';

  movieExplanationStore.saveProject(project);
  res.json({ success: true, timeline: project.timeline, timelineRevision: nextRev, exportStatus: 'outdated' });
});

// Generate captions from script segments
router.post('/projects/:id/captions/generate', (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  const project = movieExplanationStore.getProject(projectId);

  if (!project?.script?.segments) {
    return res.status(400).json({ error: 'Script segments required to generate captions' });
  }

  const captions = project.script.segments.map((seg, idx) => ({
    id: `cap_${idx + 1}_${seg.segmentId.slice(0, 6)}`,
    text: seg.text,
    startTime: seg.voiceoverStart,
    endTime: seg.voiceoverEnd,
    fontSize: 22,
    fontColor: '#ffffff',
    outlineColor: '#000000',
    positionY: 86,
    words: seg.wordTimestamps,
  }));

  if (project.timeline) {
    project.timeline.captions = captions;
    const nextRev = (project.timelineRevision || 1) + 1;
    project.timelineRevision = nextRev;
    project.timeline.timelineRevision = nextRev;
    movieExplanationStore.saveProject(project);
  }

  res.json({ success: true, captions, count: captions.length });
});

// Update captions array
router.post('/projects/:id/captions/update', (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  const { captions } = req.body;
  const project = movieExplanationStore.getProject(projectId);

  if (!project?.timeline) {
    return res.status(404).json({ error: 'Timeline not found' });
  }

  project.timeline.captions = Array.isArray(captions) ? captions : [];
  const nextRev = (project.timelineRevision || 1) + 1;
  project.timelineRevision = nextRev;
  project.timeline.timelineRevision = nextRev;
  project.exportStatus = 'outdated';

  movieExplanationStore.saveProject(project);
  res.json({ success: true, captions: project.timeline.captions, timelineRevision: nextRev });
});

// Export SRT file
router.get('/projects/:id/export/srt', (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  const project = movieExplanationStore.getProject(projectId);

  const captions = project?.timeline?.captions || (project?.script?.segments || []).map((seg, idx) => ({
    id: `cap_${idx + 1}`,
    text: seg.text,
    startTime: seg.voiceoverStart,
    endTime: seg.voiceoverEnd,
  }));

  const formatSrtTime = (seconds: number): string => {
    const s = Math.max(0, seconds);
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = Math.floor(s % 60);
    const ms = Math.floor((s % 1) * 1000);
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  };

  let srtContent = '';
  for (let i = 0; i < captions.length; i++) {
    const c = captions[i];
    srtContent += `${i + 1}\n`;
    srtContent += `${formatSrtTime(c.startTime)} --> ${formatSrtTime(c.endTime)}\n`;
    srtContent += `${c.text}\n\n`;
  }

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${project?.projectName || 'subtitles'}.srt"`);
  res.send(srtContent);
});

// Stream original episode video
router.get('/projects/:id/media/source-video', (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  const project = movieExplanationStore.getProject(projectId);
  const videoPath = project?.originalVideo?.filePath;

  if (!videoPath || !fs.existsSync(videoPath)) {
    return res.status(404).json({ error: 'Source video file not found on disk.' });
  }

  const stat = fs.statSync(videoPath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;
    const file = fs.createReadStream(videoPath, { start, end });

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': 'video/mp4',
    });
    file.pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
    });
    fs.createReadStream(videoPath).pipe(res);
  }
});

// Stream voiceover audio
router.get('/projects/:id/media/voiceover', (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  const project = movieExplanationStore.getProject(projectId);
  const audioPath = project?.voiceoverAudio?.filePath;

  if (!audioPath || !fs.existsSync(audioPath)) {
    return res.status(404).json({ error: 'Voiceover audio file not found on disk.' });
  }

  const stat = fs.statSync(audioPath);
  const fileSize = stat.size;
  const range = req.headers.range;
  const ext = path.extname(audioPath).toLowerCase();
  const contentType = ext === '.wav' ? 'audio/wav' : ext === '.ogg' ? 'audio/ogg' : 'audio/mpeg';

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;
    const file = fs.createReadStream(audioPath, { start, end });

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': contentType,
    });
    file.pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': contentType,
    });
    fs.createReadStream(audioPath).pipe(res);
  }
});

// ── Rights-Aware Asset Management & Replacement Routes (Requirements 2, 3, 4, 5, 7) ──

// Upload a licensed stock video, original graphic, or diagram replacement asset
router.post(
  '/projects/:id/assets/upload-visual',
  visualUpload.single('file'),
  async (req: Request, res: Response) => {
    const projectId = getProjectId(req);
    const project = movieExplanationStore.getProject(projectId);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No replacement visual file uploaded' });
    }

    try {
      const filePath = req.file.path;
      const originalFilename = req.file.originalname;
      const isImage = /\.(jpg|jpeg|png|webp|svg)$/i.test(filePath);

      let duration = 0;
      let width = 1920;
      let height = 1080;
      let fps = 30;

      if (!isImage) {
        try {
          const meta = await extractMetadata(filePath);
          duration = meta.duration;
          width = meta.width;
          height = meta.height;
          fps = meta.fps;
        } catch (probeErr) {
          console.warn('[upload-visual] Metadata extraction warning:', probeErr);
        }
      }

      const assetCategory = (req.body.assetCategory as VisualAssetCategory) || (isImage ? 'original_graphic' : 'licensed_stock');
      const rightsMetadata = rightsManagementService.createInitialRightsMetadata(
        originalFilename,
        assetCategory,
        {
          rightsStatus: (req.body.rightsStatus as AssetRightsStatus) || (isImage ? 'owned' : 'licensed'),
          sourceReference: req.body.sourceReference,
          licenseDetails: req.body.licenseDetails,
          evidenceReference: req.body.evidenceReference,
          usageRestrictions: req.body.usageRestrictions,
          attributionRequirements: req.body.attributionRequirements,
          notes: req.body.notes,
        }
      );

      const newAsset: MovieExplanationClipAsset = {
        clipId: `asset_${uuid().slice(0, 8)}`,
        filename: path.basename(filePath),
        originalFilename,
        filePath,
        duration,
        width,
        height,
        fps,
        fileSize: req.file.size,
        isAnalyzed: true,
        rightsMetadata,
        assetCategory,
      };

      project.replacementAssets = project.replacementAssets || [];
      project.replacementAssets.push(newAsset);

      movieExplanationStore.saveProject(project);

      res.json({
        success: true,
        asset: newAsset,
        message: 'Replacement visual uploaded and rights metadata registered.',
      });
    } catch (err: any) {
      res.status(500).json({ error: `Visual asset processing failed: ${err.message}` });
    }
  }
);

// List replacement assets available in project
router.get('/projects/:id/replacement-assets', (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  const project = movieExplanationStore.getProject(projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json({ assets: project.replacementAssets || [] });
});

// Replace a timeline shot with a licensed stock video, original graphic, or diagram
router.post('/projects/:id/shots/:shotId/replace-with-asset', (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  const { shotId } = req.params;
  const { assetId, alignmentMode, startOffset } = req.body;
  const project = movieExplanationStore.getProject(projectId);

  if (!project?.timeline) {
    return res.status(400).json({ error: 'Project timeline not found' });
  }

  const shot = project.timeline.shots.find((s) => s.shotId === shotId);
  if (!shot) {
    return res.status(404).json({ error: `Shot ${shotId} not found` });
  }

  const asset =
    (project.replacementAssets || []).find((a) => a.clipId === assetId) ||
    (project.uploadedClips || []).find((a) => a.clipId === assetId);

  if (!asset) {
    return res.status(404).json({ error: `Visual asset ${assetId} not found` });
  }

  const { updatedShot, alignmentNotice } = rightsManagementService.prepareShotReplacement(
    shot,
    {
      assetId: asset.clipId,
      filePath: asset.filePath,
      filename: asset.originalFilename || asset.filename,
      duration: asset.duration,
      width: asset.width,
      height: asset.height,
      rightsMetadata: asset.rightsMetadata,
      assetCategory: asset.assetCategory,
    },
    (alignmentMode as ShotAlignmentMode) || 'fit_narration',
    Number(startOffset || 0)
  );

  const shotIdx = project.timeline.shots.findIndex((s) => s.shotId === shotId);
  project.timeline.shots[shotIdx] = updatedShot;

  // Transactional revision increment and export invalidation
  const nextRev = (project.timelineRevision || project.timeline.timelineRevision || 1) + 1;
  project.timelineRevision = nextRev;
  project.timeline.timelineRevision = nextRev;
  project.exportStatus = 'outdated';
  project.status = 'timeline_ready';

  // Re-evaluate quality gate so rights review updates immediately
  const qualityReport = movieExplanationQualityGate.evaluateTimeline(
    project.timeline,
    project.voiceoverAudio?.duration || project.timeline.duration,
    project.episodeIndex
  );
  project.qualityReport = qualityReport;
  project.rightsAudit = qualityReport.rightsReview;

  movieExplanationStore.saveProject(project);

  res.json({
    success: true,
    shot: updatedShot,
    timelineRevision: nextRev,
    alignmentNotice,
    qualityReport,
    exportStatus: 'outdated',
  });
});

// Update rights metadata for an individual shot
router.put('/projects/:id/shots/:shotId/rights', (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  const { shotId } = req.params;
  const project = movieExplanationStore.getProject(projectId);

  if (!project?.timeline) {
    return res.status(404).json({ error: 'Timeline not found' });
  }

  const shot = project.timeline.shots.find((s) => s.shotId === shotId);
  if (!shot) {
    return res.status(404).json({ error: `Shot ${shotId} not found` });
  }

  const {
    rightsStatus,
    sourceReference,
    licenseDetails,
    evidenceReference,
    usageRestrictions,
    attributionRequirements,
    notes,
  } = req.body;

  const finalStatus: AssetRightsStatus = (rightsStatus || shot.rightsStatus || 'unverified') as AssetRightsStatus;
  shot.rightsStatus = finalStatus;
  shot.rightsMetadata = {
    rightsStatus: finalStatus,
    sourceFilename: shot.rightsMetadata?.sourceFilename || shot.sourceFile,
    sourceReference: sourceReference ?? shot.rightsMetadata?.sourceReference,
    licenseDetails: licenseDetails ?? shot.rightsMetadata?.licenseDetails,
    evidenceReference: evidenceReference ?? shot.rightsMetadata?.evidenceReference,
    usageRestrictions: usageRestrictions ?? shot.rightsMetadata?.usageRestrictions,
    attributionRequirements: attributionRequirements ?? shot.rightsMetadata?.attributionRequirements,
    notes: notes ?? shot.rightsMetadata?.notes,
    updatedAt: new Date().toISOString(),
  };

  const qualityReport = movieExplanationQualityGate.evaluateTimeline(
    project.timeline,
    project.voiceoverAudio?.duration || project.timeline.duration,
    project.episodeIndex
  );
  project.qualityReport = qualityReport;
  project.rightsAudit = qualityReport.rightsReview;

  movieExplanationStore.saveProject(project);
  res.json({ success: true, shot, qualityReport });
});

// Get comprehensive Pre-Export Rights Review
router.get('/projects/:id/rights-review', (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  const project = movieExplanationStore.getProject(projectId);
  if (!project?.timeline) {
    return res.status(404).json({ error: 'Timeline not found' });
  }

  const rightsReview = rightsManagementService.auditTimelineRights(
    project.timeline.shots,
    project.episodeIndex?.scenes
  );
  res.json({ rightsReview });
});

// Acknowledge pre-export rights warnings
router.post('/projects/:id/acknowledge-rights', (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  const project = movieExplanationStore.getProject(projectId);
  if (!project?.timeline) {
    return res.status(404).json({ error: 'Timeline not found' });
  }

  const rightsReview = rightsManagementService.auditTimelineRights(
    project.timeline.shots,
    project.episodeIndex?.scenes
  );
  rightsReview.userAcknowledged = true;
  rightsReview.acknowledgedAt = new Date().toISOString();

  project.rightsAudit = rightsReview;
  movieExplanationStore.saveProject(project);

  res.json({ success: true, rightsReview });
});

// AI Script Review: Original commentary, third-party dependence, and hook/climax coherence
router.get('/projects/:id/script-review', (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  const project = movieExplanationStore.getProject(projectId);
  if (!project?.script) {
    return res.status(404).json({ error: 'Explanation script not found for project' });
  }

  const scriptReview = scriptReviewService.reviewScript(project.script, project.timeline);
  project.scriptReview = scriptReview;
  movieExplanationStore.saveProject(project);

  res.json({ scriptReview });
});

// Edit narration segment text directly from review suggestions
router.put('/projects/:id/script-segments/:segmentId', (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  const { segmentId } = req.params;
  const { text } = req.body;
  const project = movieExplanationStore.getProject(projectId);

  if (!project?.script) {
    return res.status(404).json({ error: 'Explanation script not found' });
  }

  const segment = project.script.segments.find((s) => s.segmentId === segmentId);
  if (!segment) {
    return res.status(404).json({ error: `Segment ${segmentId} not found` });
  }

  if (typeof text === 'string' && text.trim().length > 0) {
    segment.text = text.trim();
  }

  // Update corresponding timeline shots description
  if (project.timeline) {
    for (const shot of project.timeline.shots) {
      if (shot.segmentId === segmentId) {
        shot.sceneDescription = segment.text;
      }
    }
  }

  // Recalculate script review
  project.scriptReview = scriptReviewService.reviewScript(project.script, project.timeline);
  movieExplanationStore.saveProject(project);

  res.json({ success: true, segment, scriptReview: project.scriptReview });
});

// Inspect or download pre-render validated export manifest
router.get('/projects/:id/export-manifest', (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  const project = movieExplanationStore.getProject(projectId);
  if (!project?.timeline || !project?.voiceoverAudio?.filePath) {
    return res.status(404).json({ error: 'Timeline or voiceover not found for project' });
  }

  const settings = project.timeline.transformativeSettings;
  const manifest = movieExplanationRenderer.generateExportManifest(
    projectId,
    project.timeline,
    project.voiceoverAudio.filePath,
    {
      width: project.timeline.outputWidth || 1920,
      height: project.timeline.outputHeight || 1080,
      fps: project.timeline.outputFps || 60,
      aspectRatio: project.timeline.outputAspectRatio,
      qualityPreset: settings?.qualityPreset || 'pro_lossless',
      crf: Number(settings?.crf || 18),
      encoder: settings?.encoder || 'libx264',
      preset: settings?.encoderPreset || 'fast',
    }
  );

  res.json({ manifest });
});

// Export asset-level provenance manifest (JSON or CSV)
router.get('/projects/:id/provenance-manifest', (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  const project = movieExplanationStore.getProject(projectId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const format = String(req.query.format || 'json').toLowerCase();

  if (format === 'csv') {
    const csvContent = provenanceManifestService.exportManifestAsCsv(project);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="provenance_manifest_${projectId}.csv"`);
    return res.send(csvContent);
  }

  const manifest = provenanceManifestService.generateProvenanceManifest(project);
  if (req.query.download === 'true') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="provenance_manifest_${projectId}.json"`);
    return res.send(JSON.stringify(manifest, null, 2));
  }

  res.json({ manifest });
});

// Scan local directory for public domain, creative commons, or stock assets
router.post('/projects/:id/assets/scan-folder', async (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  const project = movieExplanationStore.getProject(projectId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const { folderPath, category, licenseDetails, attributionRequirements } = req.body;
  if (!folderPath) {
    return res.status(400).json({ error: 'folderPath is required' });
  }

  try {
    const assetCategory: VisualAssetCategory = (category as VisualAssetCategory) || 'public_domain';
    const assets = await rightsManagementService.scanAndIngestAssetFolder(
      folderPath,
      assetCategory,
      {
        licenseDetails,
        attributionRequirements,
      }
    );

    project.replacementAssets = project.replacementAssets || [];
    project.replacementAssets.push(...assets);
    movieExplanationStore.saveProject(project);

    res.json({
      success: true,
      count: assets.length,
      assets,
      message: `Successfully ingested ${assets.length} assets from ${folderPath} as ${assetCategory}.`,
    });
  } catch (err: any) {
    res.status(500).json({ error: `Asset scan failed: ${err.message}` });
  }
});

// ── Opening 120-Second Verification Report & Preview Routes ──

router.get('/projects/:id/opening-report', (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  const project = movieExplanationStore.getProject(projectId);

  if (!project?.timeline) {
    return res.status(404).json({ error: 'Timeline not found for project.' });
  }

  const openingReport = openingVerificationGate.verifyOpening(
    project.timeline,
    project.episodeIndex,
    project.script,
    120
  );

  res.json({ report: openingReport });
});

router.post('/projects/:id/preview-opening', async (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  const project = movieExplanationStore.getProject(projectId);

  if (!project?.timeline || !project?.voiceoverAudio?.filePath) {
    return res.status(400).json({ error: 'Timeline and voiceover audio track are required for opening preview.' });
  }

  const maxDuration = Math.min(120, Number(req.body?.duration || 120));

  try {
    broadcastProgress(projectId, 5, 'preview_rendering', `Rendering opening ${maxDuration}s preview...`);

    const previewResult = await movieExplanationRenderer.renderOpeningPreviewVideo(
      projectId,
      project.timeline,
      project.voiceoverAudio.filePath,
      maxDuration,
      (progress, stage, detail) => {
        broadcastProgress(projectId, progress, stage, detail);
      }
    );

    const streamUrl = `/api/movie-explanation/projects/${projectId}/preview-opening/stream`;

    movieExplanationStore.updateProject(projectId, {
      openingPreviewVideoPath: previewResult.outputPath,
      openingPreviewVideoUrl: streamUrl,
    });

    broadcastProgress(projectId, 100, 'completed', 'Opening preview generated successfully!');

    res.json({
      success: true,
      message: `Opening ${previewResult.duration.toFixed(1)}s preview generated successfully.`,
      previewUrl: streamUrl,
      outputPath: previewResult.outputPath,
      duration: previewResult.duration,
      fileSize: previewResult.fileSize,
    });
  } catch (err: any) {
    console.error(`[MovieExplanation] Opening preview failed:`, err);
    res.status(500).json({ error: `Opening preview render failed: ${err.message}` });
  }
});

// Stream opening preview video
router.get('/projects/:id/preview-opening/stream', (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  const project = movieExplanationStore.getProject(projectId);

  if (!project?.openingPreviewVideoPath || !fs.existsSync(project.openingPreviewVideoPath)) {
    return res.status(404).json({ error: 'Opening preview video not found on disk.' });
  }

  const stat = fs.statSync(project.openingPreviewVideoPath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;
    const file = fs.createReadStream(project.openingPreviewVideoPath, { start, end });

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': 'video/mp4',
    });
    file.pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
    });
    fs.createReadStream(project.openingPreviewVideoPath).pipe(res);
  }
});

// ── Auto-Resolve Unmatched Footage ──

router.post('/projects/:id/auto-resolve-unmatched', async (req: Request, res: Response) => {
  try {
    const projectId = getProjectId(req);
    const project = movieExplanationStore.getProject(projectId);

    if (!project?.timeline) {
      return res.status(404).json({ error: 'Project timeline not found.' });
    }

    const { repairedTimeline, resolvedCount } = movieExplanationQualityGate.autoResolveUnmatchedShots(
      project.timeline,
      project.episodeIndex
    );

    const cleanTimeline = movieExplanationQualityGate.autoRepairGaps(repairedTimeline);
    const { repairedTimeline: cadenceTimeline } = movieExplanationQualityGate.autoEnforceScreenshotCadence(
      cleanTimeline,
      project.episodeIndex
    );

    const qualityReport = movieExplanationQualityGate.evaluateTimeline(
      cadenceTimeline,
      project.voiceoverAudio?.duration || cadenceTimeline.duration,
      project.episodeIndex
    );

    const updated = movieExplanationStore.updateProject(projectId, {
      timeline: cadenceTimeline,
      qualityReport,
      timelineRevision: (project.timelineRevision || 1) + (resolvedCount > 0 ? 1 : 0),
    });

    res.json({
      success: true,
      message: `Auto-resolved ${resolvedCount} shots with valid movie footage.`,
      resolvedCount,
      qualityReport,
      project: updated,
    });
  } catch (err: any) {
    console.error('[MovieExplanation] auto-resolve-unmatched error:', err);
    res.status(500).json({ success: false, error: err.message || 'Auto-resolve unmatched failed' });
  }
});

// ── Auto-Enforce Screenshot Cadence ──
router.post('/projects/:id/enforce-cadence', async (req: Request, res: Response) => {
  try {
    const projectId = getProjectId(req);
    const project = movieExplanationStore.getProject(projectId);

    if (!project?.timeline) {
      return res.status(404).json({ error: 'Project timeline not found.' });
    }

    const { repairedTimeline, convertedCount } = movieExplanationQualityGate.autoEnforceScreenshotCadence(
      project.timeline,
      project.episodeIndex
    );

    const nextRev = (project.timelineRevision || 1) + (convertedCount > 0 ? 1 : 0);
    repairedTimeline.timelineRevision = nextRev;

    const qualityReport = movieExplanationQualityGate.evaluateTimeline(
      repairedTimeline,
      project.voiceoverAudio?.duration || repairedTimeline.duration,
      project.episodeIndex
    );

    const updated = movieExplanationStore.updateProject(projectId, {
      timeline: repairedTimeline,
      qualityReport,
      timelineRevision: nextRev,
      exportStatus: convertedCount > 0 ? 'outdated' : project.exportStatus,
    });

    res.json({
      success: true,
      convertedCount,
      shots: repairedTimeline.shots,
      qualityReport,
      project: updated,
    });
  } catch (err: any) {
    console.error('[MovieExplanation] enforce-cadence error:', err);
    res.status(500).json({ success: false, error: err.message || 'Enforce cadence failed' });
  }
});

// ── Auto-Vary Repeated Scenes ──
router.post('/projects/:id/auto-vary-repeated-scenes', async (req: Request, res: Response) => {
  try {
    const projectId = getProjectId(req);
    const project = movieExplanationStore.getProject(projectId);

    if (!project?.timeline) {
      return res.status(404).json({ error: 'Project timeline not found.' });
    }

    const { repairedTimeline: variedTimeline, replacedCount } = movieExplanationQualityGate.autoVaryRepeatedScenes(
      project.timeline,
      project.episodeIndex
    );

    const { repairedTimeline: finalTimeline } = movieExplanationQualityGate.autoEnforceScreenshotCadence(
      variedTimeline,
      project.episodeIndex
    );

    const nextRev = (project.timelineRevision || 1) + (replacedCount > 0 ? 1 : 0);
    finalTimeline.timelineRevision = nextRev;

    const qualityReport = movieExplanationQualityGate.evaluateTimeline(
      finalTimeline,
      project.voiceoverAudio?.duration || finalTimeline.duration,
      project.episodeIndex
    );

    const updated = movieExplanationStore.updateProject(projectId, {
      timeline: finalTimeline,
      qualityReport,
      timelineRevision: nextRev,
      exportStatus: replacedCount > 0 ? 'outdated' : project.exportStatus,
    });

    res.json({
      success: true,
      replacedCount,
      shots: finalTimeline.shots,
      qualityReport,
      project: updated,
    });
  } catch (err: any) {
    console.error('[MovieExplanation] auto-vary-repeated-scenes error:', err);
    res.status(500).json({ success: false, error: err.message || 'Auto-vary repeated scenes failed' });
  }
});

// ── Master Video Render ──

router.post('/projects/:id/render', async (req: Request, res: Response) => {
  try {
    const projectId = getProjectId(req);
    const project = movieExplanationStore.getProject(projectId);

    if (!project?.timeline || !project?.voiceoverAudio?.filePath) {
      return res.status(400).json({ error: 'Timeline and voiceover audio track are required to render.' });
    }

    let activeTimeline = project.timeline;

    // Auto-resolve unmatched or bumper-timecode shots if requested (default: true)
    const shouldAutoResolve = req.body?.autoResolveUnmatched !== false;
    const narrativeStart = project.episodeIndex?.narrativeStartTime || 0;
    const hasUnmatchedShots = activeTimeline.shots.some(
      (s) => s.isUnmatched || s.matchScore === 0 || s.sceneId === 'unmatched' || s.sourceStart < narrativeStart
    );

    if (shouldAutoResolve && hasUnmatchedShots && project.episodeIndex) {
      const { repairedTimeline } = movieExplanationQualityGate.autoResolveUnmatchedShots(activeTimeline, project.episodeIndex);
      activeTimeline = repairedTimeline;
      movieExplanationStore.updateProject(projectId, { timeline: activeTimeline });
    }

    // Auto-repair minor timeline gaps
    activeTimeline = movieExplanationQualityGate.autoRepairGaps(activeTimeline);

    // Auto-enforce screenshot cadence so render pre-flight never fails on cadence
    const { repairedTimeline: cadenceRepairedTimeline } = movieExplanationQualityGate.autoEnforceScreenshotCadence(
      activeTimeline,
      project.episodeIndex
    );
    activeTimeline = cadenceRepairedTimeline;
    movieExplanationStore.updateProject(projectId, { timeline: activeTimeline });

    // Pre-flight Quality Gate validation
    const qualityReport = movieExplanationQualityGate.evaluateTimeline(
      activeTimeline,
      project.voiceoverAudio.duration,
      project.episodeIndex
    );

    movieExplanationStore.updateProject(projectId, { qualityReport });

    if (!qualityReport.passed || qualityReport.validationOutcome === 'BLOCKED') {
      const errorDetails = qualityReport.blockedReasons?.length
        ? qualityReport.blockedReasons.join('. ')
        : qualityReport.actionableErrors?.length
        ? qualityReport.actionableErrors.join('. ')
        : 'Quality Gate validation failed. Mandatory requirements blocked export.';
      return res.status(422).json({
        error: errorDetails,
        qualityReport,
        validationOutcome: qualityReport.validationOutcome || 'BLOCKED',
        blockedReasons: qualityReport.blockedReasons || qualityReport.actionableErrors || [],
      });
    }

    // Pre-flight Rights Review acknowledgement check
    const rightsAudit = rightsManagementService.auditTimelineRights(
      activeTimeline.shots,
      project.episodeIndex?.scenes
    );
    const hasFlaggedAssets = rightsAudit.flaggedShotsCount > 0;
    const isAcknowledged = req.body?.acknowledgeRightsWarnings || project.rightsAudit?.userAcknowledged;

    if (hasFlaggedAssets && !isAcknowledged) {
      return res.status(422).json({
        error: 'Unverified or restricted assets remain on the timeline. Please review and acknowledge rights warnings before rendering.',
        requiresRightsAcknowledgement: true,
        rightsReview: rightsAudit,
      });
    }

    const currentRenderRev = project.timelineRevision || activeTimeline.timelineRevision || 1;

    movieExplanationStore.updateProject(projectId, {
      exportStatus: 'rendering',
    });

    // Start background render
    res.json({
      success: true,
      message: 'Master video render initiated.',
      projectId,
      timelineRevision: currentRenderRev,
    });

  // Execute render asynchronously
  (async () => {
    try {
      broadcastProgress(projectId, 5, 'rendering', 'Starting 60 FPS master FFmpeg render...', 'rendering');

      const renderResult = await movieExplanationRenderer.renderExplanationVideo(
        projectId,
        activeTimeline,
        project.voiceoverAudio!.filePath,
        (progress, stage, detail) => {
          broadcastProgress(projectId, progress, stage, detail, 'rendering');
        }
      );

      // Validate rendered output with FFprobe & stream duration check
      const outputMeta = await extractMetadata(renderResult.outputPath);
      const isOutputValid = (renderResult.validation?.isValid ?? true) &&
        outputMeta.duration > 0 &&
        (!outputMeta.videoDuration || outputMeta.videoDuration >= (project.timeline?.duration || 0) - 1.5);

      movieExplanationStore.updateProject(projectId, {
        renderedVideoPath: renderResult.outputPath,
        renderedVideoUrl: `/api/movie-explanation/projects/${projectId}/stream`,
        renderedFileSize: renderResult.fileSize,
        status: isOutputValid ? 'completed' : 'failed',
        renderProgress: 100,
        renderStage: isOutputValid ? 'completed' : 'validation_failed',
        lastExportedRevision: currentRenderRev,
        exportStatus: isOutputValid ? 'up_to_date' : 'failed',
        exportManifest: renderResult.manifest,
        lastExportValidation: {
          passed: isOutputValid,
          duration: outputMeta.duration,
          videoDuration: outputMeta.videoDuration,
          audioDuration: outputMeta.audioDuration,
          fps: outputMeta.fps,
          resolution: `${outputMeta.width}x${outputMeta.height}`,
          fileSize: renderResult.fileSize,
          verifiedAt: new Date().toISOString(),
          issues: renderResult.validation?.issues || [],
          warnings: renderResult.validation?.warnings || [],
        },
      });

      if (!isOutputValid) {
        throw new Error(
          `Rendered output failed validation: ${renderResult.validation?.issues?.join('; ') || 'Video stream truncated or shorter than timeline.'}`
        );
      }

      broadcastProgress(projectId, 100, 'completed', 'Render complete! Pristine 60 FPS master video is ready.', 'completed');
    } catch (err: any) {
      if (movieExplanationRenderer.isAborted(projectId)) {
        console.log(`[MovieExplanation] Render cancelled for project ${projectId}`);
        return;
      }
      console.error(`[MovieExplanation] Render failed:`, err);
      movieExplanationStore.updateProject(projectId, {
        exportStatus: 'failed',
      });
      broadcastProgress(projectId, 0, 'failed', `Render error: ${err.message}`, 'failed');
    }
  })();
  } catch (err: any) {
    console.error('[MovieExplanation] render initiation error:', err);
    res.status(500).json({ success: false, error: err.message || 'Render initiation failed' });
  }
});

// Stream rendered video
router.get('/projects/:id/stream', (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  const project = movieExplanationStore.getProject(projectId);

  if (!project?.renderedVideoPath || !fs.existsSync(project.renderedVideoPath)) {
    return res.status(404).json({ error: 'Rendered video file not found on disk.' });
  }

  const stat = fs.statSync(project.renderedVideoPath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;
    const file = fs.createReadStream(project.renderedVideoPath, { start, end });

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': 'video/mp4',
    });
    file.pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
    });
    fs.createReadStream(project.renderedVideoPath).pipe(res);
  }
});

// Download rendered video
router.get('/projects/:id/download', (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  const project = movieExplanationStore.getProject(projectId);

  if (!project?.renderedVideoPath || !fs.existsSync(project.renderedVideoPath)) {
    return res.status(404).json({ error: 'Rendered video not found' });
  }

  // Set authoritative freshness and revision headers
  res.setHeader('X-Project-Revision', String(project.timelineRevision || 1));
  res.setHeader('X-Exported-Revision', String(project.lastExportedRevision || 1));
  res.setHeader('X-Export-Freshness', project.exportStatus || 'up_to_date');

  // Prevent serving stale export if client explicitly requests strict freshness
  if (req.query.strictFreshness === 'true' && project.exportStatus === 'outdated') {
    return res.status(409).json({
      error: 'Export is outdated. Timeline has been modified since last render.',
      timelineRevision: project.timelineRevision,
      lastExportedRevision: project.lastExportedRevision,
      exportStatus: 'outdated',
    });
  }

  const filename = `${project.projectName.replace(/[^a-zA-Z0-9_-]/g, '_')}_explanation_rev${project.lastExportedRevision || 1}.mp4`;
  res.download(project.renderedVideoPath, filename);
});

// Accept shot match
router.post('/projects/:id/shots/:shotId/accept-match', (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  const shotId = req.params.shotId;
  const project = movieExplanationStore.getProject(projectId);

  if (!project?.timeline) {
    return res.status(404).json({ error: 'Timeline not found' });
  }

  const shot = project.timeline.shots.find((s) => s.shotId === shotId);
  if (!shot) {
    return res.status(404).json({ error: 'Shot not found' });
  }

  shot.isLocked = true;
  shot.duplicateWarning = undefined;
  shot.isUnmatched = false;
  shot.unmatchedReason = undefined;

  const nextRev = (project.timelineRevision || 1) + 1;
  project.timelineRevision = nextRev;
  project.timeline.timelineRevision = nextRev;
  project.exportStatus = 'outdated';

  const qualityReport = movieExplanationQualityGate.evaluateTimeline(
    project.timeline,
    project.voiceoverAudio?.duration || project.timeline.duration,
    project.episodeIndex
  );
  project.qualityReport = qualityReport;

  movieExplanationStore.saveProject(project);
  res.json({ success: true, shot, qualityReport });
});

// Convert shot to screenshot with motion effect
router.post('/projects/:id/shots/:shotId/convert-to-screenshot', (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  const shotId = Array.isArray(req.params.shotId) ? req.params.shotId[0] : (req.params.shotId as string);
  const { motionEffect } = req.body;
  const project = movieExplanationStore.getProject(projectId);

  if (!project?.timeline) {
    return res.status(404).json({ error: 'Timeline not found' });
  }

  const shot = project.timeline.shots.find((s) => s.shotId === shotId);
  if (!shot) {
    return res.status(404).json({ error: 'Shot not found' });
  }

  const validMotions = ['pan_left_to_right', 'pan_right_to_left', 'gentle_zoom_in', 'gentle_zoom_out', 'subtle_diagonal'];
  const chosenMotion = validMotions.includes(motionEffect) ? motionEffect : 'pan_left_to_right';

  shot.presentationType = 'screenshot';
  shot.isScreenshot = true;
  shot.motionEffect = chosenMotion as any;
  shot.screenshotDuration = shot.duration;
  shot.duplicateWarning = undefined;

  const nextRev = (project.timelineRevision || 1) + 1;
  project.timelineRevision = nextRev;
  project.timeline.timelineRevision = nextRev;
  project.exportStatus = 'outdated';

  const qualityReport = movieExplanationQualityGate.evaluateTimeline(
    project.timeline,
    project.voiceoverAudio?.duration || project.timeline.duration,
    project.episodeIndex
  );
  project.qualityReport = qualityReport;

  movieExplanationStore.saveProject(project);
  res.json({ success: true, shot, qualityReport });
});

// Recheck a single narration segment match
router.post('/projects/:id/recheck-segment/:segmentId', (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  const segmentId = Array.isArray(req.params.segmentId) ? req.params.segmentId[0] : (req.params.segmentId as string);
  const project = movieExplanationStore.getProject(projectId);

  if (!project?.timeline || !project.script || !project.episodeIndex) {
    return res.status(404).json({ error: 'Project data (timeline/script/episodeIndex) not found' });
  }

  const segIndex = project.script.segments.findIndex((s) => s.segmentId === segmentId);
  if (segIndex === -1) {
    return res.status(404).json({ error: 'Segment not found' });
  }
  const segment = project.script.segments[segIndex];

  // Collect used scenes from locked shots
  const usedScenes = new Set<string>();
  for (const s of project.timeline.shots) {
    if (s.isLocked && s.sceneId && s.sceneId !== 'unmatched') {
      usedScenes.add(s.sceneId);
    }
  }

  const candidates = storySceneMatcher.matchCandidatesForSegment(
    segment,
    project.episodeIndex,
    project.script.segments,
    segIndex,
    {
      previouslyUsedSceneIds: usedScenes,
      duplicatePolicy: 'strict_no_reuse',
    }
  );

  const topCandidate = candidates.find((c) => !c.isUnmatched) || candidates[0];

  // Update segment mapping
  segment.candidateAlternatives = candidates.slice(0, 5).map((c) => ({
    sceneId: c.scene.sceneId,
    startTime: c.scene.startTime,
    endTime: c.scene.endTime,
    score: c.matchScore,
    reason: c.reasons.join('; '),
  }));

  const shot = project.timeline.shots.find((s) => s.segmentId === segmentId || s.shotId.includes(segmentId));
  if (topCandidate && !topCandidate.isUnmatched) {
    segment.selectedSceneId = topCandidate.scene.sceneId;
    segment.sourceStartTime = topCandidate.scene.startTime;
    segment.sourceEndTime = topCandidate.scene.endTime;
    segment.confidenceScore = topCandidate.confidence;

    if (shot && !shot.isLocked) {
      shot.sceneId = topCandidate.scene.sceneId;
      shot.sourceStart = topCandidate.scene.startTime;
      shot.sourceEnd = Math.min(topCandidate.scene.endTime, topCandidate.scene.startTime + (shot.duration || 3.0));
      shot.confidence = topCandidate.confidence;
      shot.matchScore = topCandidate.matchScore;
      shot.duplicateWarning = topCandidate.duplicateWarning;
    }
  }

  const nextRev = (project.timelineRevision || 1) + 1;
  project.timelineRevision = nextRev;
  project.timeline.timelineRevision = nextRev;
  project.exportStatus = 'outdated';

  const qualityReport = movieExplanationQualityGate.evaluateTimeline(
    project.timeline,
    project.voiceoverAudio?.duration || project.timeline.duration,
    project.episodeIndex
  );
  project.qualityReport = qualityReport;

  movieExplanationStore.saveProject(project);
  res.json({ success: true, segment, shot, qualityReport });
});

// Revalidate timeline on demand
router.post('/projects/:id/revalidate-timeline', (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  const project = movieExplanationStore.getProject(projectId);

  if (!project?.timeline) {
    return res.status(404).json({ error: 'Timeline not found' });
  }

  const qualityReport = movieExplanationQualityGate.evaluateTimeline(
    project.timeline,
    project.voiceoverAudio?.duration || project.timeline.duration,
    project.episodeIndex
  );
  project.qualityReport = qualityReport;

  movieExplanationStore.saveProject(project);
  res.json({ success: true, qualityReport, validationOutcome: qualityReport.validationOutcome });
});

export { router as movieExplanationRouter };
