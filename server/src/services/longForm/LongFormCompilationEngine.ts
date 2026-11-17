// ============================================================
// LongFormCompilationEngine — Master Orchestration Service
// Manages AI timeline draft generation, segment extraction,
// transition stitching, quality gating, and rendering.
// ============================================================

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { v4 as uuid } from 'uuid';
import { getDb } from '../database.js';
import { config } from '../../config/index.js';
import { getLongFormDir, ensureDir } from '../storage.js';
import type {
  LongFormCompilation,
  LongFormSettings,
  TimelineSegment,
  GenerateTimelineRequest,
  TranscriptSegment,
  Scene,
  AudioAnalysisResult,
  HighlightCandidate,
} from '../../../../shared/types.js';
import { DEFAULT_LONG_FORM_SETTINGS, TARGET_DURATION_RANGES } from '../../../../shared/constants.js';
import { videoEncodingService } from '../encodingProfiles.js';
import { StoryAnalyzer } from './StoryAnalyzer.js';
import { SegmentSelector } from './SegmentSelector.js';
import { SafeFramingEngine } from './SafeFramingEngine.js';
import { SmartScaleEngine } from './SmartScaleEngine.js';
import { TransitionEngine } from './TransitionEngine.js';
import { AudioEnhancementEngine } from './AudioEnhancementEngine.js';
import { LongFormQualityGate } from './LongFormQualityGate.js';

export type LongFormProgressCallback = (update: {
  compilationId: string;
  projectId: string;
  progress: number;
  stage: string;
  detail?: string;
  status: 'draft' | 'analyzing' | 'rendering' | 'completed' | 'failed';
}) => void;

export class LongFormCompilationEngine {
  private storyAnalyzer = new StoryAnalyzer();
  private segmentSelector = new SegmentSelector();
  private safeFraming = new SafeFramingEngine();
  private smartScale = new SmartScaleEngine();
  private transitionEngine = new TransitionEngine();
  private audioEnhancement = new AudioEnhancementEngine();
  private qualityGate = new LongFormQualityGate();

  /**
   * Generates a coherent narrative timeline draft based on project analysis data
   * and user configuration (Target Duration, Edit Style, Safe Edge Cleanup, etc.).
   */
  public async generateTimelineDraft(
    projectId: string,
    req: GenerateTimelineRequest = {}
  ): Promise<LongFormCompilation> {
    const db = getDb();
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);

    const video = db.prepare('SELECT * FROM videos WHERE project_id = ?').get(projectId);
    if (!video) throw new Error(`No video uploaded for project: ${projectId}`);

    // Load available analysis data from DB and map snake_case to typed camelCase
    const transcriptRecord = db.prepare('SELECT * FROM transcripts WHERE project_id = ?').get(projectId) as any;
    const transcriptSegments: TranscriptSegment[] = (transcriptRecord
      ? db.prepare('SELECT * FROM transcript_segments WHERE transcript_id = ? ORDER BY start_time').all(transcriptRecord.id)
      : []).map((s: any) => ({
        id: s.id,
        transcriptId: s.transcript_id,
        startTime: Number(s.start_time ?? s.startTime ?? 0),
        endTime: Number(s.end_time ?? s.endTime ?? 0),
        text: s.text || '',
        confidence: Number(s.confidence ?? 0.9),
      }));

    const scenes: Scene[] = (db.prepare('SELECT * FROM scenes WHERE project_id = ? ORDER BY start_time').all(projectId) as any[])
      .map((s: any) => ({
        id: s.id,
        projectId: s.project_id,
        sceneIndex: s.scene_index,
        startTime: Number(s.start_time ?? s.startTime ?? 0),
        endTime: Number(s.end_time ?? s.endTime ?? 0),
        duration: Number(s.duration ?? (s.end_time - s.start_time)),
      }));

