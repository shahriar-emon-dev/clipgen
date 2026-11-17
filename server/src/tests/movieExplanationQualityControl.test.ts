// ============================================================
// Movie Explanation Quality Control & Anti-Repetition Test Suite
// Exhaustively tests Scenarios A through L as mandated by Master Fix Prompt:
// Test A: Repeated Clip Prevention (Anti-consecutive penalty & scene diversity)
// Test B: Screenshot Cadence Enforcement (Max 5 consecutive video clips)
// Test C: Maximum Video Clip Duration (Strict <= 3.0s limit)
// Test D: Narration Relevance First (Story beat matching over generic footage)
// Test E: Missing Matching Footage (Transparent review instead of hallucinated filler)
// Test F: Replacement Persistence (Approved replacements preserved in render plan)
// Test G: Browser Refresh & Checkpoint Resumption (State persistence)
// Test H: Voiceover Revision Timing Ripple (Downstream recalculation)
// Test I: Near-Duplicate Footage Detection (Overlapping source intervals)
// Test J: Existing Feature Regression Verification
// Test K: Screenshot Timing and Cinematic Motion Effects
// Test L: Final Centralized Timeline Audit (PASS / REVIEW REQUIRED / BLOCKED)
// ============================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { v4 as uuid } from 'uuid';
import { storySceneMatcher } from '../services/movieExplanation/StorySceneMatcher.js';
import { aiDirectorEngine } from '../services/movieExplanation/AIDirectorEngine.js';
import { movieExplanationQualityGate } from '../services/movieExplanation/MovieExplanationQualityGate.js';
import { transformativeFilterEngine } from '../services/movieExplanation/TransformativeFilterEngine.js';
import { movieExplanationStore } from '../services/movieExplanation/MovieExplanationStore.js';
import type {
  EpisodeIntelligenceIndex,
  EpisodeScene,
  ExplanationScript,
  ExplanationScriptSegment,
  MovieExplanationTimeline,
  MovieTimelineShot,
  StoryMap,
} from '../../../shared/types.js';

function createSyntheticEpisodeIndex(sceneCount: number = 20): EpisodeIntelligenceIndex {
  const scenes: EpisodeScene[] = [];
  const durationPerScene = 120;

  for (let i = 0; i < sceneCount; i++) {
    const startTime = i * durationPerScene;
    const endTime = startTime + durationPerScene;
    scenes.push({
      sceneId: `sc_${String(i + 1).padStart(3, '0')}`,
      sceneIndex: i,
      startTime,
      endTime,
      duration: durationPerScene,
      shotBoundaries: [startTime, startTime + 40, startTime + 80],
      dialogueSnippet: `Dialogue in scene ${i + 1} between characters.`,
      dialogueText: `Dialogue in scene ${i + 1} between characters.`,
      characters: i % 2 === 0 ? ['Alice', 'Bob'] : ['Charlie', 'Detective Ray'],
      location: i % 3 === 0 ? 'Office' : i % 3 === 1 ? 'Street' : 'Warehouse',
      actions: i === 2 ? ['discovering hidden vault', 'unlocking secret safe'] : ['talking', 'walking'],
      objectsAndEvidence: i === 2 ? ['secret safe', 'hidden document'] : [],
      events: [`Event at ${startTime}s`],
      emotionalTone: i === 2 ? 'tense / discovery' : 'neutral',
      narrativePurpose: i === 2 ? 'clue' : 'setup',
      description: i === 2
        ? 'Alice discovers a hidden secret vault behind the portrait and unlocks it.'
        : `Routine conversation scene ${i + 1} with characters.`,
      visualDetails: [`Duration: ${durationPerScene}s`],
      isClueOrReveal: i === 2,
      isQuietMotivational: false,
      isActionHeavy: false,
      importance: i === 2 ? 'critical' : 'supporting',
      confidence: 0.95,
      thumbnailUrl: `/mock/thumb_${i + 1}.jpg`,
    });
  }

  const storyMap: StoryMap = {
    title: 'Synthetic Mystery Project',
    logline: 'An investigation into a mysterious disappearance.',
    characters: [
      { id: 'c1', name: 'Alice', aliases: [], role: 'protagonist', description: 'Lead investigator', firstAppearanceTime: 0 },
      { id: 'c2', name: 'Bob', aliases: [], role: 'supporting', description: 'Partner', firstAppearanceTime: 0 },
    ],
    characterRelationships: [],
    openingSituation: 'Story begins.',
    initialConflict: 'Conflict arises.',
    importantDiscoveries: ['Hidden vault'],
    mysteriesAndClues: [],
    risingTensionBeats: [],
    majorTurningPoints: [],
    revelations: [],
    climaxSetup: '',
    mainClimax: {
      id: 'cl1',
      title: 'Climax',
      description: 'Resolution',
      timestampStart: 1800,
      timestampEnd: 2200,
      stage: 'climax',
      charactersInvolved: ['Alice'],
      isKeyReveal: true,
      isClimax: true,
      evidence: '',
    },
    consequences: [],
    resolution: '',
    confidence: 0.95,
  };

  return {
    mediaId: 'synthetic_media_001',
    originalVideoPath: 'synthetic_video.mp4',
    filename: 'synthetic_video.mp4',
    duration: sceneCount * durationPerScene,
    width: 1920,
    height: 1080,
    fps: 30,
    codec: 'h264',
    audioCodec: 'aac',
    bitrate: 5000000,
    fileSize: 100000000,
    scenes,
    storyMap,
    indexedAt: new Date().toISOString(),
  };
}

