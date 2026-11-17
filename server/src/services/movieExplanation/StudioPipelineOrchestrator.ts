// ============================================================
// Studio Pipeline Orchestrator — 1-Click Master Production Engine
// Coordinates end-to-end automation from raw inputs to 60 FPS master render:
// 1. Ingestion Validation (Source Video, Audio, Script)
// 2. Movie Intelligence Indexing (PySceneDetect + Visual Understanding)
// 3. Spoken Voiceover Script Alignment (Faster-Whisper / Audio Beats)
// 4. AI Directorial Timeline Execution (Pacing, Framing, Motion, Transitions)
// 5. Automated QC Gate (22 Broadcast Integrity Checks & Auto-Repairs)
// 6. Master Render Pipeline (Hardware QSV/x264, Audio Mastering, 60 FPS)
// ============================================================

import type {
  MovieExplanationProject,
  MovieExplanationTimeline,
  VoiceoverOutputAspectRatio,
  MovieExplanationQualityReport,
} from '../../../../shared/types.js';
import { episodeIntelligenceEngine } from './EpisodeIntelligenceEngine.js';
import { scriptAlignmentEngine } from './ScriptAlignmentEngine.js';
import { aiDirectorEngine } from './AIDirectorEngine.js';
import { movieExplanationQualityGate } from './MovieExplanationQualityGate.js';
import { movieExplanationRenderer } from './MovieExplanationRenderer.js';
import { movieExplanationStore } from './MovieExplanationStore.js';

export interface PipelineProgressCallback {
  (step: string, progressPercent: number, message: string): void;
}

export interface PipelineExecutionResult {
  success: boolean;
  stage: string;
  projectId: string;
  indexedScenesCount: number;
  alignedSegmentsCount: number;
  totalShotsCount: number;
  qualityScore: number;
  qualityGateOutcome: string;
  isRenderTriggered: boolean;
  renderedVideoPath?: string;
  message: string;
  telemetry: {
    durationMs: number;
    stepsCompleted: string[];
  };
}