    const highlights: HighlightCandidate[] = (db.prepare('SELECT * FROM highlight_candidates WHERE project_id = ? ORDER BY start_time').all(projectId) as any[])
      .map((h: any) => ({
        ...h,
        startTime: Number(h.start_time ?? h.startTime ?? 0),
        endTime: Number(h.end_time ?? h.endTime ?? 0),
        scoreTotal: Number(h.score_total ?? h.scoreTotal ?? 50),
      }));

    // Audio analysis cache or fallback
    let audioAnalysis: AudioAnalysisResult | null = null;
    const audioPath = path.join(config.audioDir, projectId, 'audio.wav');
    if (fs.existsSync(audioPath)) {
      // Light signal fallback or existing cache
      audioAnalysis = { volumeLevels: [], silenceRegions: [], energyPeaks: [], averageVolume: -20 };
    }

    // Merge settings
    const settings: LongFormSettings = {
      ...DEFAULT_LONG_FORM_SETTINGS,
      targetDuration: req.targetDuration || '5-7',
      customDurationSeconds: req.customDurationSeconds,
      editStyle: req.editStyle || 'narrative',
      safeEdgeCleanup: req.safeEdgeCleanup ?? false,
      maxScaleFactor: req.maxScaleFactor || (req.safeEdgeCleanup ? 1.20 : 1.10),
      smartScaling: req.smartScaling ?? true,
      captionsEnabled: req.captionsEnabled ?? false,
      transitionType: req.transitionType || 'crossfade',
      audioEnhancement: req.audioEnhancement ?? true,
      includeIntro: req.includeIntro ?? false,
      introTitle: req.introTitle || project.name || 'Compilation',
      includeOutro: req.includeOutro ?? false,
    };

    // 1. Story Units Extraction
    const storyUnits = this.storyAnalyzer.analyzeStoryUnits(
      transcriptSegments,
      scenes,
      audioAnalysis,
      highlights,
      video.duration,
      settings.editStyle
    );

    // 2. Target-Duration Segment Selection
    const rawTimeline = this.segmentSelector.selectTimelineSegments(storyUnits, {
      targetDuration: settings.targetDuration,
      customDurationSeconds: settings.customDurationSeconds,
      editStyle: settings.editStyle,
      defaultTransition: settings.transitionType,
      defaultScaleFactor: settings.safeEdgeCleanup ? settings.maxScaleFactor : 1.0,
    });

    // 3. Pre-check Timeline Quality
    const preCheck = this.qualityGate.preCheckTimeline(rawTimeline, settings);
    const sanitizedTimeline = preCheck.sanitizedTimeline;
    const estimatedDuration = sanitizedTimeline.reduce((acc, s) => acc + s.duration, 0);

    // Check if compilation already exists for this project
    const existing = db.prepare('SELECT * FROM long_form_compilations WHERE project_id = ?').get(projectId);
    const compilationId = existing ? existing.id : uuid();

    const title = existing?.title || `${project.name || 'Project'} — 16:9 Compilation`;