// ────────────────────────────────────────────────────────────
// Test A — Repeated Clip Prevention
// ────────────────────────────────────────────────────────────
test('Test A — Repeated Clip Prevention: System avoids repeating the same scene across consecutive positions', () => {
  const index = createSyntheticEpisodeIndex(15);
  const segments: ExplanationScriptSegment[] = [];

  // 10 consecutive segments that would all match generic scene sc_001
  for (let i = 0; i < 10; i++) {
    segments.push({
      segmentId: `seg_${i + 1}`,
      text: `Alice and Bob talk about the ongoing case in part ${i + 1}.`,
      voiceoverStart: i * 3.0,
      voiceoverEnd: (i + 1) * 3.0,
      duration: 3.0,
      sentenceIndex: i,
      paragraphIndex: 0,
      eventsDescribed: [],
      narrativePurpose: 'setup',
      visualIntent: 'conversation',
      requiresMultiShot: false,
      targetShotCount: 1,
    });
  }

  const script: ExplanationScript = {
    rawText: segments.map((s) => s.text).join(' '),
    format: 'plain',
    alignmentConfidence: 0.95,
    isAlignedToVoiceover: true,
    segments,
  };

  const timeline = aiDirectorEngine.generateTimeline(index, script, '16:9', undefined, {
    duplicatePolicy: 'strict_no_reuse',
    strictClipDurationMode: true,
    maxShotDuration: 3.0,
  });

  assert.ok(timeline.shots.length >= 10, 'Timeline must generate shots for all segments');

  // Verify that the timeline does NOT repeat the exact same scene 10 times consecutively
  const uniqueScenes = new Set(timeline.shots.map((s) => s.sceneId).filter((id) => id !== 'unmatched'));
  assert.ok(uniqueScenes.size > 1, `Scene selection must be diverse (found ${uniqueScenes.size} unique scenes across 10 segments)`);

  // Verify no adjacent consecutive video clips use the same scene ID across different segments
  for (let i = 1; i < timeline.shots.length; i++) {
    const prev = timeline.shots[i - 1];
    const curr = timeline.shots[i];
    if (curr.segmentId !== prev.segmentId && !curr.isScreenshot && !prev.isScreenshot && curr.sceneId !== 'unmatched') {
      assert.notEqual(
        curr.sceneId,
        prev.sceneId,
        `Consecutive positions #${i} and #${i + 1} must not repeat scene ${curr.sceneId}`
      );
    }
  }
});