export class StudioPipelineOrchestrator {
  /**
   * Runs the complete end-to-end movie explanation production workflow in one unified flow.
   */
  public async runFullPipeline(
    project: MovieExplanationProject,
    options?: {
      autoRender?: boolean;
      aspectRatio?: VoiceoverOutputAspectRatio;
      qualityPreset?: 'pro_lossless' | 'high' | 'fast_export' | 'draft_preview';
    },
    onProgress?: PipelineProgressCallback
  ): Promise<PipelineExecutionResult> {
    const startTime = Date.now();
    const stepsCompleted: string[] = [];
    const projectId = project.projectId;
    const aspectRatio: VoiceoverOutputAspectRatio = options?.aspectRatio || project.timeline?.outputAspectRatio || '16:9';

    // ── STEP 1: Ingestion Validation ──
    onProgress?.('validation', 5, 'Validating source video, voiceover, and script inputs...');
    if (!project.originalVideo?.filePath) {
      throw new Error('Episode source video is required to run master production pipeline.');
    }
    if (!project.voiceoverAudio?.filePath) {
      throw new Error('Master narration voiceover audio is required to run master production pipeline.');
    }
    if (!project.script?.rawText && (!project.script?.segments || project.script.segments.length === 0)) {
      throw new Error('Narration transcript or script segments are required to run master production pipeline.');
    }
    stepsCompleted.push('validation');

    // ── STEP 2: Episode Scene Indexing ──
    let episodeIndex = project.episodeIndex;
    const needsIndexing = !episodeIndex || !episodeIndex.scenes || episodeIndex.scenes.length === 0;
    if (needsIndexing) {
      onProgress?.('indexing', 15, 'Indexing movie scenes, visual actions, and story beats...');
      episodeIndex = await episodeIntelligenceEngine.analyzeEpisode(
        project.originalVideo.filePath,
        projectId,
        (pct, detail) => {
          onProgress?.('indexing', Math.round(15 + pct * 0.25), `Movie Indexing: ${detail}`);
        }
      );
      project.episodeIndex = episodeIndex;
      movieExplanationStore.updateProject(projectId, { episodeIndex });
    }
    stepsCompleted.push('indexing');

    // ── STEP 3: Voiceover Script Alignment ──
    let script = project.script;
    const needsAlignment = !script?.isAlignedToVoiceover || !script.segments || script.segments.length === 0;
    if (needsAlignment) {
      onProgress?.('alignment', 42, 'Aligning narration script with spoken voiceover timestamps...');
      const rawText = script?.rawText || (script?.segments?.map((s) => s.text).join('\n') || '');
      script = await scriptAlignmentEngine.alignScriptAndVoiceover(
        rawText,
        project.voiceoverAudio.filePath,
        projectId,
        (pct, detail) => {
          onProgress?.('alignment', Math.round(42 + pct * 0.15), `Script Alignment: ${detail}`);
        }
      );
      project.script = script;
      movieExplanationStore.updateProject(projectId, { script });
    }
    stepsCompleted.push('alignment');

    // ── STEP 4: AI Director Execution ──
    onProgress?.('directing', 60, 'AI Director generating editorial timeline with narrative framing and emotion-aware motion...');
    let timeline: MovieExplanationTimeline = aiDirectorEngine.generateTimeline(
      episodeIndex,
      script,
      aspectRatio,
      project.timeline,
      project.timeline?.transformativeSettings,
      projectId
    );
    stepsCompleted.push('directing');

    // ── STEP 5: Quality Gate QC Audit & Auto-Remediation ──
    onProgress?.('qc_audit', 75, 'Conducting 22-point broadcast QC audit and checking editorial cadence...');
    const voDuration = project.voiceoverAudio?.duration || timeline.totalDuration || 0;
    let qualityReport: MovieExplanationQualityReport = movieExplanationQualityGate.evaluateTimeline(
      timeline,
      voDuration,
      episodeIndex,
      script
    );

    // Auto-remediate screenshot cadence if needed
    const hasCadenceViolation = qualityReport.checks.some(
      (c) => c.id === 'chk_18_screenshot_cadence' && c.status === 'fail'
    );
    if (hasCadenceViolation) {
      const { repairedTimeline } = movieExplanationQualityGate.autoEnforceScreenshotCadence(timeline, episodeIndex);
      timeline = repairedTimeline;
      qualityReport = movieExplanationQualityGate.evaluateTimeline(
        timeline,
        voDuration,
        episodeIndex,
        script
      );
    }

    // Auto-remediate excessive scene repetitions if needed
    const hasExcessiveRepetition = qualityReport.checks.some(
      (c) => c.id === 'chk_8_repeated_footage' && c.status === 'fail'
    );
    if (hasExcessiveRepetition) {
      const { repairedTimeline } = movieExplanationQualityGate.autoVaryRepeatedScenes(timeline, episodeIndex);
      timeline = repairedTimeline;
      qualityReport = movieExplanationQualityGate.evaluateTimeline(
        timeline,
        voDuration,
        episodeIndex,
        script
      );
    }

    // Update and persist timeline state
    project.timeline = timeline;
    project.qualityReport = qualityReport;
    project.rightsAudit = qualityReport.rightsReview;
    project.status = 'timeline_ready';
    movieExplanationStore.updateProject(projectId, {
      timeline,
      qualityReport,
      rightsAudit: qualityReport.rightsReview,
      status: 'timeline_ready',
    });
    stepsCompleted.push('qc_audit');

    // ── STEP 6: Optional Automated Master 60 FPS Render ──
    let isRenderTriggered = false;
    let renderedVideoPath = project.renderedVideoPath;

    if (options?.autoRender) {
      onProgress?.('rendering', 85, 'Rendering 60 FPS master broadcast video with QuickSync/x264...');
      isRenderTriggered = true;
      movieExplanationStore.updateProject(projectId, { status: 'rendering' });

      // Run master render asynchronously or wait if requested
      const renderPromise = movieExplanationRenderer.renderMasterVideo(
        projectId,
        timeline,
        project.voiceoverAudio.filePath,
        (progress, stage, detail) => {
          onProgress?.('rendering', Math.round(85 + progress * 0.15), `Rendering 60 FPS: ${detail || stage}`);
        },
        {
          aspectRatio,
          qualityPreset: options.qualityPreset || 'pro_lossless',
        }
      );

      // We wait for render to ensure end-to-end completion in pipeline mode
      const renderResult = await renderPromise;
      renderedVideoPath = renderResult.outputPath;
      movieExplanationStore.updateProject(projectId, {
        status: 'completed',
        renderedVideoPath: renderResult.outputPath,
        lastExportedRevision: timeline.timelineRevision,
        exportStatus: 'up_to_date',
      });
      stepsCompleted.push('rendering');
    }

    const durationMs = Date.now() - startTime;
    onProgress?.('completed', 100, 'Master production pipeline complete!');
    const qualityScore = qualityReport.overallReadinessScore ?? (qualityReport as any).qualityScore ?? 100;

    return {
      success: true,
      stage: options?.autoRender ? 'render_complete' : 'timeline_ready',
      projectId,
      indexedScenesCount: episodeIndex.scenes.length,
      alignedSegmentsCount: script.segments.length,
      totalShotsCount: timeline.shots.length,
      qualityScore,
      qualityGateOutcome: qualityReport.overallOutcome,
      isRenderTriggered,
      renderedVideoPath,
      message: `Master production pipeline executed successfully (${(durationMs / 1000).toFixed(1)}s). Score: ${qualityScore}/100 [${qualityReport.overallOutcome}].`,
      telemetry: {
        durationMs,
        stepsCompleted,
      },
    };
  }
}

export const studioPipelineOrchestrator = new StudioPipelineOrchestrator();
