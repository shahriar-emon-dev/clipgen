// ============================================================
// Pipeline Orchestrator — Master Processing Pipeline
// Coordinates all processing stages for a video
// ============================================================

import { v4 as uuid } from 'uuid';
import { getDb } from './database.js';
import { validateVideo, extractMetadata, extractAudio, generateThumbnail } from './ffmpeg.js';
import { transcribeAudio } from './transcription.js';
import { detectScenes } from './sceneDetector.js';
import { analyzeAudio } from './audioAnalyzer.js';
import { createAnalysisChunks, calculateOverlap } from './chunkEngine.js';
import { detectHighlights } from './highlightDetector.js';
import { analyzeHighlightsWithAI } from './aiAnalyzer.js';
import { computeSmartFraming } from './smartFraming.js';
import { generateShortTitle } from './titleGenerator.js';
import { titleBumperDetector } from './movieExplanation/TitleBumperDetector.js';
import { config } from '../config/index.js';
import type { ProcessingStage, ProcessingUpdate } from '../../../shared/types.js';
import { PIPELINE_STAGE_PROGRESS, PIPELINE_STAGE_RANGES } from '../../../shared/constants.js';

export type ProgressCallback = (update: ProcessingUpdate) => void;

/**
 * Run the complete processing pipeline for a project.
 * Each stage updates progress via the callback.
 */