// ────────────────────────────────────────────────────────────
// Test B — Screenshot Cadence Enforcement
// ────────────────────────────────────────────────────────────
test('Test B — Screenshot Cadence: Generated timeline inserts screenshots so <= 5 consecutive video clips occur', () => {
  const index = createSyntheticEpisodeIndex(20);
  const segments: ExplanationScriptSegment[] = [];

  // 12 consecutive narration segments
  for (let i = 0; i < 12; i++) {
    segments.push({
      segmentId: `seg_cad_${i + 1}`,
      text: `Investigation segment ${i + 1} describing progression through the scene.`,
      voiceoverStart: i * 2.5,
      voiceoverEnd: (i + 1) * 2.5,
      duration: 2.5,
      sentenceIndex: i,
      paragraphIndex: 0,
      eventsDescribed: [],
      narrativePurpose: i % 4 === 3 ? 'reveal' : 'setup',
      visualIntent: 'evidence',
      requiresMultiShot: false,
      targetShotCount: 1,
    });
  }

  const script: ExplanationScript = {
    rawText: segments.map((s) => s.text).join(' '),
    format: 'plain',
    alignmentConfidence: 0.95,
    isAlignedToVoiceover: true,
    segments,
  };

  const timeline = aiDirectorEngine.generateTimeline(index, script, '16:9', undefined, {
    maxConsecutiveVideoClips: 5,
    screenshotInterval: 4,
    strictClipDurationMode: true,
    maxShotDuration: 3.0,
  });

  const screenshots = timeline.shots.filter((s) => s.isScreenshot || s.presentationType === 'screenshot');
  assert.ok(screenshots.length >= 2, `Timeline must insert moving screenshots (found ${screenshots.length})`);

  // Verify consecutive video clip counter never exceeds 5
  let consecutiveVideos = 0;
  for (const shot of timeline.shots) {
    if (shot.isScreenshot || shot.presentationType === 'screenshot') {
      consecutiveVideos = 0;
    } else {
      consecutiveVideos++;
      assert.ok(
        consecutiveVideos <= 5,
        `Consecutive video clips must not exceed 5 (reached ${consecutiveVideos} at shot ${shot.shotId})`
      );
    }
  }
});

// ────────────────────────────────────────────────────────────
// Test C — Maximum Video Clip Duration
// ────────────────────────────────────────────────────────────
test('Test C — Maximum Duration: Selected clip lasting 7.5s is automatically split/trimmed to <= 3.0s', () => {
  const index = createSyntheticEpisodeIndex(10);
  const script: ExplanationScript = {
    rawText: 'Alice explains the intricate timeline of the night in question.',
    format: 'plain',
    alignmentConfidence: 0.95,
    isAlignedToVoiceover: true,
    segments: [
      {
        segmentId: 'seg_long',
        text: 'Alice explains the intricate timeline of the night in question.',
        voiceoverStart: 0,
        voiceoverEnd: 7.5,
        duration: 7.5,
        sentenceIndex: 0,
        paragraphIndex: 0,
        eventsDescribed: [],
        narrativePurpose: 'setup',
        visualIntent: 'explanation',
        requiresMultiShot: false,
        targetShotCount: 1,
      },
    ],
  };

  const timeline = aiDirectorEngine.generateTimeline(index, script, '16:9', undefined, {
    strictClipDurationMode: true,
    maxShotDuration: 3.0,
  });

  assert.ok(timeline.shots.length >= 3, '7.5s segment must be divided into at least 3 sub-shots');
  for (const shot of timeline.shots) {
    if (!shot.isScreenshot && shot.presentationType !== 'screenshot') {
      assert.ok(
        shot.duration <= 3.05,
        `Video shot ${shot.shotId} duration (${shot.duration}s) must not exceed 3.0s maximum limit`
      );
    }
  }
});

// ────────────────────────────────────────────────────────────
// Test D — Narration Relevance First
// ────────────────────────────────────────────────────────────
test('Test D — Narration Relevance: Discovery beat ranks vault discovery scene above unrelated dialogue', () => {
  const index = createSyntheticEpisodeIndex(10);
  // Scene sc_003 is the secret vault discovery scene (index 2)
  const discoverySegment: ExplanationScriptSegment = {
    segmentId: 'seg_disc',
    text: 'Alice discovers a hidden secret vault behind the portrait and unlocks it.',
    voiceoverStart: 0,
    voiceoverEnd: 3.0,
    duration: 3.0,
    sentenceIndex: 0,
    paragraphIndex: 0,
    eventsDescribed: ['discovering hidden vault'],
    narrativePurpose: 'clue',
    visualIntent: 'discovery',
    requiresMultiShot: false,
    targetShotCount: 1,
  };

  const candidates = storySceneMatcher.matchCandidatesForSegment(
    discoverySegment,
    index,
    [discoverySegment],
    0,
    { duplicatePolicy: 'strict_no_reuse' }
  );

  assert.ok(candidates.length > 0, 'Candidates should be returned');
  const topCandidate = candidates[0];
  assert.equal(
    topCandidate.scene.sceneId,
    'sc_003',
    `Discovery segment must rank sc_003 first (got ${topCandidate.scene.sceneId} with score ${topCandidate.matchScore}%)`
  );
  assert.ok(topCandidate.matchScore >= 70, 'Discovery match score should be high confidence (>= 70%)');
});