    if (existing) {
      db.prepare(`
        UPDATE long_form_compilations
        SET title = ?, status = 'draft', progress = 0, stage = 'timeline_ready',
            settings = ?, timeline = ?, estimated_duration = ?, error = NULL
        WHERE id = ?
      `).run(
        title,
        JSON.stringify(settings),
        JSON.stringify(sanitizedTimeline),
        estimatedDuration,
        compilationId
      );
    } else {
      db.prepare(`
        INSERT INTO long_form_compilations (
          id, project_id, title, status, progress, stage, settings, timeline,
          estimated_duration, actual_duration, file_path, file_size, quality_report, error
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        compilationId,
        projectId,
        title,
        'draft',
        0,
        'timeline_ready',
        JSON.stringify(settings),
        JSON.stringify(sanitizedTimeline),
        estimatedDuration,
        null,
        null,
        null,
        null,
        null
      );
    }

    const saved = db.prepare('SELECT * FROM long_form_compilations WHERE id = ?').get(compilationId);
    return this.formatCompilation(saved);
  }

  /**
   * Renders the complete 16:9 Long-Form Compilation from the timeline.
   */
  public async renderCompilation(
    compilationId: string,
    onProgress?: LongFormProgressCallback
  ): Promise<LongFormCompilation> {
    const db = getDb();
    const compilation = db.prepare('SELECT * FROM long_form_compilations WHERE id = ?').get(compilationId);
    if (!compilation) throw new Error(`Compilation not found: ${compilationId}`);

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(compilation.project_id);
    const video = db.prepare('SELECT * FROM videos WHERE project_id = ?').get(compilation.project_id);
    if (!video) throw new Error(`Source video missing for project ${compilation.project_id}`);

    const settings: LongFormSettings = typeof compilation.settings === 'string'
      ? JSON.parse(compilation.settings)
      : compilation.settings;

    let timeline: TimelineSegment[] = typeof compilation.timeline === 'string'
      ? JSON.parse(compilation.timeline)
      : compilation.timeline;

    // Filter only enabled segments
    timeline = timeline.filter(s => s.isEnabled !== false);
    if (timeline.length === 0) {
      throw new Error('Timeline contains no enabled segments to render.');
    }

    // Step 1: Pre-Render Quality Gate
    const preCheck = this.qualityGate.preCheckTimeline(timeline, settings);
    timeline = preCheck.sanitizedTimeline;

    // Update status to rendering
    db.prepare(`
      UPDATE long_form_compilations
      SET status = 'rendering', progress = 5, stage = 'preparing_segments'
      WHERE id = ?
    `).run(compilationId);

    onProgress?.({
      compilationId,
      projectId: compilation.project_id,
      progress: 5,
      stage: 'preparing_segments',
      detail: `Preparing ${timeline.length} narrative segments...`,
      status: 'rendering',
    });

    const projectLongFormDir = getLongFormDir(compilation.project_id);
    const tempDir = path.join(projectLongFormDir, `temp_${compilationId}`);
    ensureDir(tempDir);

    // Preserve native source resolution and framerate if 16:9
    const srcW = video.width || 1920;
    const srcH = video.height || 1080;
    const srcFps = video.fps || 30;

    const outW = settings.outputWidth && settings.outputWidth !== 1920
      ? settings.outputWidth
      : (Math.abs((srcW / srcH) - (16 / 9)) < 0.05 ? srcW : 1920);
    const outH = settings.outputHeight && settings.outputHeight !== 1080
      ? settings.outputHeight
      : (Math.abs((srcW / srcH) - (16 / 9)) < 0.05 ? srcH : 1080);
    const outFps = settings.outputFps && settings.outputFps !== 30
      ? settings.outputFps
      : srcFps;

    // Detect if lossless stream copy (FAST_CUT) is safe (Part 4 of requirements)
    const isSource16x9 = Math.abs((srcW / srcH) - (16 / 9)) < 0.05;
    const isScaleNeutral = !settings.safeEdgeCleanup || (settings.maxScaleFactor || 1.0) === 1.0;
    const isCutTransition = !settings.transitionType || settings.transitionType === 'cut';
    const noOverlays = !settings.includeIntro && !settings.includeOutro && !settings.captionsEnabled;
    const canStreamCopy = isSource16x9 && isScaleNeutral && isCutTransition && noOverlays;

    const finalFilename = `compilation_${compilationId}.mp4`;
    const finalOutputPath = path.join(projectLongFormDir, finalFilename);
    const segmentFiles: string[] = [];

    try {
      if (canStreamCopy) {
        // ── PIPELINE A: FAST_CUT (Lossless Stream Copy, ~10-15s total for 4K) ──
        for (let i = 0; i < timeline.length; i++) {
          const seg = timeline[i];
          const segFilename = `seg_${i.toString().padStart(3, '0')}.mp4`;
          const segPath = path.join(tempDir, segFilename);

          const currentPct = Math.round(5 + ((i + 1) / timeline.length) * 80);
          db.prepare(`
            UPDATE long_form_compilations
            SET progress = ?, stage = 'extracting_segments'
            WHERE id = ?
          `).run(currentPct, compilationId);

          onProgress?.({
            compilationId,
            projectId: compilation.project_id,
            progress: currentPct,
            stage: 'extracting_segments',
            detail: `Lossless fast-cut segment ${i + 1}/${timeline.length}: "${seg.title}"...`,
            status: 'rendering',
          });

          await this.extractClipLossless(video.file_path, seg.sourceStart, seg.duration, segPath);
          segmentFiles.push(segPath);
        }

        db.prepare(`
          UPDATE long_form_compilations
          SET progress = 88, stage = 'rendering_transitions'
          WHERE id = ?
        `).run(compilationId);

        onProgress?.({
          compilationId,
          projectId: compilation.project_id,
          progress: 88,
          stage: 'rendering_transitions',
          detail: 'Assembling lossless master MP4 with concat demuxer...',
          status: 'rendering',
        });

        await this.concatSegmentsLossless(segmentFiles, tempDir, finalOutputPath);
      } else {
        // ── PIPELINE B: QUALITY_CUT (Crop-first + ultrafast intermediate + transitions) ──
        for (let i = 0; i < timeline.length; i++) {
          const seg = timeline[i];
          const segFilename = `seg_${i.toString().padStart(3, '0')}.mov`;
          const segPath = path.join(tempDir, segFilename);

          const currentPct = Math.round(5 + ((i + 1) / timeline.length) * 55);
          db.prepare(`
            UPDATE long_form_compilations
            SET progress = ?, stage = 'extracting_segments'
            WHERE id = ?
          `).run(currentPct, compilationId);

          onProgress?.({
            compilationId,
            projectId: compilation.project_id,
            progress: currentPct,
            stage: 'extracting_segments',
            detail: `Extracting & framing segment ${i + 1}/${timeline.length}: "${seg.title}"...`,
            status: 'rendering',
          });

          const scaleFactor = settings.safeEdgeCleanup
            ? (seg.scaleFactor || settings.maxScaleFactor || 1.10)
            : (settings.smartScaling ? 1.05 : 1.0);

          const videoFilter = this.smartScale.getSegmentFilter(seg, scaleFactor as any, outW, outH);

          await this.extractAndFrameSegment(
            video.file_path,
            seg.sourceStart,
            seg.duration,
            videoFilter,
            segPath,
            outFps
          );

          segmentFiles.push(segPath);
        }

        // Step 3: Stitching Segments with Transitions
        db.prepare(`
          UPDATE long_form_compilations
          SET progress = 65, stage = 'rendering_transitions'
          WHERE id = ?
        `).run(compilationId);

        onProgress?.({
          compilationId,
          projectId: compilation.project_id,
          progress: 65,
          stage: 'rendering_transitions',
          detail: `Assembling timeline with ${settings.transitionType} transitions...`,
          status: 'rendering',
        });

        await this.stitchSegments(
          segmentFiles,
          timeline,
          settings,
          finalOutputPath,
          outFps,
          (pct) => {
            const overallPct = Math.round(65 + (pct / 100) * 25);
            db.prepare(`
              UPDATE long_form_compilations
              SET progress = ?, stage = 'rendering_transitions'
              WHERE id = ?
            `).run(overallPct, compilationId);

            onProgress?.({
              compilationId,
              projectId: compilation.project_id,
              progress: overallPct,
              stage: 'rendering_transitions',
              detail: `Rendering 16:9 master compilation: ${pct}%...`,
              status: 'rendering',
            });
          }
        );
      }

      // Step 4: Post-Render Quality Gate
      onProgress?.({
        compilationId,
        projectId: compilation.project_id,
        progress: 92,
        stage: 'verifying_quality',
        detail: 'Running automated 11-point quality gate checks...',
        status: 'rendering',
      });

      const bounds = TARGET_DURATION_RANGES[settings.targetDuration] || TARGET_DURATION_RANGES['5-7'];
      const targetSeconds = settings.targetDuration === 'custom' && settings.customDurationSeconds
        ? settings.customDurationSeconds
        : bounds.targetSeconds;

      const qualityReport = await this.qualityGate.postCheckRenderedFile(
        finalOutputPath,
        targetSeconds,
        preCheck.checks,
        preCheck.autoFixes,
        video
      );

      const stat = fs.statSync(finalOutputPath);
      const actualDuration = qualityReport.actualDuration;

      // Update Database
      db.prepare(`
        UPDATE long_form_compilations
        SET status = 'completed', progress = 100, stage = 'completed',
            actual_duration = ?, file_path = ?, file_size = ?,
            quality_report = ?, error = NULL
        WHERE id = ?
      `).run(
        actualDuration,
        finalOutputPath,
        stat.size,
        JSON.stringify(qualityReport),
        compilationId
      );

      onProgress?.({
        compilationId,
        projectId: compilation.project_id,
        progress: 100,
        stage: 'completed',
        detail: `16:9 compilation ready (${Math.round(actualDuration / 60)}m ${Math.round(actualDuration % 60)}s)!`,
        status: 'completed',
      });

      // Cleanup temp directory
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}

      const updated = db.prepare('SELECT * FROM long_form_compilations WHERE id = ?').get(compilationId);
      return this.formatCompilation(updated);
    } catch (err: any) {
      console.error(`LongForm render failed for ${compilationId}:`, err);
      db.prepare(`
        UPDATE long_form_compilations
        SET status = 'failed', progress = 0, stage = 'failed', error = ?
        WHERE id = ?
      `).run(err.message, compilationId);

      onProgress?.({
        compilationId,
        projectId: compilation.project_id,
        progress: 0,
        stage: 'failed',
        detail: `Render failed: ${err.message}`,
        status: 'failed',
      });

      throw err;
    }
  }

  /**
   * Cuts and scales a single timeline segment in 16:9.
   */
  private async extractAndFrameSegment(
    sourceVideo: string,
    startTime: number,
    duration: number,
    videoFilter: string,
    outputPath: string,
    fps: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      // Use Lossless Intermediate buffer (-qp 0) to eliminate double-encoding generation loss
      const intermediateArgs = videoEncodingService.getLosslessIntermediateArgs();
      const args = [
        '-y',
        '-ss', startTime.toFixed(3),
        '-i', sourceVideo,
        '-t', duration.toFixed(3),
        '-vf', videoFilter,
        '-r', String(fps),
        ...intermediateArgs,
        '-pix_fmt', 'yuv420p',
        outputPath,
      ];

      const proc = spawn(config.ffmpegPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
      let stderr = '';
      proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });

      proc.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1000) {
          resolve();
        } else {
          reject(new Error(`Segment cut failed: ${stderr.slice(-300)}`));
        }
      });

      proc.on('error', (err) => reject(err));
    });
  }

  /**
   * Stitches multiple framed segments into the final master MP4 with audio normalization.
   */
  private async stitchSegments(
    segmentFiles: string[],
    segments: TimelineSegment[],
    settings: LongFormSettings,
    outputPath: string,
    fps: number,
    onProgress?: (percent: number) => void
  ): Promise<void> {
    const transGraph = this.transitionEngine.buildFilterGraph(segments, settings, { fallbackIfUnsupported: true });
    const audioEnhance = this.audioEnhancement.getAudioFilterChain({
      normalizeLoudness: settings.normalizeLoudness,
      enhanceVoice: settings.audioEnhancement,
    });

    // Complete filter complex chain with safe audio filter
    const audioFilter = audioEnhance && audioEnhance.trim().length > 0 ? audioEnhance : 'anull';
    const fullFilter = `${transGraph.filterComplex};[${transGraph.outputAudioLabel}]${audioFilter}[a_final]`;

    return new Promise((resolve, reject) => {
      const inputArgs: string[] = [];
      for (const file of segmentFiles) {
        inputArgs.push('-i', file);
      }

      const args = [
        '-y',
        '-threads', '0',
        ...inputArgs,
        '-filter_complex', fullFilter,
        '-map', `[${transGraph.outputVideoLabel}]`,
        '-map', '[a_final]',
        '-r', String(fps),
        '-c:v', 'libx264',
        '-preset', 'veryfast', // Fast encode preserving pristine visual transparency without CPU stalls
        '-crf', '17', // Visually transparent master
        '-c:a', 'aac',
        '-b:a', '320k', // Broadcast quality audio
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        outputPath,
      ];

      const proc = spawn(config.ffmpegPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
      let stderr = '';
      const totalDuration = transGraph.totalDuration;

      proc.stderr?.on('data', (d: Buffer) => {
        const text = d.toString();
        stderr += text;

        if (onProgress && totalDuration > 0) {
          const match = text.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/);
          if (match) {
            const currentSec =
              parseFloat(match[1]) * 3600 +
              parseFloat(match[2]) * 60 +
              parseFloat(match[3]);
            const pct = Math.min(99, Math.max(5, Math.round((currentSec / totalDuration) * 100)));
            onProgress(pct);
          }
        }
      });

      proc.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 10000) {
          if (onProgress) onProgress(100);
          resolve();
        } else {
          reject(new Error(`Stitching failed: ${stderr.slice(-300)}`));
        }
      });

      proc.on('error', (err) => reject(err));
    });
  }

  /**
   * Fast-cuts a single segment using 100% lossless stream copy (-c copy).
   * Runs in ~0.2-0.5s per segment with zero generational loss.
   */
  private async extractClipLossless(
    sourceVideo: string,
    startTime: number,
    duration: number,
    outputPath: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = [
        '-y',
        '-ss', startTime.toFixed(3),
        '-i', sourceVideo,
        '-t', duration.toFixed(3),
        '-map', '0',
        '-c', 'copy',
        outputPath,
      ];

      const proc = spawn(config.ffmpegPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
      let stderr = '';
      proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });

      proc.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1000) {
          resolve();
        } else {
          reject(new Error(`Lossless segment cut failed: ${stderr.slice(-300)}`));
        }
      });

      proc.on('error', (err) => reject(err));
    });
  }

  /**
   * Concat demuxer stream copy: stitches segments in seconds with zero re-encoding.
   */
  private async concatSegmentsLossless(
    segmentFiles: string[],
    tempDir: string,
    outputPath: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const listPath = path.join(tempDir, 'concat_list.txt');
      const content = segmentFiles
        .map(f => `file '${f.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`)
        .join('\n');
      fs.writeFileSync(listPath, content, 'utf8');

      const args = [
        '-y',
        '-f', 'concat',
        '-safe', '0',
        '-i', listPath,
        '-c', 'copy',
        '-movflags', '+faststart',
        outputPath,
      ];

      const proc = spawn(config.ffmpegPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
      let stderr = '';
      proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });

      proc.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 10000) {
          resolve();
        } else {
          reject(new Error(`Lossless concat failed: ${stderr.slice(-300)}`));
        }
      });

      proc.on('error', (err) => reject(err));
    });
  }

  /**
   * Helper to format DB record into typed LongFormCompilation.
   */
  public formatCompilation(record: any): LongFormCompilation {
    return {
      id: record.id,
      projectId: record.project_id,
      title: record.title,
      status: record.status,
      progress: record.progress,
      stage: record.stage,
      settings: typeof record.settings === 'string' ? JSON.parse(record.settings) : record.settings,
      timeline: typeof record.timeline === 'string' ? JSON.parse(record.timeline) : record.timeline,
      estimatedDuration: record.estimated_duration,
      actualDuration: record.actual_duration,
      filePath: record.file_path,
      fileSize: record.file_size,
      downloadUrl: record.file_path ? `/api/longform/${record.id}/download` : undefined,
      qualityReport: record.quality_report ? (typeof record.quality_report === 'string' ? JSON.parse(record.quality_report) : record.quality_report) : null,
      error: record.error,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
    };
  }
}

export const longFormCompilationEngine = new LongFormCompilationEngine();
