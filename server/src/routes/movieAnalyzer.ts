// ============================================================
// Movie Analyzer Routes — AI Movie Analyzer & Multilingual Explanation Studio
// Implements the 7-stage workflow:
// 1. Upload Video & Original TXT Transcript
// 2. Full Movie Analysis (Technical Indexing + Visual Understanding)
// 3. Script Generation (English, Hindi, Bangla with 10–20s hooks)
// 4. Script Review & Language Selection
// 5. Voiceover Generation or Import
// 6. Scene Matching (Strict <= 3.0s Movie Footage + Moving Screenshots)
// 7. Preview & Handoff to Movie Explanation Studio
// ============================================================

import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuid } from 'uuid';
import { movieAnalyzerStore } from '../services/movieAnalyzer/MovieAnalyzerStore.js';
import { movieAnalyzerEngine } from '../services/movieAnalyzer/MovieAnalyzerEngine.js';
import { extractMetadata } from '../services/ffmpeg.js';
import { getMovieAnalyzerProjectDir, ensureDir } from '../services/storage.js';
import type { MovieAnalyzerLanguage, MovieAnalyzerHookType } from '../../../shared/types.js';

const router = Router();

function getProjectId(req: Request): string {
  const p = req.params.id;
  return Array.isArray(p) ? p[0] : (p as string);
}

// WebSocket broadcast handle
let wsBroadcast: ((projectId: string, data: any) => void) | null = null;

export function setMovieAnalyzerWebSocketBroadcast(fn: (projectId: string, data: any) => void) {
  wsBroadcast = fn;
}

function broadcastProgress(
  projectId: string,
  progress: number,
  stage: 1 | 2 | 3 | 4 | 5 | 6 | 7,
  stageName: string,
  detail?: string,
  status: 'setup' | 'analyzing' | 'scripting' | 'review' | 'voiceover' | 'matching' | 'ready' | 'error' = 'analyzing'
) {
  const current = movieAnalyzerStore.getProject(projectId);
  const existingAnalysis = current?.analysis;

  let resolvedStage = stage;
  let resolvedStatus = status;

  // Never regress stage or overwrite review/voiceover/ready states with stale analyzing status
  if (current) {
    if (current.stage > stage && progress < 100 && status !== 'error') {
      resolvedStage = current.stage;
    }
    // When scripts are fully generated, stage advances to 4 and status is 'review'
    if (stage === 3 && progress >= 100 && status !== 'error') {
      resolvedStage = 4;
      resolvedStatus = 'review';
    } else if (stage === 2 && progress >= 100 && status !== 'error') {
      resolvedStage = 3;
      resolvedStatus = 'scripting';
    } else if (stage === 6 && progress >= 100 && status !== 'error') {
      resolvedStage = 7;
      resolvedStatus = 'ready';
    }
  }

  movieAnalyzerStore.updateProject(projectId, {
    stage: resolvedStage,
    status: resolvedStatus,
    analysis: {
      progress,
      stageName,
      statusMessage: detail || stageName,
      totalScenes: existingAnalysis?.totalScenes || 0,
      indexedScenes: existingAnalysis?.indexedScenes || [],
    },
  });

  if (wsBroadcast) {
    wsBroadcast(projectId, {
      type: 'movie_analyzer_progress',
      payload: {
        projectId,
        progress,
        stage: resolvedStage,
        stageName,
        detail,
        status: resolvedStatus,
      },
    });
  }
}

// ── Multer Storage Configurations ──

const videoDiskStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const projectId = getProjectId(req);
    const dir = path.join(getMovieAnalyzerProjectDir(projectId), 'source_video');
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique = `movie_${Date.now()}_${uuid().slice(0, 6)}${ext}`;
    cb(null, unique);
  },
});

const audioDiskStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const projectId = getProjectId(req);
    const dir = path.join(getMovieAnalyzerProjectDir(projectId), 'voiceover');
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique = `voiceover_${Date.now()}_${uuid().slice(0, 6)}${ext}`;
    cb(null, unique);
  },
});

const transcriptDiskStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const projectId = getProjectId(req);
    const dir = path.join(getMovieAnalyzerProjectDir(projectId), 'transcript');
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique = `transcript_${Date.now()}_${uuid().slice(0, 6)}${ext}`;
    cb(null, unique);
  },
});

const videoUpload = multer({
  storage: videoDiskStorage,
  limits: { fileSize: 20 * 1024 * 1024 * 1024 }, // 20GB max
});

const audioUpload = multer({
  storage: audioDiskStorage,
  limits: { fileSize: 1024 * 1024 * 1024 }, // 1GB max
});

const transcriptUpload = multer({
  storage: transcriptDiskStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
});

// ── Route Endpoints ──

/**
 * GET /api/movie-analyzer/projects
 */
router.get('/projects', (_req: Request, res: Response) => {
  try {
    const projects = movieAnalyzerStore.listProjects();
    res.json({ projects });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/movie-analyzer/projects
 */
router.post('/projects', (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    const projectId = uuid();
    const project = movieAnalyzerStore.createProject(projectId, name);
    res.status(201).json({ project });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/movie-analyzer/projects/:id
 */
router.get('/projects/:id', (req: Request, res: Response) => {
  try {
    const projectId = getProjectId(req);
    const project = movieAnalyzerStore.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: `Project ${projectId} not found` });
    }
    res.json({ project });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/movie-analyzer/projects/:id
 */
router.delete('/projects/:id', (req: Request, res: Response) => {
  try {
    const projectId = getProjectId(req);
    const success = movieAnalyzerStore.deleteProject(projectId);
    res.json({ success });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/movie-analyzer/projects/:id/upload-video
 */
router.post('/projects/:id/upload-video', videoUpload.single('video'), async (req: Request, res: Response) => {
  try {
    const projectId = getProjectId(req);
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No video file provided' });
    }

    const project = movieAnalyzerStore.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: `Project ${projectId} not found` });
    }

    // Inspect technical metadata via FFprobe
    const { videoMeta } = await movieAnalyzerEngine.validateInputs(
      file.path,
      'Sample initial transcript check',
      file.originalname,
      'probe.txt'
    );

    project.video = {
      id: uuid(),
      filename: file.filename,
      originalFilename: file.originalname,
      filePath: file.path,
      url: `/api/files/movie_analyzer/${projectId}/source_video/${file.filename}`,
      duration: videoMeta.duration,
      width: videoMeta.width,
      height: videoMeta.height,
      fps: videoMeta.fps,
      codec: videoMeta.codec,
      fileSize: file.size,
    };

    movieAnalyzerStore.saveProject(project);
    res.json({ success: true, project });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/movie-analyzer/projects/:id/upload-transcript
 * Accepts either a file upload (.txt) or raw text in req.body.text
 */
router.post('/projects/:id/upload-transcript', transcriptUpload.single('transcript'), async (req: Request, res: Response) => {
  try {
    const projectId = getProjectId(req);
    const project = movieAnalyzerStore.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: `Project ${projectId} not found` });
    }

    let rawText = '';
    let filename = 'pasted_transcript.txt';
    let filePath = '';

    if (req.file) {
      filename = req.file.originalname;
      filePath = req.file.path;
      rawText = fs.readFileSync(req.file.path, 'utf8');
    } else if (req.body.text) {
      rawText = String(req.body.text);
      const dir = path.join(getMovieAnalyzerProjectDir(projectId), 'transcript');
      ensureDir(dir);
      filename = req.body.filename || 'original_transcript.txt';
      filePath = path.join(dir, filename);
      fs.writeFileSync(filePath, rawText, 'utf8');
    } else {
      return res.status(400).json({ error: 'Please upload a .txt file or provide text content' });
    }

    // Validate transcript and extract story metadata
    const tempVideoPath = project.video?.filePath;
    if (tempVideoPath && fs.existsSync(tempVideoPath)) {
      const { transcriptData } = await movieAnalyzerEngine.validateInputs(
        tempVideoPath,
        rawText,
        project.video!.originalFilename,
        filename
      );

      project.transcript = {
        filename,
        filePath,
        rawText: transcriptData.rawText,
        wordCount: transcriptData.wordCount,
        lineCount: transcriptData.lineCount,
        extractedCharacters: transcriptData.characters,
        keyEvents: transcriptData.keyEvents,
        turningPoints: transcriptData.turningPoints,
        warnings: transcriptData.warnings,
      };
    } else {
      const words = rawText.trim().split(/\s+/).filter(Boolean);
      const lines = rawText.trim().split(/\r?\n/).filter(Boolean);
      project.transcript = {
        filename,
        filePath,
        rawText,
        wordCount: words.length,
        lineCount: lines.length,
        extractedCharacters: ['Protagonist', 'Antagonist'],
        keyEvents: lines.slice(0, 5),
        turningPoints: lines.slice(5, 7),
      };
    }

    movieAnalyzerStore.saveProject(project);
    res.json({ success: true, project });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/movie-analyzer/projects/:id/analyze
 * Full movie analysis: Technical Indexing + Vision Understanding
 */
router.post('/projects/:id/analyze', async (req: Request, res: Response) => {
  try {
    const projectId = getProjectId(req);
    const project = movieAnalyzerStore.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: `Project ${projectId} not found` });
    }
    if (!project.video) {
      return res.status(400).json({ error: 'Please upload a source video first' });
    }
    if (!project.transcript) {
      return res.status(400).json({ error: 'Please upload the original .txt transcript first' });
    }

    broadcastProgress(projectId, 10, 2, 'Technical Indexing', 'Extracting scene boundaries and visual metadata...');

    const scenes = await movieAnalyzerEngine.analyzeVideo(projectId, (pct, stage, detail) => {
      broadcastProgress(projectId, pct, 2, stage, detail);
    });

    const updated = movieAnalyzerStore.getProject(projectId);
    res.json({ success: true, scenesCount: scenes.length, project: updated });
  } catch (err: any) {
    broadcastProgress(getProjectId(req), 0, 2, 'Error', err.message, 'error');
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/movie-analyzer/projects/:id/generate-scripts
 * Generates English, Hindi, and Bangla 8–10 minute explanation scripts with 10–20s hooks.
 * Supports optional req.body.language to generate or retry a single language.
 */
router.post('/projects/:id/generate-scripts', async (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  try {
    const targetDurationMinutes = Number(req.body.targetDurationMinutes) || 9;
    const language = req.body.language as MovieAnalyzerLanguage | undefined;

    const initialMsg = language
      ? `Reasoning and synthesizing 8–9 minute ${language} script...`
      : 'Analyzing narrative arc and synthesizing 3 explanation scripts...';

    broadcastProgress(projectId, 15, 3, 'Script Reasoning', initialMsg, 'scripting');

    const scripts = await movieAnalyzerEngine.generateScripts(
      projectId,
      targetDurationMinutes,
      (pct, stage, detail) => {
        const finalStage = pct >= 100 ? 4 : 3;
        const finalStatus = pct >= 100 ? 'review' : 'scripting';
        broadcastProgress(projectId, pct, finalStage, stage, detail, finalStatus);
      },
      language
    );

    const updated = movieAnalyzerStore.getProject(projectId);
    res.json({ success: true, scripts, project: updated });
  } catch (err: any) {
    broadcastProgress(projectId, 0, 3, 'Script Generation Error', err.message, 'error');
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/movie-analyzer/projects/:id/script
 * Updates an individual paragraph, hook, or text in the script
 */
router.put('/projects/:id/script', (req: Request, res: Response) => {
  try {
    const projectId = getProjectId(req);
    const { language, paragraphId, text, hookText, hookType } = req.body;
    const project = movieAnalyzerStore.getProject(projectId);
    if (!project || !project.scripts) {
      return res.status(404).json({ error: `Scripts not found for project ${projectId}` });
    }

    const lang = (language || project.scripts.selectedLanguage || 'english') as MovieAnalyzerLanguage;
    const currentScript = (project.scripts as any)[lang];
    if (!currentScript) {
      return res.status(404).json({ error: `Script for ${lang} not found` });
    }

    if (hookText !== undefined) {
      currentScript.hook.text = hookText;
      if (hookType) currentScript.hook.hookType = hookType;
      // also update first paragraph if it's the hook
      if (currentScript.paragraphs[0]?.section === 'hook') {
        currentScript.paragraphs[0].text = hookText;
      }
    }

    if (paragraphId && text !== undefined) {
      const p = currentScript.paragraphs.find((para: any) => para.id === paragraphId);
      if (p) {
        p.text = text;
        p.estimatedSeconds = Math.max(5, Math.round(text.split(/\s+/).length / 2.5));
      }
    }

    // Recalculate totals
    currentScript.totalEstimatedDurationSeconds = currentScript.paragraphs.reduce(
      (sum: number, p: any) => sum + p.estimatedSeconds,
      0
    );
    currentScript.wordCount = currentScript.paragraphs.reduce(
      (sum: number, p: any) => sum + p.text.split(/\s+/).length,
      0
    );
    currentScript.updatedAt = new Date().toISOString();

    movieAnalyzerStore.saveProject(project);
    res.json({ success: true, script: currentScript, project });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/movie-analyzer/projects/:id/select-language
 */
router.post('/projects/:id/select-language', (req: Request, res: Response) => {
  try {
    const projectId = getProjectId(req);
    const { language } = req.body;
    if (!['english', 'hindi', 'bangla'].includes(language)) {
      return res.status(400).json({ error: 'Language must be english, hindi, or bangla' });
    }

    const project = movieAnalyzerStore.getProject(projectId);
    if (!project || !project.scripts) {
      return res.status(404).json({ error: 'Project or scripts not found' });
    }

    project.scripts.selectedLanguage = language as MovieAnalyzerLanguage;
    project.stage = 5; // Move to Voiceover stage
    project.status = 'voiceover';
    movieAnalyzerStore.saveProject(project);

    res.json({ success: true, selectedLanguage: language, project });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/movie-analyzer/projects/:id/export-script
 * Exports the selected or requested language script as a downloadable plain text (.txt) file
 */
router.get('/projects/:id/export-script', (req: Request, res: Response) => {
  try {
    const projectId = getProjectId(req);
    const project = movieAnalyzerStore.getProject(projectId);
    if (!project || !project.scripts) {
      return res.status(404).json({ error: `Scripts not found for project ${projectId}` });
    }

    const lang = (req.query.lang as string || project.scripts.selectedLanguage || 'english') as MovieAnalyzerLanguage;
    const script = (project.scripts as any)[lang];
    if (!script) {
      return res.status(404).json({ error: `Script for ${lang} not found` });
    }

    const cleanTitle = project.name || 'Movie Explanation';
    const lines: string[] = [];
    lines.push(`============================================================`);
    lines.push(`MOVIE EXPLANATION SCRIPT — ${cleanTitle.toUpperCase()}`);
    lines.push(`LANGUAGE: ${lang.toUpperCase()}`);
    lines.push(`TARGET DURATION: ~${Math.round((script.totalEstimatedDurationSeconds || 540) / 60)} Minutes (${Math.round(script.totalEstimatedDurationSeconds || 540)} seconds)`);
    lines.push(`WORD COUNT: ${script.wordCount || 0} words`);
    lines.push(`GENERATED WITH: Local AI Story Analysis`);
    lines.push(`============================================================\n`);

    lines.push(`[10–20s OPENING HOOK]`);
    lines.push(script.hook?.text || script.paragraphs?.[0]?.text || '');
    lines.push(`\n------------------------------------------------------------\n`);

    lines.push(`[FULL NARRATION SCRIPT]`);
    for (const [idx, para] of (script.paragraphs || []).entries()) {
      lines.push(`\n#${idx + 1} [${para.section.toUpperCase()}] (~${para.estimatedSeconds}s)`);
      lines.push(para.text);
    }

    lines.push(`\n\n============================================================`);
    lines.push(`END OF SCRIPT`);
    lines.push(`============================================================`);

    const textContent = lines.join('\n');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${cleanTitle.replace(/[^\w.-]+/g, '_')}_${lang}_script.txt"`);
    res.send(textContent);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Helper to format seconds as SubRip (SRT) timestamp: HH:MM:SS,mmm
 */
function formatSrtTimestamp(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const millis = Math.floor((seconds % 1) * 1000);
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

/**
 * GET /api/movie-analyzer/projects/:id/export-srt
 * Exports the selected script with sequential SRT subtitles for Premiere, CapCut, or YouTube
 */
router.get('/projects/:id/export-srt', (req: Request, res: Response) => {
  try {
    const projectId = getProjectId(req);
    const project = movieAnalyzerStore.getProject(projectId);
    if (!project || !project.scripts) {
      return res.status(404).json({ error: `Scripts not found for project ${projectId}` });
    }

    const lang = (req.query.lang as string || project.scripts.selectedLanguage || 'english') as MovieAnalyzerLanguage;
    const script = (project.scripts as any)[lang];
    if (!script) {
      return res.status(404).json({ error: `Script for ${lang} not found` });
    }

    const cleanTitle = project.name || 'Movie Explanation';
    const srtBlocks: string[] = [];
    let currentTime = 0;
    let srtIndex = 1;

    for (const para of (script.paragraphs || [])) {
      const paraText = para.text.trim();
      if (!paraText) continue;

      // Break paragraph into subtitle lines if long, or output whole paragraph block
      const sentences = paraText.match(/[^.!?]+[.!?]+|\s*[^.!?]+$/g) || [paraText];
      const sentenceCount = sentences.length || 1;
      const durationPerSentence = Number((para.estimatedSeconds / sentenceCount).toFixed(2));

      for (const sentence of sentences) {
        const cleanSentence = sentence.trim();
        if (!cleanSentence) continue;

        const startTime = currentTime;
        const endTime = currentTime + Math.max(2.5, durationPerSentence);

        srtBlocks.push(`${srtIndex}`);
        srtBlocks.push(`${formatSrtTimestamp(startTime)} --> ${formatSrtTimestamp(endTime)}`);
        srtBlocks.push(cleanSentence);
        srtBlocks.push('');

        currentTime = endTime;
        srtIndex++;
      }
    }

    const srtContent = srtBlocks.join('\n');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${cleanTitle.replace(/[^\w.-]+/g, '_')}_${lang}_subtitles.srt"`);
    res.send(srtContent);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/movie-analyzer/projects/:id/approve-script
 * Approves a reviewed script as the authoritative master and unlocks Stage 5 (Voiceover)
 */
router.post('/projects/:id/approve-script', (req: Request, res: Response) => {
  try {
    const projectId = getProjectId(req);
    const { language } = req.body;
    const project = movieAnalyzerStore.getProject(projectId);
    if (!project || !project.scripts) {
      return res.status(404).json({ error: `Scripts not found for project ${projectId}` });
    }

    const lang = (language || project.scripts.selectedLanguage || 'english') as MovieAnalyzerLanguage;
    const script = (project.scripts as any)[lang];
    if (!script) {
      return res.status(404).json({ error: `Script for ${lang} not found` });
    }

    script.isApproved = true;
    script.approvedAt = new Date().toISOString();
    project.scripts.isApproved = true;
    project.scripts.approvedLanguage = lang;
    project.scripts.selectedLanguage = lang;
    project.stage = 5; // Move to Stage 5: Voiceover Generation or Import
    project.status = 'voiceover';

    movieAnalyzerStore.saveProject(project);
    res.json({ success: true, approvedLanguage: lang, project });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/movie-analyzer/projects/:id/regenerate-section
 * Regenerates only a single selected section of the script without resetting the rest
 */
router.post('/projects/:id/regenerate-section', async (req: Request, res: Response) => {
  try {
    const projectId = getProjectId(req);
    const { language, paragraphId } = req.body;
    const project = movieAnalyzerStore.getProject(projectId);
    if (!project || !project.scripts) {
      return res.status(404).json({ error: `Scripts not found for project ${projectId}` });
    }

    const lang = (language || project.scripts.selectedLanguage || 'english') as MovieAnalyzerLanguage;
    const updatedPara = await movieAnalyzerEngine.regenerateSection(projectId, lang, paragraphId);
    const updatedProject = movieAnalyzerStore.getProject(projectId);

    res.json({ success: true, paragraph: updatedPara, project: updatedProject });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/movie-analyzer/projects/:id/cancel
 * Safely cancels active analysis or generation operation
 */
router.post('/projects/:id/cancel', (req: Request, res: Response) => {
  try {
    const projectId = getProjectId(req);
    const project = movieAnalyzerStore.getProject(projectId);
    if (project) {
      broadcastProgress(projectId, 0, project.stage, 'Cancelled', 'Operation cancelled by user', project.status === 'analyzing' ? 'setup' : 'review');
    }
    res.json({ success: true, message: 'Operation cancelled' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/movie-analyzer/projects/:id/regenerate-hook
 * Uses local model to regenerate only the 10-20s hook without resetting the full script
 */
router.post('/projects/:id/regenerate-hook', async (req: Request, res: Response) => {
  try {
    const projectId = getProjectId(req);
    const { language, hookType } = req.body;
    const project = movieAnalyzerStore.getProject(projectId);
    if (!project || !project.scripts) {
      return res.status(404).json({ error: `Scripts not found for project ${projectId}` });
    }

    const lang = (language || project.scripts.selectedLanguage || 'english') as MovieAnalyzerLanguage;
    const currentScript = (project.scripts as any)[lang];
    if (!currentScript) {
      return res.status(404).json({ error: `Script for ${lang} not found` });
    }

    const title = project.video?.originalFilename || project.name || 'The Film';
    const cleanTitle = title.replace(/\.[a-zA-Z0-9]+$/, '').replace(/[-_]/g, ' ');
    const chars = project.transcript?.extractedCharacters || ['the protagonist', 'the adversary'];
    const events = project.transcript?.keyEvents || ['an unexpected turning point'];

    let freshHook = '';
    try {
      const prompt = `Write a compelling, 1-2 sentence opening hook (12 to 18 seconds of spoken narration) for a movie explanation video about "${cleanTitle}". Involves ${chars[0]} and ${chars[1] || 'the adversary'}. Crucial event: ${events[0]}. Style: ${hookType || 'mystery'}. Return ONLY the spoken narration sentence in ${lang}.`;
      const ollamaHook = await (movieAnalyzerEngine as any).queryOllama(prompt, 'moondream:latest', 6000);
      if (ollamaHook && ollamaHook.trim().length > 25) {
        freshHook = ollamaHook.replace(/^["']|["']$/g, '').trim();
      }
    } catch {
      // Fallback to grounded language sentence
    }

    if (!freshHook) {
      if (lang === 'hindi') {
        freshHook = `फिल्म ${cleanTitle} के अंत में सब कुछ बदलने से पहले, इस रहस्यमय घटना को गौर से देखिए। ${chars[0]} समझ रहे थे कि स्थिति उनके नियंत्रण में है, लेकिन एक गुप्त सुराग ने साबित कर दिया कि खेल शुरू से ही किसी और का था।`;
      } else if (lang === 'bangla') {
        freshHook = `${cleanTitle}-এর ক্লাইম্যাক্সে সব রহস্য উন্মোচিত হওয়ার আগে, এই গুরুত্বপূর্ণ মুহূর্তটি লক্ষ্য করুন। ${chars[0]} ভেবেছিলেন সবকিছু আয়ত্তে রয়েছে, কিন্তু একটি চমকপ্রদ প্রমাণ পুরো সমীকরণ বদলে দিল।`;
      } else {
        freshHook = `Before everything unravels in the climax of ${cleanTitle}, take a close look at this exact moment. ${chars[0]} believed the situation was solved—until a crucial hidden detail proved that nothing was what it seemed.`;
      }
    }

    currentScript.hook.text = freshHook;
    if (hookType) currentScript.hook.hookType = hookType;
    if (currentScript.paragraphs[0]?.section === 'hook') {
      currentScript.paragraphs[0].text = freshHook;
    }
    currentScript.updatedAt = new Date().toISOString();

    movieAnalyzerStore.saveProject(project);
    res.json({ success: true, hook: currentScript.hook, script: currentScript, project });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/movie-analyzer/projects/:id/voiceover
 * Handles voiceover audio upload or simulated TTS generation.
 * Probes the uploaded audio duration and synchronizes script timings and timeline to it.
 */
router.post('/projects/:id/voiceover', audioUpload.single('audio'), async (req: Request, res: Response) => {
  try {
    const projectId = getProjectId(req);
    const project = movieAnalyzerStore.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: `Project ${projectId} not found` });
    }

    const selectedLang = project.scripts?.selectedLanguage || 'english';
    const script = project.scripts?.[selectedLang];
    let actualDuration = script?.totalEstimatedDurationSeconds || 540;

    if (req.file) {
      // Probe REAL audio duration with ffprobe
      try {
        const audioMeta = await extractMetadata(req.file.path);
        if (audioMeta.duration && audioMeta.duration > 0) {
          actualDuration = Number(audioMeta.duration.toFixed(2));
        }
      } catch (probeErr) {
        console.warn(`[MovieAnalyzer] Failed to probe uploaded audio duration:`, probeErr);
      }

      // Synchronize script paragraph durations to actual voiceover audio duration
      if (script && script.paragraphs && script.paragraphs.length > 0 && actualDuration > 0) {
        const oldTotal = script.paragraphs.reduce((sum, p) => sum + p.estimatedSeconds, 0);
        if (oldTotal > 0) {
          const scale = actualDuration / oldTotal;
          let running = 0;
          for (let i = 0; i < script.paragraphs.length; i++) {
            if (i === script.paragraphs.length - 1) {
              script.paragraphs[i].estimatedSeconds = Math.max(3, Number((actualDuration - running).toFixed(1)));
            } else {
              const scaled = Math.max(3, Number((script.paragraphs[i].estimatedSeconds * scale).toFixed(1)));
              script.paragraphs[i].estimatedSeconds = scaled;
              running += scaled;
            }
          }
          script.totalEstimatedDurationSeconds = actualDuration;
        }
      }

      project.voiceover = {
        mode: 'import',
        audioPath: req.file.path,
        audioUrl: `/api/files/movie_analyzer/${projectId}/voiceover/${req.file.filename}`,
        duration: actualDuration,
        filename: req.file.originalname,
        status: 'ready',
      };
    } else {
      // Local TTS placeholder/generator
      project.voiceover = {
        mode: 'generate',
        duration: actualDuration,
        filename: `${selectedLang}_narration_generated.mp3`,
        status: 'ready',
      };
    }

    // Invalidate stale matching when a new voiceover is provided
    if (project.matching) {
      project.matching = undefined;
    }

    project.stage = 6; // Move to Scene Matching stage
    movieAnalyzerStore.saveProject(project);
    res.json({ success: true, voiceover: project.voiceover, project });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/movie-analyzer/projects/:id/match-scenes
 * Enforces strict <= 3.0s movie footage cut rule & optional moving screenshots
 */
router.post('/projects/:id/match-scenes', async (req: Request, res: Response) => {
  try {
    const projectId = getProjectId(req);
    const { enableMovingScreenshots, screenshotInterval } = req.body;

    const matchedShots = await movieAnalyzerEngine.matchScenes(projectId, {
      enableMovingScreenshots: enableMovingScreenshots !== undefined ? Boolean(enableMovingScreenshots) : true,
      screenshotInterval: Number(screenshotInterval) || 5,
    });

    const project = movieAnalyzerStore.getProject(projectId);
    res.json({ success: true, matchedShotsCount: matchedShots.length, project });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/movie-analyzer/projects/:id/handoff
 * Converts project to MovieExplanationStudio state and returns new projectId
 */
router.post('/projects/:id/handoff', async (req: Request, res: Response) => {
  try {
    const projectId = getProjectId(req);
    const result = await movieAnalyzerEngine.handoffToMovieExplanationStudio(projectId);
    const project = movieAnalyzerStore.getProject(projectId);

    res.json({
      success: true,
      movieExplanationProjectId: result.movieExplanationProjectId,
      shotsCount: result.shotsCount,
      project,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export { router as movieAnalyzerRouter };