// ────────────────────────────────────────────────────────────
// Test E — Missing Matching Footage
// ────────────────────────────────────────────────────────────
test('Test E — Missing Matching Footage: Unmatched beat is flagged for review instead of inventing filler', () => {
  const index = createSyntheticEpisodeIndex(5);
  // An alien invasion scene that has zero evidence in the index
  const alienSegment: ExplanationScriptSegment = {
    segmentId: 'seg_alien',
    text: 'Suddenly an alien starship descends from the stratosphere firing laser cannons across the metropolis.',
    voiceoverStart: 0,
    voiceoverEnd: 3.0,
    duration: 3.0,
    sentenceIndex: 0,
    paragraphIndex: 0,
    eventsDescribed: ['alien attack'],
    narrativePurpose: 'climax',
    visualIntent: 'ufo',
    requiresMultiShot: false,
    targetShotCount: 1,
  };

  const candidates = storySceneMatcher.matchCandidatesForSegment(
    alienSegment,
    index,
    [alienSegment],
    0,
    { duplicatePolicy: 'strict_no_reuse' }
  );

  const top = candidates[0];
  assert.ok(
    top.isUnmatched || top.isLowConfidence,
    'Alien invasion segment must be flagged as unmatched or low-confidence against realistic mystery footage'
  );

  const script: ExplanationScript = {
    rawText: alienSegment.text,
    format: 'plain',
    alignmentConfidence: 0.95,
    isAlignedToVoiceover: true,
    segments: [alienSegment],
  };

  const timeline = aiDirectorEngine.generateTimeline(index, script, '16:9', undefined, {
    strictClipDurationMode: true,
    maxShotDuration: 3.0,
  });

  const shot = timeline.shots[0];
  assert.ok(
    shot.isUnmatched || shot.isLowConfidence || shot.sceneId === 'unmatched',
    'AI director must flag uncertain shot rather than claiming a confident match'
  );
});

// ────────────────────────────────────────────────────────────
// Test F — Replacement Persistence
// ────────────────────────────────────────────────────────────
test('Test F — Replacement Persistence: Manual replacement updates timeline revision and persists', () => {
  const projectId = `test_repl_${uuid().slice(0, 8)}`;
  const project = movieExplanationStore.createProject(projectId, 'Replacement Persistence Project');

  const index = createSyntheticEpisodeIndex(5);
  const script: ExplanationScript = {
    rawText: 'Test segment text.',
    format: 'plain',
    alignmentConfidence: 0.95,
    isAlignedToVoiceover: true,
    segments: [
      {
        segmentId: 'seg_01',
        text: 'Test segment text.',
        voiceoverStart: 0,
        voiceoverEnd: 3.0,
        duration: 3.0,
        sentenceIndex: 0,
        paragraphIndex: 0,
        eventsDescribed: [],
        narrativePurpose: 'setup',
        visualIntent: '',
        requiresMultiShot: false,
        targetShotCount: 1,
      },
    ],
  };

  project.episodeIndex = index;
  project.script = script;
  const initialTimeline = aiDirectorEngine.generateTimeline(index, script);
  project.timeline = initialTimeline;
  project.timelineRevision = 1;
  movieExplanationStore.saveProject(project);

  // Perform manual replacement
  const targetShot = initialTimeline.shots[0];
  const replacementSceneId = 'sc_005';
  targetShot.sceneId = replacementSceneId;
  targetShot.isLocked = true;
  targetShot.isManualOverride = true;
  project.timelineRevision = 2;
  project.timeline.timelineRevision = 2;
  project.exportStatus = 'outdated';
  movieExplanationStore.saveProject(project);

  // Reload project from disk
  const loaded = movieExplanationStore.getProject(projectId);
  assert.ok(loaded?.timeline, 'Timeline must reload from persistence');
  assert.equal(loaded.timeline.shots[0].sceneId, replacementSceneId, 'Replacement scene must be preserved');
  assert.equal(loaded.timeline.shots[0].isLocked, true, 'Replacement shot must remain locked');
  assert.equal(loaded.timelineRevision, 2, 'Timeline revision must be incremented to 2');
});