export async function runPipeline(
  jobId: string,
  projectId: string,
  onProgress: ProgressCallback,
  options: { preferredFramingMode?: 'blur_fill' | 'action' } = {}
): Promise<void> {
  const db = getDb();
  const stagesCompleted: ProcessingStage[] = [];

  function updateStage(
    stage: ProcessingStage,
    message: string,
    stageProgress: number = 0,
    stageDetail?: string
  ) {
    const [rangeStart, rangeEnd] = PIPELINE_STAGE_RANGES[stage] || [
      PIPELINE_STAGE_PROGRESS[stage] || 0,
      PIPELINE_STAGE_PROGRESS[stage] || 0
    ];
    const clampedSub = Math.max(0, Math.min(100, Math.round(stageProgress)));
    const overallProgress = Math.min(100, Math.round(rangeStart + (clampedSub / 100) * (rangeEnd - rangeStart)));
    const finalDetail = stageDetail || message;

    db.prepare(`
      UPDATE processing_jobs
      SET current_stage = ?, progress = ?, stages_completed = ?, stage_progress = ?, stage_detail = ?
      WHERE id = ?
    `).run(stage, overallProgress, JSON.stringify(stagesCompleted), clampedSub, finalDetail, jobId);

    logProcessing(projectId, jobId, 'info', stage, stageDetail ? `${message} — ${stageDetail}` : message);

    onProgress({
      jobId,
      projectId,
      stage,
      progress: overallProgress,
      stageProgress: clampedSub,
      stageDetail: finalDetail,
      message,
      stagesCompleted: [...stagesCompleted],
    });
  }

  function completeStage(stage: ProcessingStage) {
    if (!stagesCompleted.includes(stage)) {
      stagesCompleted.push(stage);
    }
  }

  // ── Stage 1: Validate Video ──
  updateStage('validating', 'Validating video file...', 10, 'Checking container streams and integrity...');

  const video = db.prepare('SELECT * FROM videos WHERE project_id = ?').get(projectId) as any;
  if (!video) {
    throw new Error('No video found for this project. Please upload a video first.');
  }

  const validation = await validateVideo(video.file_path);
  if (!validation.valid) {
    throw new Error(`Video validation failed: ${validation.error}`);
  }
  updateStage('validating', 'Video container verified', 100, 'Valid video format and streams detected');
  completeStage('validating');

  // ── Stage 2: Extract Metadata ──
  updateStage('extracting_metadata', 'Extracting video metadata...', 20, 'Probing resolution, FPS, duration, and codecs...');

  const metadata = await extractMetadata(video.file_path);

  db.prepare(`
    UPDATE videos
    SET duration = ?, width = ?, height = ?, fps = ?, codec = ?,
        audio_codec = ?, audio_tracks = ?, bitrate = ?
    WHERE id = ?
  `).run(
    metadata.duration, metadata.width, metadata.height, metadata.fps,
    metadata.codec, metadata.audioCodec, metadata.audioTracks, metadata.bitrate,
    video.id
  );

  updateStage('extracting_metadata', 'Generating thumbnail poster...', 65, 'Capturing initial video poster thumbnail...');

  // Generate thumbnail
  const thumbUrl = await generateThumbnail(video.file_path, projectId, 5);
  if (thumbUrl) {
    db.prepare('UPDATE videos SET thumbnail_url = ? WHERE id = ?').run(thumbUrl, video.id);
  }

  updateStage('extracting_metadata', 'Media information extracted', 100, `${metadata.width}x${metadata.height} @ ${metadata.fps}fps (${Math.round(metadata.duration)}s)`);
  completeStage('extracting_metadata');

  // ── Stage 3: Extract Audio ──
  updateStage('extracting_audio', 'Extracting audio track...', 25, 'Demuxing 16kHz mono audio for transcription & acoustic analysis...');

  const audioPath = await extractAudio(video.file_path, projectId);
  updateStage('extracting_audio', 'Audio track extracted', 100, 'Clean 16kHz WAV track ready for analysis');
  completeStage('extracting_audio');

  // ── Stage 4: Transcribe ──
  updateStage('transcribing', 'Generating speech transcript...', 0, 'Initializing speech recognition model...');

  const transcription = await transcribeAudio(audioPath, projectId, (percent, detail) => {
    updateStage('transcribing', 'Generating transcript with speech recognition...', percent, detail);
  });
  updateStage('transcribing', 'Speech transcription complete', 100, `Transcribed ${transcription.segments.length} segments`);
  completeStage('transcribing');

  // ── Stage 5: Scene Detection ──
  updateStage('detecting_scenes', 'Detecting scene cuts & visual transitions...', 0, 'Scanning video frames for shot boundaries...');

  const scenes = await detectScenes(video.file_path, projectId, metadata.duration, 0.3, (percent, detail) => {
    updateStage('detecting_scenes', 'Detecting scene changes...', percent, detail);
  });
  updateStage('detecting_scenes', 'Scene detection complete', 100, `Identified ${scenes.length} scene cuts`);
  completeStage('detecting_scenes');

  // ── Stage 6: Audio Analysis ──
  updateStage('analyzing_audio', 'Analyzing audio patterns...', 0, 'Measuring volume levels, cadence, and silence regions...');

  const audioAnalysis = await analyzeAudio(audioPath, (percent, detail) => {
    updateStage('analyzing_audio', 'Analyzing audio patterns...', percent, detail);
  });
  updateStage('analyzing_audio', 'Audio analysis complete', 100, `Identified ${audioAnalysis.energyPeaks.length} energy peaks`);
  completeStage('analyzing_audio');

  // ── Stage 7: Chunking ──
  updateStage('chunking', 'Creating analysis windows...', 50, 'Aligning sliding analysis windows with scene boundaries...');

  const chunks = createAnalysisChunks(
    metadata.duration,
    transcription.segments,
    scenes
  );
  updateStage('chunking', 'Analysis windows created', 100, `Generated ${chunks.length} candidate windows with 30s overlap`);
  completeStage('chunking');

  // ── Stage 8: Highlight Detection ──
  updateStage('detecting_highlights', 'Finding interesting moments...', 0, `Evaluating ${chunks.length} candidate windows...`);

  const rawCandidates = detectHighlights(chunks, audioAnalysis, metadata.duration, (percent, detail) => {
    updateStage('detecting_highlights', 'Finding interesting moments...', percent, detail);
  });
  updateStage('detecting_highlights', 'Highlight candidate detection complete', 100, `Detected ${rawCandidates.length} potential moments`);
  completeStage('detecting_highlights');

  // ── Stage 9: AI Scoring ──
  updateStage('scoring_highlights', 'Scoring best candidates with AI...', 0, `Preparing top moments for AI evaluation...`);

  let aiResults = new Map<number, any>();
  if (config.openaiApiKey && rawCandidates.length > 0) {
    try {
      aiResults = await analyzeHighlightsWithAI(
        rawCandidates,
        transcription.segments,
        Math.min(rawCandidates.length, 15),
        (percent, detail) => {
          updateStage('scoring_highlights', 'AI scoring best candidates...', percent, detail);
        }
      );
      updateStage('scoring_highlights', 'AI scoring complete', 100, `Scored ${aiResults.size} candidates with AI`);
    } catch (err: any) {
      logProcessing(projectId, jobId, 'warn', 'scoring_highlights',
        `AI scoring failed, using signal-based scores: ${err.message}`);
      updateStage('scoring_highlights', 'AI scoring skipped, using signal scores', 100, 'Signal-based heuristic scoring applied');
    }
  } else if (!config.openaiApiKey) {
    logProcessing(projectId, jobId, 'warn', 'scoring_highlights',
      'No OpenAI API key configured. Using signal-based scoring only.');
    updateStage('scoring_highlights', 'Signal-based scoring applied', 100, 'Scored candidates using multimodal signal weights');
  }
  completeStage('scoring_highlights');

  // ── Stage 10: Ranking & Store ──
  updateStage('ranking', 'Ranking and selecting top moments...', 20, 'Blending AI and acoustic scores...');

  // Merge AI scores with signal scores
  const finalCandidates = rawCandidates.map((candidate, index) => {
    const aiResult = aiResults.get(index);

    let totalScore = candidate.scores.total;
    let aiReason = '';
    let aiStart = candidate.startTime;
    let aiEnd = candidate.endTime;

    if (aiResult) {
      // Blend AI score with signal score (60% AI, 40% signals)
      totalScore = Math.round(aiResult.score * 0.6 + candidate.scores.total * 0.4);
      aiReason = aiResult.reason;
      aiStart = aiResult.recommendedStart;
      aiEnd = aiResult.recommendedEnd;
    }

    return {
      ...candidate,
      totalScore,
      aiReason,
      aiStart,
      aiEnd,
    };
  });

  updateStage('ranking', 'Filtering title cards, bumpers, and duplicate overlaps...', 40, 'Detecting and eliminating non-narrative slates & bumpers...');

  // Universal non-narrative title card & bumper elimination across all projects
  const sceneCutTimes = (scenes || []).map((s: any) => s.startTime || 0);
  let cleanCandidates = finalCandidates;
  try {
    const bumperRanges = await titleBumperDetector.detectAllBumperRanges(video.file_path, sceneCutTimes, metadata.duration);
    if (bumperRanges.length > 0) {
      cleanCandidates = titleBumperDetector.filterCandidatesFromBumpers(finalCandidates, bumperRanges);
      logProcessing(projectId, jobId, 'info', 'ranking', `Eliminated title cards/bumpers across ${bumperRanges.length} detected non-narrative range(s).`);
    }
  } catch (err: any) {
    logProcessing(projectId, jobId, 'warn', 'ranking', `Bumper screening fallback: ${err.message}`);
  }

  // Sort by blended score
  cleanCandidates.sort((a, b) => b.totalScore - a.totalScore);

  // Duplicate suppression: remove candidates with >50% overlap
  const selected: typeof finalCandidates = [];
  for (const candidate of cleanCandidates) {
    const isDuplicate = selected.some(existing => {
      const overlap = calculateOverlap(
        { start: existing.startTime, end: existing.endTime },
        { start: candidate.startTime, end: candidate.endTime }
      );
      return overlap > 0.5;
    });

    if (!isDuplicate) {
      selected.push(candidate);
    }
  }

  // Generate unique human-readable titles for all moments
  updateStage('ranking', 'Generating unique Short titles...', 60, 'Synthesizing descriptive titles from transcript & events...');
  const existingTitles = new Set<string>();
  const videoTitle = video.original_filename || video.filename || '';
  for (let i = 0; i < cleanCandidates.length; i++) {
    const c = cleanCandidates[i];
    c.title = generateShortTitle({
      transcriptText: c.transcriptText,
      projectTitle: videoTitle,
      scores: c.scores,
      duration: c.duration,
      startTime: c.startTime,
      index: i,
    }, existingTitles);
  }

  updateStage('ranking', 'Computing intelligent 9:16 smart framing...', 75, 'Tracking focal subject & active centroids with OpenCV...');

  const preferredMode = options.preferredFramingMode || 'blur_fill';

  // Compute framing for all selected moments based on preferred mode
  for (const c of selected) {
    if (preferredMode === 'blur_fill') {
      // User preferred Lossless Blur: 100% full frame preserved, zero cropping of players, ball, or goal
      c.framingMode = 'blur_fill';
      c.cropOffsetX = 0.5;
      c.visualComposition = { subjectVisibility: 100, motionQuality: 90, framing: 100, score: 96, actionSpread: 0.2 };
    } else {
      // Smart Reframe: analyze action spread and centroids, automatically falling back to blur_fill if action spreads wide
      try {
        const framing = await computeSmartFraming(
          video.file_path,
          c.startTime,
          c.endTime,
          metadata.width,
          metadata.height
        );
        c.cropOffsetX = framing.cropOffsetX;
        c.visualComposition = framing.visualComposition;
        c.framingMode = framing.recommendedMode || 'action';
      } catch {
        c.framingMode = 'blur_fill'; // Safe fallback
        c.cropOffsetX = 0.5;
      }
    }
  }

  updateStage('ranking', 'Saving highlights to database...', 85, `Persisting ${cleanCandidates.length} moments (${selected.length} primary selected)...`);

  // Clear any existing candidates for this project to prevent duplicates
  db.prepare('DELETE FROM highlight_candidates WHERE project_id = ?').run(projectId);

  // Store top candidates in database
  const insertCandidate = db.prepare(`
    INSERT INTO highlight_candidates (
      id, project_id, start_time, end_time, duration, transcript_text,
      score_total, score_hook, score_emotion, score_information,
      score_surprise, score_story, score_visual, score_audio,
      score_shorts_potential, ai_reason, ai_recommended_start,
      ai_recommended_end, rank, is_selected, is_suppressed, crop_offset_x,
      title, framing_mode
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertAll = db.transaction(() => {
    // Store all clean candidates (both selected and suppressed)
    for (let i = 0; i < cleanCandidates.length; i++) {
      const c = cleanCandidates[i];
      const isSelected = selected.includes(c);
      const isSuppressed = !isSelected;
      const rank = isSelected ? selected.indexOf(c) + 1 : 0;

      const reasonText = c.whySelected && c.whySelected.length > 0
        ? c.whySelected.join(' • ')
        : (c.aiReason || 'Selected by multi-signal engagement analysis');

      insertCandidate.run(
        uuid(), projectId, c.startTime, c.endTime,
        c.endTime - c.startTime, c.transcriptText,
        c.totalScore, c.scores.hook, c.scores.emotion,
        c.scores.contentValue ?? (c.scores as any).information ?? 50,
        c.scores.curiosity ?? (c.scores as any).surprise ?? 50,
        c.scores.story, c.scores.visual, c.scores.audio,
        c.scores.shortsP, reasonText, c.aiStart, c.aiEnd,
        rank, isSelected ? 1 : 0, isSuppressed ? 1 : 0,
        c.cropOffsetX ?? 0.5,
        c.title || `Short #${i + 1}`,
        c.framingMode || preferredMode || 'blur_fill'
      );
    }
  });
  insertAll();

  updateStage('ranking', 'Highlights saved', 100, `Saved ${cleanCandidates.length} highlight moments`);
  completeStage('ranking');

  // ── Complete ──
  updateStage('completed', `Analysis complete. Found ${selected.length} highlight moments.`, 100, `Selected ${selected.length} top moments ready for Shorts creation`);

  db.prepare(`UPDATE projects SET status = 'analyzed', updated_at = datetime('now') WHERE id = ?`).run(projectId);
}

function logProcessing(
  projectId: string,
  jobId: string,
  level: string,
  stage: string,
  message: string
): void {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO processing_logs (project_id, job_id, level, stage, message)
      VALUES (?, ?, ?, ?, ?)
    `).run(projectId, jobId, level, stage, message);
  } catch {
    // Don't let logging errors break the pipeline
    console.log(`[${level}] [${stage}] ${message}`);
  }
}
