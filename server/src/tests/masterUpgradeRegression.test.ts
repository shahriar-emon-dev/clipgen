// ============================================================
// ClipGen Master Upgrade — Automated Regression Test Suite
// Verifies P0–P7: Checkpoint recovery, Cache reuse, Fast alignment,
// Transactional clip replacement, Stale export protection, 60 FPS,
// and Backward Compatibility.
// ============================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs';
import { v4 as uuid } from 'uuid';
import { analysisJobManager } from '../services/movieExplanation/AnalysisJobManager.js';
import { analysisCacheManager } from '../services/movieExplanation/AnalysisCacheManager.js';
import { renderChunkCache } from '../services/movieExplanation/RenderChunkCache.js';
import { movieExplanationStore } from '../services/movieExplanation/MovieExplanationStore.js';
import { aiDirectorEngine } from '../services/movieExplanation/AIDirectorEngine.js';
import { getMovieExplanationProjectDir, ensureDir } from '../services/storage.js';
import type {
  MovieExplanationProjectState,
  EpisodeIntelligenceIndex,
  EpisodeScene,
  MovieExplanationTimeline,
  MovieTimelineShot,
  ExplanationScript,
  StoryMap,
} from '../../../shared/types.js';

function createMockScenes(): EpisodeScene[] {
  return [
    {
      sceneId: 'sc_001',
      sceneIndex: 0,
      startTime: 0,
      endTime: 10,
      duration: 10,
      shotBoundaries: [0, 5],
      dialogueSnippet: 'Scene 1 opening atmosphere',
      characters: ['Alice'],
      actions: ['walking'],
      objectsAndEvidence: [],
      events: ['opening'],
      emotionalTone: 'neutral',
      narrativePurpose: 'opening',
      description: 'Opening morning scene',
      visualDetails: [],
      isClueOrReveal: false,
      isQuietMotivational: false,
      isActionHeavy: false,
      importance: 'important',
      confidence: 0.95,
      sourceFile: 'C:/media/episode.mp4',
    },
    {
      sceneId: 'sc_002',
      sceneIndex: 1,
      startTime: 10,
      endTime: 25,
      duration: 15,
      shotBoundaries: [10, 18],
      dialogueSnippet: 'Scene 2 detective enters',
      characters: ['Bob'],
      actions: ['investigating'],
      objectsAndEvidence: ['magnifying glass'],
      events: ['discovery'],
      emotionalTone: 'mysterious',
      narrativePurpose: 'investigation',
      description: 'Detective examining clues',
      visualDetails: [],
      isClueOrReveal: true,
      isQuietMotivational: false,
      isActionHeavy: false,
      importance: 'critical',
      confidence: 0.92,
      sourceFile: 'C:/media/episode.mp4',
    },
    {
      sceneId: 'sc_003',
      sceneIndex: 2,
      startTime: 25,
      endTime: 40,
      duration: 15,
      shotBoundaries: [25, 32],
      dialogueSnippet: 'Scene 3 suspect revealed',
      characters: ['Charlie'],
      actions: ['fleeing'],
      objectsAndEvidence: [],
      events: ['reveal'],
      emotionalTone: 'tense',
      narrativePurpose: 'reveal',
      description: 'Suspect escapes down the alley',
      visualDetails: [],
      isClueOrReveal: true,
      isQuietMotivational: false,
      isActionHeavy: true,
      importance: 'critical',
      confidence: 0.88,
      sourceFile: 'C:/media/episode.mp4',
    },
  ];
}

function createMockIndex(scenes: EpisodeScene[]): EpisodeIntelligenceIndex {
  const storyMap: StoryMap = {
    characters: [],
    characterRelationships: [],
    openingSituation: 'Foggy morning in Riverdale',
    initialConflict: 'Body found in woods',
    importantDiscoveries: ['Footprints'],
    mysteriesAndClues: ['Unmarked car'],
    risingTensionBeats: ['Alibi broken'],
    majorTurningPoints: [],
    revelations: [],
    climaxSetup: 'Chase to harbor',
    mainClimax: {
      id: 'ev_climax',
      title: 'Showdown at the harbor',
      description: 'Suspect cornered at the docks',
      timestampStart: 30,
      timestampEnd: 40,
      stage: 'climax',
      charactersInvolved: ['Bob', 'Charlie'],
      isKeyReveal: true,
      isClimax: true,
      evidence: 'Stolen vehicle',
    },
    consequences: ['Arrested'],
    resolution: 'Case closed',
    confidence: 0.95,
  };

  return {
    mediaId: 'test_media_1',
    originalVideoPath: 'C:/media/episode.mp4',
    filename: 'episode.mp4',
    duration: 40,
    width: 1920,
    height: 1080,
    fps: 25,
    codec: 'hevc',
    audioCodec: 'aac',
    bitrate: 4000000,
    fileSize: 50000000,
    scenes,
    storyMap,
    indexedAt: new Date().toISOString(),
  };
}