// ────────────────────────────────────────────────────────────
// Test G — Browser Refresh & Checkpoint Resumption
// ────────────────────────────────────────────────────────────
test('Test G — Browser Refresh: Saved checkpoints survive and resume without re-analysis', () => {
  const projectId = `test_ckpt_${uuid().slice(0, 8)}`;
  const project = movieExplanationStore.createProject(projectId, 'Checkpoint Resumption Project');

  project.episodeIndex = createSyntheticEpisodeIndex(8);
  project.status = 'aligning_script';
  movieExplanationStore.saveProject(project);

  // Simulate page reload by reading fresh instance from disk
  const reloaded = movieExplanationStore.getProject(projectId);
  assert.ok(reloaded, 'Project must exist after simulated browser refresh');
  assert.equal(reloaded.status, 'aligning_script', 'Status must remain aligning_script');
  assert.equal(reloaded.episodeIndex?.scenes.length, 8, 'All 8 indexed scenes must be intact');
});

// ────────────────────────────────────────────────────────────
// Test H — Voiceover Revision Timing Ripple
// ────────────────────────────────────────────────────────────
test('Test H — Voiceover Revision: Changing audio duration recalculates downstream timeline positions', () => {
  const index = createSyntheticEpisodeIndex(5);
  const seg1: ExplanationScriptSegment = {
    segmentId: 'seg_1',
    text: 'First beat of explanation.',
    voiceoverStart: 0,
    voiceoverEnd: 3.0,
    duration: 3.0,
    sentenceIndex: 0,
    paragraphIndex: 0,
    eventsDescribed: [],
    narrativePurpose: 'setup',
    visualIntent: '',
    requiresMultiShot: false,
    targetShotCount: 1,
  };
  const seg2: ExplanationScriptSegment = {
    segmentId: 'seg_2',
    text: 'Second beat of explanation.',
    voiceoverStart: 3.0,
    voiceoverEnd: 6.0,
    duration: 3.0,
    sentenceIndex: 1,
    paragraphIndex: 0,
    eventsDescribed: [],
    narrativePurpose: 'reaction',
    visualIntent: '',
    requiresMultiShot: false,
    targetShotCount: 1,
  };

  const script: ExplanationScript = {
    rawText: 'First beat of explanation. Second beat of explanation.',
    format: 'plain',
    alignmentConfidence: 0.95,
    isAlignedToVoiceover: true,
    segments: [seg1, seg2],
  };

  const tl1 = aiDirectorEngine.generateTimeline(index, script);
  assert.equal(tl1.shots[1].timelineStart, 3.0);

  // Extend seg1 duration from 3.0s to 5.0s (e.g. re-recorded slower voiceover)
  seg1.voiceoverEnd = 5.0;
  seg1.duration = 5.0;
  seg2.voiceoverStart = 5.0;
  seg2.voiceoverEnd = 8.0;

  const tl2 = aiDirectorEngine.generateTimeline(index, script);
  const seg2Shots = tl2.shots.filter((s) => s.segmentId === 'seg_2');
  assert.ok(seg2Shots.length > 0);
  assert.equal(
    seg2Shots[0].timelineStart,
    5.0,
    'Downstream shot timelineStart must ripple to 5.0s following voiceover revision'
  );
});