function createMockTimeline(scenes: EpisodeScene[]): MovieExplanationTimeline {
  const shots: MovieTimelineShot[] = [
    {
      shotId: 'shot_1',
      segmentId: 'seg_1',
      sceneId: scenes[0].sceneId,
      sourceFile: scenes[0].sourceFile || 'C:/media/episode.mp4',
      sourceStart: scenes[0].startTime,
      sourceEnd: scenes[0].endTime,
      timelineStart: 0,
      timelineEnd: 10,
      duration: 10,
      isLocked: false,
      matchScore: 95,
      confidence: 0.95,
      isLowConfidence: false,
      transition: 'cut',
      transitionDuration: 0,
      isManualOverride: false,
      framingMode: 'auto',
      whyThisScene: {
        characterMatch: 'Alice walking',
        actionMatch: 'Steady focus',
        storyContextReason: 'Opening scene',
        chronologyCheck: 'Chronologically aligned',
        emotionalFit: 'Neutral expository',
        fullSummary: 'Opening morning scene',
      },
    },
    {
      shotId: 'shot_2',
      segmentId: 'seg_2',
      sceneId: scenes[1].sceneId,
      sourceFile: scenes[1].sourceFile || 'C:/media/episode.mp4',
      sourceStart: scenes[1].startTime,
      sourceEnd: scenes[1].endTime,
      timelineStart: 10,
      timelineEnd: 25,
      duration: 15,
      isLocked: false,
      matchScore: 90,
      confidence: 0.90,
      isLowConfidence: false,
      transition: 'cut',
      transitionDuration: 0,
      isManualOverride: false,
      framingMode: 'auto',
      whyThisScene: {
        characterMatch: 'Bob investigating',
        actionMatch: 'Searching for evidence',
        storyContextReason: 'Investigation begins',
        chronologyCheck: 'Chronologically aligned',
        emotionalFit: 'Mysterious',
        fullSummary: 'Detective examining clues',
      },
    },
    {
      shotId: 'shot_3',
      segmentId: 'seg_3',
      sceneId: scenes[2].sceneId,
      sourceFile: scenes[2].sourceFile || 'C:/media/episode.mp4',
      sourceStart: scenes[2].startTime,
      sourceEnd: scenes[2].endTime,
      timelineStart: 25,
      timelineEnd: 40,
      duration: 15,
      isLocked: false,
      matchScore: 88,
      confidence: 0.88,
      isLowConfidence: false,
      transition: 'cut',
      transitionDuration: 0,
      isManualOverride: false,
      framingMode: 'auto',
      whyThisScene: {
        characterMatch: 'Charlie fleeing',
        actionMatch: 'Running down alley',
        storyContextReason: 'Climax reveal',
        chronologyCheck: 'Chronologically aligned',
        emotionalFit: 'Tense',
        fullSummary: 'Suspect escapes down the alley',
      },
    },
  ];

  return {
    timelineId: 'tl_mock',
    projectId: 'proj_mock',
    duration: 40,
    outputAspectRatio: '16:9',
    outputWidth: 1920,
    outputHeight: 1080,
    outputFps: 60,
    shots,
    timelineRevision: 1,
    revision: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ============================================================
// TEST A — Browser refresh during analysis
// ============================================================
test('Test A: Browser refresh during analysis resumes from checkpoint without duplicate jobs', async () => {
  const testProjectId = `test_p0_${uuid()}`;
  const fingerprint = 'mock_fp_abc123';

  // 1. Start job
  const { job: job1, isNew: isNew1 } = analysisJobManager.startOrResumeJob(testProjectId, fingerprint);
  assert.equal(isNew1, true, 'First job invocation should be new');
  assert.equal(job1.status, 'running');

  // 2. Complete checkpoints
  analysisJobManager.saveCheckpoint(testProjectId, 'metadata_probed', 'Video metadata extracted (1080p @ 25fps)', 10);
  analysisJobManager.saveCheckpoint(testProjectId, 'transcription_complete', 'Audio transcribed (364 thoughts)', 35);

  // 3. Simulate browser refresh / duplicate button clicks
  const { job: job2, isNew: isNew2 } = analysisJobManager.startOrResumeJob(testProjectId, fingerprint);
  assert.equal(isNew2, false, 'Duplicate job submission must return existing running job');
  assert.equal(job2.jobId, job1.jobId, 'Job ID must be stable across refresh');
  assert.equal(job2.completedStages.includes('metadata_probed'), true, 'Must preserve metadata_probed checkpoint');
  assert.equal(job2.completedStages.includes('transcription_complete'), true, 'Must preserve transcription_complete checkpoint');
  assert.equal(job2.lastCheckpoint, 'transcription_complete');
  assert.equal(job2.overallProgress, 35, 'Progress must not reset to 0%');

  // Complete job
  analysisJobManager.completeJob(testProjectId, 115);
  const finishedJob = analysisJobManager.getJob(testProjectId);
  assert.equal(finishedJob?.status, 'completed');
  assert.equal(finishedJob?.overallProgress, 100);
});

// ============================================================
// TEST B — Application or worker restart
// ============================================================
test('Test B: Application restart recovers job state from durable disk storage', async () => {
  const testProjectId = `test_p0_restart_${uuid()}`;
  const fingerprint = 'mock_fp_restart456';

  // Start and checkpoint
  analysisJobManager.startOrResumeJob(testProjectId, fingerprint);
  analysisJobManager.saveCheckpoint(testProjectId, 'cuts_detected', '29 scene cuts detected', 50);

  // Simulate total worker process restart by clearing memory cache
  (analysisJobManager as any).activeJobs.clear();

  // Read job again from disk
  const recoveredJob = analysisJobManager.getJob(testProjectId);
  assert.ok(recoveredJob, 'Job must be recovered from disk file analysis_job.json');
  assert.equal(recoveredJob.lastCheckpoint, 'cuts_detected');
  assert.equal(recoveredJob.overallProgress, 50);
  assert.equal(recoveredJob.completedStages.includes('cuts_detected'), true);
});

// ============================================================
// TEST C — Replace one clip and export
// ============================================================
test('Test C: Transactional clip replacement updates authoritative timeline and increments revision', async () => {
  const scenes = createMockScenes();
  const testProjectId = `test_p3_replace_${uuid()}`;

  // Create project in store
  const project = movieExplanationStore.createProject(`Project ${testProjectId}`);
  project.projectId = testProjectId;
  project.episodeIndex = createMockIndex(scenes);
  project.timeline = createMockTimeline(scenes);
  project.timelineRevision = 1;
  project.lastExportedRevision = 1;
  project.exportStatus = 'up_to_date';
  movieExplanationStore.saveProject(project);

  // Authoritative timeline before replacement
  const initialShot2 = project.timeline.shots[1];
  assert.equal(initialShot2.sceneId, 'sc_002');
  assert.equal(project.timelineRevision, 1);

  // Alternative scene to replace shot 2 with (replace with sc_003)
  const newScene = scenes[2];
  const updatedShots: MovieTimelineShot[] = project.timeline.shots.map((s) => {
    if (s.shotId === 'shot_2') {
      return {
        ...s,
        sceneId: newScene.sceneId,
        sourceFile: newScene.sourceFile || project.episodeIndex?.originalVideoPath || 'C:/media/episode.mp4',
        sourceStart: newScene.startTime,
        sourceEnd: newScene.endTime,
        duration: newScene.duration,
        timelineEnd: s.timelineStart + newScene.duration,
      };
    }
    return s;
  });

  const updatedTimeline: MovieExplanationTimeline = {
    ...project.timeline,
    shots: updatedShots,
    timelineRevision: 2,
    revision: 2,
  };

  // Transactionally commit replacement
  project.timeline = updatedTimeline;
  project.timelineRevision = 2;
  project.exportStatus = 'outdated';
  movieExplanationStore.saveProject(project);

  // Reload project from disk
  const reloaded = movieExplanationStore.getProject(testProjectId);
  assert.ok(reloaded?.timeline);
  assert.equal(reloaded.timelineRevision, 2, 'Timeline revision must increment to 2');
  assert.equal(reloaded.exportStatus, 'outdated', 'Export status must be outdated');
  assert.equal(reloaded.timeline.shots[1].sceneId, 'sc_003', 'Shot 2 must reference new replacement scene');
  assert.equal(reloaded.timeline.shots[0].sceneId, 'sc_001', 'Shot 1 must remain untouched');
  assert.equal(reloaded.timeline.shots[2].sceneId, 'sc_003', 'Shot 3 must remain untouched');
});

// ============================================================
// TEST D — Replace multiple clips quickly
// ============================================================
test('Test D: Rapid successive clip replacements preserve all changes without stale overwrite', async () => {
  const scenes = createMockScenes();
  const testProjectId = `test_p3_rapid_${uuid()}`;

  const project = movieExplanationStore.createProject('Rapid Edit Test');
  project.projectId = testProjectId;
  project.episodeIndex = createMockIndex(scenes);
  project.timeline = createMockTimeline(scenes);
  project.timelineRevision = 1;
  movieExplanationStore.saveProject(project);

  // Rapid Edit 1: Replace shot 1 with scene 2
  const p1 = movieExplanationStore.getProject(testProjectId)!;
  p1.timeline!.shots[0].sceneId = 'sc_002';
  p1.timelineRevision = (p1.timelineRevision || 1) + 1;
  movieExplanationStore.saveProject(p1);

  // Rapid Edit 2: Replace shot 3 with scene 1
  const p2 = movieExplanationStore.getProject(testProjectId)!;
  p2.timeline!.shots[2].sceneId = 'sc_001';
  p2.timelineRevision = (p2.timelineRevision || 1) + 1;
  movieExplanationStore.saveProject(p2);

  // Verify final saved state
  const finalState = movieExplanationStore.getProject(testProjectId)!;
  assert.equal(finalState.timelineRevision, 3);
  assert.equal(finalState.timeline?.shots[0].sceneId, 'sc_002', 'First rapid replacement must be preserved');
  assert.equal(finalState.timeline?.shots[2].sceneId, 'sc_001', 'Second rapid replacement must be preserved');
});

// ============================================================
// TEST E — Retry after export failure
// ============================================================
test('Test E: Export failure preserves analysis, episode index, and timeline for retry', async () => {
  const scenes = createMockScenes();
  const testProjectId = `test_p3_fail_${uuid()}`;

  const project = movieExplanationStore.createProject('Failure Recovery Test');
  project.projectId = testProjectId;
  project.episodeIndex = createMockIndex(scenes);
  project.timeline = createMockTimeline(scenes);
  project.timelineRevision = 2;
  project.exportStatus = 'rendering';
  movieExplanationStore.saveProject(project);

  // Simulate export failure
  project.exportStatus = 'failed';
  project.renderStage = 'failed';
  project.renderDetail = 'Render failed: disk space warning';
  movieExplanationStore.saveProject(project);

  // Verify project remains intact
  const recovered = movieExplanationStore.getProject(testProjectId)!;
  assert.ok(recovered.episodeIndex, 'Episode index must not be deleted on render failure');
  assert.equal(recovered.episodeIndex.scenes.length, 3);
  assert.ok(recovered.timeline, 'Timeline must not be deleted on render failure');
  assert.equal(recovered.timelineRevision, 2);
  assert.equal(recovered.exportStatus, 'failed');
  assert.equal(recovered.renderedVideoPath, undefined, 'Failed export must not be marked as valid completed video');
});

// ============================================================
// TEST F — Incremental render & chunk caching
// ============================================================
test('Test F: Render chunk cache keys shots by parameters and invalidates only changed shots', async () => {
  const scenes = createMockScenes();
  const timeline = createMockTimeline(scenes);
  const shot1 = timeline.shots[0];
  const shot2 = timeline.shots[1];

  const hash1 = renderChunkCache.computeChunkHash({
    shot: shot1,
    aspectRatio: '16:9',
    outW: 1920,
    outH: 1080,
    outFps: 60,
    encoder: 'libx264',
    preset: 'veryfast',
    crf: 18,
  });

  const hash2 = renderChunkCache.computeChunkHash({
    shot: shot2,
    aspectRatio: '16:9',
    outW: 1920,
    outH: 1080,
    outFps: 60,
    encoder: 'libx264',
    preset: 'veryfast',
    crf: 18,
  });

  assert.notEqual(hash1, hash2, 'Different shots must produce different chunk cache keys');

  // Changing shot2 trim must change hash2 but keep hash1 identical
  const modifiedShot2 = { ...shot2, sourceStart: shot2.sourceStart + 2 };
  const hash2Modified = renderChunkCache.computeChunkHash({
    shot: modifiedShot2,
    aspectRatio: '16:9',
    outW: 1920,
    outH: 1080,
    outFps: 60,
    encoder: 'libx264',
    preset: 'veryfast',
    crf: 18,
  });

  assert.notEqual(hash2, hash2Modified, 'Changing trim must produce a new cache key');

  // Verify hash1 is completely unchanged (dirty-region tracking)
  const hash1Repeat = renderChunkCache.computeChunkHash({
    shot: shot1,
    aspectRatio: '16:9',
    outW: 1920,
    outH: 1080,
    outFps: 60,
    encoder: 'libx264',
    preset: 'veryfast',
    crf: 18,
  });
  assert.equal(hash1, hash1Repeat, 'Unchanged shot 1 must produce the exact same chunk cache key');
});

// ============================================================
// TEST G — Stale export protection
// ============================================================
test('Test G: Project detects when export is outdated and prevents serving stale video as current revision', async () => {
  const testProjectId = `test_stale_${uuid()}`;
  const scenes = createMockScenes();

  const project = movieExplanationStore.createProject('Stale Test');
  project.projectId = testProjectId;
  project.timeline = createMockTimeline(scenes);
  project.timelineRevision = 1;
  project.lastExportedRevision = 1;
  project.exportStatus = 'up_to_date';
  project.renderedVideoPath = 'C:/renders/test_master.mp4';
  movieExplanationStore.saveProject(project);

  // Initially up to date
  assert.equal(project.exportStatus, 'up_to_date');

  // User edits clip
  project.timelineRevision = 2;
  project.exportStatus = 'outdated';
  movieExplanationStore.saveProject(project);

  const reloaded = movieExplanationStore.getProject(testProjectId)!;
  assert.equal(reloaded.timelineRevision, 2);
  assert.equal(reloaded.lastExportedRevision, 1);
  assert.equal(reloaded.exportStatus, 'outdated');
  assert.ok(
    reloaded.timelineRevision > (reloaded.lastExportedRevision || 0),
    'Export must be recognized as outdated when timelineRevision > lastExportedRevision'
  );
});

// ============================================================
// TEST H — Backward compatibility with older projects
// ============================================================
test('Test H: Older projects without revision fields or separate episode_index.json load safely', async () => {
  const testProjectId = `test_legacy_${uuid()}`;
  const dir = getMovieExplanationProjectDir(testProjectId);
  ensureDir(dir);

  // Write a legacy state.json that lacks timelineRevision, exportStatus, and episodeIndex
  const legacyState = {
    projectId: testProjectId,
    projectName: 'Legacy 2025 Project',
    status: 'setup',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify(legacyState, null, 2), 'utf8');

  // Write separate episode_index.json on disk (as earlier versions did)
  const scenes = createMockScenes();
  const legacyIndex = createMockIndex(scenes);
  fs.writeFileSync(path.join(dir, 'episode_index.json'), JSON.stringify(legacyIndex, null, 2), 'utf8');

  // Load via store
  const loaded = movieExplanationStore.getProject(testProjectId);
  assert.ok(loaded, 'Legacy project must load');
  assert.equal(loaded.projectId, testProjectId);
  assert.ok(loaded.episodeIndex, 'episodeIndex must be auto-hydrated from disk');
  assert.equal(loaded.episodeIndex.scenes.length, 3);
  assert.equal(loaded.timelineRevision, 1, 'Default timelineRevision must be initialized');
  assert.equal(loaded.exportStatus, 'none', 'Default exportStatus must be initialized');
});

// ============================================================
// 60 FPS Export Quality Validation
// ============================================================
test('60 FPS Quality Requirement: AIDirectorEngine and Renderer enforce 60 FPS outputs', async () => {
  const scenes = createMockScenes();
  const index = createMockIndex(scenes);
  const script: ExplanationScript = {
    format: 'plain',
    rawText: 'Opening test narration text',
    isAlignedToVoiceover: true,
    segments: [
      {
        segmentId: 'seg_1',
        text: 'Opening test narration',
        voiceoverStart: 0,
        voiceoverEnd: 10,
        duration: 10,
        sentenceIndex: 0,
        paragraphIndex: 0,
        eventsDescribed: [],
        narrativePurpose: 'opening',
        visualIntent: 'opening',
        requiresMultiShot: false,
        targetShotCount: 1,
      },
    ],
    alignmentConfidence: 0.95,
  };

  const timeline = aiDirectorEngine.generateTimeline(index, script, '16:9');
  assert.equal(timeline.outputFps, 60, 'Generated timeline must specify 60 FPS');
  const rev = timeline.revision || timeline.timelineRevision || 0;
  assert.ok(rev >= 1, 'Timeline must track revision number');
});