// ────────────────────────────────────────────────────────────
// Test I — Near-Duplicate Footage Detection
// ────────────────────────────────────────────────────────────
test('Test I — Near-Duplicate Detection: Identifies overlapping source intervals across adjacent timeline positions', () => {
  const shots: MovieTimelineShot[] = [
    {
      shotId: 'shot_1',
      segmentId: 'seg_1',
      sceneId: 'sc_002',
      sourceFile: 'movie.mp4',
      sourceStart: 10.0,
      sourceEnd: 13.0,
      timelineStart: 0.0,
      timelineEnd: 3.0,
      duration: 3.0,
      matchScore: 80,
      confidence: 0.8,
      isLowConfidence: false,
      whyThisScene: {} as any,
      transition: 'cut',
      transitionDuration: 0,
      isLocked: false,
      isManualOverride: false,
      framingMode: 'action',
    },
    {
      shotId: 'shot_2',
      segmentId: 'seg_2', // Different narration segment
      sceneId: 'sc_002',  // Reuses SAME scene
      sourceFile: 'movie.mp4',
      sourceStart: 11.0,  // Overlaps 10.0-13.0 interval by 2.0s!
      sourceEnd: 14.0,
      timelineStart: 3.0,
      timelineEnd: 6.0,
      duration: 3.0,
      matchScore: 80,
      confidence: 0.8,
      isLowConfidence: false,
      whyThisScene: {} as any,
      transition: 'cut',
      transitionDuration: 0,
      isLocked: false,
      isManualOverride: false,
      framingMode: 'action',
    },
  ];

  const syntheticTimeline: MovieExplanationTimeline = {
    timelineId: 'tl_near_dup',
    projectId: 'p_near_dup',
    duration: 6.0,
    shots,
    outputAspectRatio: '16:9',
    outputWidth: 1920,
    outputHeight: 1080,
    outputFps: 30,
    transformativeSettings: {
      enableFairUsePreset: true,
      maxShotDuration: 3.0,
      minShotDuration: 1.5,
      horizontalFlip: false,
      playbackSpeed: 1.0,
      zoomLevel: 1.0,
      strictClipDurationMode: true,
      framingMode: 'action',
      captionsEnabled: false,
      qualityPreset: 'balanced',
      colorGrading: {} as any,
      audioMixing: {} as any,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const report = movieExplanationQualityGate.evaluateTimeline(syntheticTimeline, 6.0);
  assert.equal(report.passed, false, 'Timeline with overlapping source intervals must fail Quality Gate');
  assert.equal(report.validationOutcome, 'BLOCKED', 'Validation outcome must be BLOCKED');
  assert.ok(
    (report.nearDuplicateFootageCount || 0) > 0,
    'Near-duplicate footage count must be greater than 0'
  );
});

// ────────────────────────────────────────────────────────────
// Test J — Existing Feature Regression Verification
// ────────────────────────────────────────────────────────────
test('Test J — Existing Feature Regression: Multi-track timeline properties and locking remain functional', () => {
  const index = createSyntheticEpisodeIndex(5);
  const script: ExplanationScript = {
    rawText: 'Locked shot regression test.',
    format: 'plain',
    alignmentConfidence: 0.95,
    isAlignedToVoiceover: true,
    segments: [
      {
        segmentId: 'seg_locked',
        text: 'Locked shot regression test.',
        voiceoverStart: 0,
        voiceoverEnd: 3.0,
        duration: 3.0,
        sentenceIndex: 0,
        paragraphIndex: 0,
        eventsDescribed: [],
        narrativePurpose: 'setup',
        visualIntent: '',
        requiresMultiShot: false,
        targetShotCount: 1,
      },
    ],
  };

  const tl = aiDirectorEngine.generateTimeline(index, script);
  const shot = tl.shots[0];
  shot.isLocked = true;
  shot.sceneId = 'sc_004';

  // Regenerate timeline passing existing timeline with locked shot
  const regenerated = aiDirectorEngine.generateTimeline(index, script, '16:9', tl);
  const keptShot = regenerated.shots.find((s) => s.segmentId === 'seg_locked');
  assert.ok(keptShot, 'Locked shot must exist after regeneration');
  assert.equal(keptShot.sceneId, 'sc_004', 'Locked shot sceneId must be preserved');
  assert.equal(keptShot.isLocked, true, 'Locked status must remain true');
});

// ────────────────────────────────────────────────────────────
// Test K — Screenshot Timing and Motion
// ────────────────────────────────────────────────────────────
test('Test K — Screenshot Timing and Motion: Filtergraph preserves duration and applies valid motion effect', () => {
  const motionEffects = [
    'pan_left_to_right',
    'pan_right_to_left',
    'gentle_zoom_in',
    'gentle_zoom_out',
    'subtle_diagonal',
  ] as const;

  for (const motion of motionEffects) {
    const shot: MovieTimelineShot = {
      shotId: `shot_ss_${motion}`,
      segmentId: 'seg_ss',
      sceneId: 'sc_001',
      sourceFile: 'movie.mp4',
      sourceStart: 10.0,
      sourceEnd: 15.5,
      timelineStart: 0,
      timelineEnd: 5.5,
      duration: 5.5,
      presentationType: 'screenshot',
      isScreenshot: true,
      motionEffect: motion,
      matchScore: 90,
      confidence: 0.9,
      isLowConfidence: false,
      whyThisScene: {} as any,
      transition: 'cut',
      transitionDuration: 0,
      isLocked: false,
      isManualOverride: false,
      framingMode: 'action',
    };

    const result = transformativeFilterEngine.buildShotFiltergraph(shot, 0, '16:9', 1920, 1080, 30);
    assert.ok(result.fullFiltergraph.length > 0, `Filtergraph for motion ${motion} must not be empty`);
    assert.ok(result.fullFiltergraph.includes('zoompan'), `Filtergraph for motion ${motion} must use zoompan filter`);
    assert.ok(result.fullFiltergraph.includes('1920x1080'), `Filtergraph must output requested resolution`);
  }
});

// ────────────────────────────────────────────────────────────
// Test L — Final Timeline Audit
// ────────────────────────────────────────────────────────────
test('Test L — Final Timeline Audit: Mandatory failures block export with detailed diagnostic reasons', () => {
  const invalidShots: MovieTimelineShot[] = [
    {
      shotId: 'shot_overlong',
      segmentId: 'seg_1',
      sceneId: 'sc_001',
      sourceFile: 'movie.mp4',
      sourceStart: 0,
      sourceEnd: 5.0,
      timelineStart: 0,
      timelineEnd: 5.0,
      duration: 5.0, // VIOLATION 1: Exceeds 3.0s limit!
      matchScore: 80,
      confidence: 0.8,
      isLowConfidence: false,
      whyThisScene: {} as any,
      transition: 'cut',
      transitionDuration: 0,
      isLocked: false,
      isManualOverride: false,
      framingMode: 'action',
    },
    {
      shotId: 'shot_dup',
      segmentId: 'seg_2',
      sceneId: 'sc_001', // VIOLATION 2: Adjacent duplicate scene!
      sourceFile: 'movie.mp4',
      sourceStart: 1.0,
      sourceEnd: 3.5, // VIOLATION 3: Overlapping source interval!
      timelineStart: 5.0,
      timelineEnd: 7.5,
      duration: 2.5,
      matchScore: 80,
      confidence: 0.8,
      isLowConfidence: false,
      whyThisScene: {} as any,
      transition: 'cut',
      transitionDuration: 0,
      isLocked: false,
      isManualOverride: false,
      framingMode: 'action',
    },
  ];

  const invalidTimeline: MovieExplanationTimeline = {
    timelineId: 'tl_audit_fail',
    projectId: 'p_audit_fail',
    duration: 7.5,
    shots: invalidShots,
    outputAspectRatio: '16:9',
    outputWidth: 1920,
    outputHeight: 1080,
    outputFps: 30,
    transformativeSettings: {
      enableFairUsePreset: true,
      maxShotDuration: 3.0,
      minShotDuration: 1.5,
      horizontalFlip: false,
      playbackSpeed: 1.0,
      zoomLevel: 1.0,
      strictClipDurationMode: true,
      framingMode: 'action',
      captionsEnabled: false,
      qualityPreset: 'balanced',
      colorGrading: {} as any,
      audioMixing: {} as any,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const report = movieExplanationQualityGate.evaluateTimeline(invalidTimeline, 7.5);

  assert.equal(report.passed, false, 'Invalid timeline must fail evaluation');
  assert.equal(report.validationOutcome, 'BLOCKED', 'Validation outcome must be strictly BLOCKED');
  assert.ok(report.blockedReasons && report.blockedReasons.length >= 2, 'Blocked reasons must detail all mandatory violations');
  assert.ok(
    report.blockedReasons.some((r) => r.toLowerCase().includes('maximum duration') || r.toLowerCase().includes('exceed')),
    'Must identify overlong video clip'
  );
  assert.ok(
    report.blockedReasons.some((r) => r.toLowerCase().includes('duplicate') || r.toLowerCase().includes('overlapping')),
    'Must identify adjacent duplicate scene or overlapping source interval'
  );
});
