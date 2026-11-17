// ============================================================
// Master Repair Verification Test Suite
// Validates:
// 1. Zero-Point Timeline Alignment (Strict 0.000s start, zero opening black gap)
// 2. Black Slate / Title Card Elimination in Scene Matcher
// 3. Leading Silence Detection & Safe Script Timestamp Adjustment
// 4. Two-Stage Moondream / Vision Analysis (Stage A Tagging & Stage B Verification)
// 5. Opening 120-Second Verification Gate & Sentence-by-Sentence Audit
// 6. Transformative Creative Presets & Neutral Pacing Defaults (1.00x default)
// 7. Render Output Validation (Duration sync, black frame inspection, audio stream)
// ============================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs';
import { voiceoverSilenceService } from '../services/movieExplanation/VoiceoverSilenceService.js';
import { storySceneMatcher } from '../services/movieExplanation/StorySceneMatcher.js';
import { aiDirectorEngine } from '../services/movieExplanation/AIDirectorEngine.js';
import { ollamaVisionService } from '../services/movieExplanation/OllamaVisionService.js';
import { openingVerificationGate } from '../services/movieExplanation/OpeningVerificationGate.js';
import { transformativeFilterEngine } from '../services/movieExplanation/TransformativeFilterEngine.js';
import { movieExplanationQualityGate } from '../services/movieExplanation/MovieExplanationQualityGate.js';
import { movieExplanationRenderer } from '../services/movieExplanation/MovieExplanationRenderer.js';
import type {
  EpisodeIntelligenceIndex,
  EpisodeScene,
  ExplanationScript,
  ExplanationScriptSegment,
  MovieExplanationTimeline,
} from '../../../shared/types.js';

function createMockScenes(): EpisodeScene[] {
  return [
    {
      sceneId: 'sc_black_intro',
      sceneIndex: 0,
      startTime: 0,
      endTime: 4.5,
      duration: 4.5,
      shotBoundaries: [0, 4.5],
      dialogueSnippet: '',
      dialogueText: '',
      characters: [],
      location: 'black screen / studio bumper',
      actions: ['fade from black', 'studio logo blackout'],
      objectsAndEvidence: ['production company title card'],
      events: ['studio intro'],
      emotionalTone: 'neutral',
      narrativePurpose: 'title_or_bumper',
      description: 'Solid black screen preceding the movie intro.',
      visualDetails: ['blackout', 'blank opening'],
      isClueOrReveal: false,
      isQuietMotivational: false,
      isActionHeavy: false,
      importance: 'unnecessary',
      confidence: 0.99,
      thumbnailUrl: '/thumb_black.jpg',
    },
    {
      sceneId: 'sc_detective_rain',
      sceneIndex: 1,
      startTime: 4.5,
      endTime: 45.0,
      duration: 40.5,
      shotBoundaries: [4.5, 20.0, 45.0],
      dialogueSnippet: 'It was raining the night Arthur vanished.',
      dialogueText: 'It was raining the night Arthur vanished.',
      characters: ['Detective Hayes'],
      location: 'rainy city alleyway / neon street',
      actions: ['detective walks in pouring rain holding a lit cigarette'],
      objectsAndEvidence: ['raincoat', 'cigarette', 'revolver'],
      events: ['Detective Hayes arrives at crime scene'],
      emotionalTone: 'dark / gritty noir',
      narrativePurpose: 'opening',
      description: 'Detective Hayes walks slowly down a neon-lit alley in heavy rain.',
      visualDetails: ['rain reflections', 'gritty noir cinematography'],
      isClueOrReveal: false,
      isQuietMotivational: true,
      isActionHeavy: false,
      importance: 'critical',
      confidence: 0.95,
      thumbnailUrl: '/thumb_detective.jpg',
    },
    {
      sceneId: 'sc_flashback_study',
      sceneIndex: 2,
      startTime: 45.0,
      endTime: 110.0,
      duration: 65.0,
      shotBoundaries: [45.0, 75.0, 110.0],
      dialogueSnippet: 'Arthur spent his final hours locked inside the library.',
      dialogueText: 'Arthur spent his final hours locked inside the library.',
      characters: ['Arthur Montgomery'],
      location: 'manor library / mahogany bookshelves',
      actions: ['Arthur frantically burns documents inside the fireplace'],
      objectsAndEvidence: ['burned papers', 'leather journal', 'whiskey glass'],
      events: ['destruction of incriminating evidence'],
      emotionalTone: 'paranoid / urgent',
      narrativePurpose: 'setup',
      description: 'Arthur nervously examines a ledger before throwing letters into the fireplace.',
      visualDetails: ['firelight glow', 'paper ashes'],
      isClueOrReveal: true,
      isQuietMotivational: false,
      isActionHeavy: false,
      importance: 'important',
      confidence: 0.92,
      thumbnailUrl: '/thumb_study.jpg',
    },
    {
      sceneId: 'sc_car_chase_climax',
      sceneIndex: 3,
      startTime: 110.0,
      endTime: 200.0,
      duration: 90.0,
      shotBoundaries: [110.0, 150.0, 200.0],
      dialogueSnippet: 'Stop that car before it reaches the harbor!',
      dialogueText: 'Stop that car before it reaches the harbor!',
      characters: ['Detective Hayes', 'Suspect'],
      location: 'highway overpass',
      actions: ['high-speed pursuit with collision'],
      objectsAndEvidence: ['black sedan', 'police cruiser'],
      events: ['climax pursuit'],
      emotionalTone: 'intense / fast-paced',
      narrativePurpose: 'climax',
      description: 'Police vehicles pursue a speeding sedan across the bridge in broad daylight.',
      visualDetails: ['sparks', 'tire smoke'],
      isClueOrReveal: false,
      isQuietMotivational: false,
      isActionHeavy: true,
      importance: 'critical',
      confidence: 0.96,
      thumbnailUrl: '/thumb_chase.jpg',
    },
  ];
}

function createMockIndex(): EpisodeIntelligenceIndex {
  const scenes = createMockScenes();
  return {
    mediaId: 'ep_test_01',
    originalVideoPath: 'dummy_movie.mp4',
    filename: 'dummy_movie.mp4',
    duration: 3600,
    width: 1920,
    height: 1080,
    fps: 60,
    codec: 'h264',
    audioCodec: 'aac',
    bitrate: 8000000,
    fileSize: 500000000,
    scenes,
    storyMap: {} as any,
    indexedAt: new Date().toISOString(),
  };
}

function createMockScript(): ExplanationScript {
  return {
    rawText: 'Our story begins on a stormy evening as Detective Hayes investigates the mysterious disappearance of Arthur.',
    format: 'plain',
    alignmentConfidence: 0.96,
    isAlignedToVoiceover: true,
    segments: [
      {
        segmentId: 'seg_01',
        text: 'Our story begins on a cold and rainy evening with Detective Hayes arriving on the scene.',
        voiceoverStart: 2.4, // Real voiceover with 2.4s leading pre-roll
        voiceoverEnd: 7.2,
        duration: 4.8,
        sentenceIndex: 0,
        paragraphIndex: 0,
        eventsDescribed: ['Detective Hayes on scene in rain'],
        narrativePurpose: 'opening',
        visualIntent: 'Detective Hayes in rain',
        requiresMultiShot: false,
        targetShotCount: 1,
      },
      {
        segmentId: 'seg_02',
        text: 'Earlier that day, Arthur Montgomery was seen feverishly burning secret ledgers inside his private study.',
        voiceoverStart: 7.2,
        voiceoverEnd: 13.5,
        duration: 6.3,
        sentenceIndex: 1,
        paragraphIndex: 0,
        eventsDescribed: ['Arthur burning documents in study'],
        narrativePurpose: 'setup',
        visualIntent: 'Arthur burning evidence in library',
        requiresMultiShot: true,
        targetShotCount: 2,
      },
      {
        segmentId: 'seg_03',
        text: 'Little did anyone know, an ancient conspiracy was about to erupt into violent conflict.',
        voiceoverStart: 13.5,
        voiceoverEnd: 20.0,
        duration: 6.5,
        sentenceIndex: 2,
        paragraphIndex: 0,
        eventsDescribed: ['Impending conflict'],
        narrativePurpose: 'setup',
        visualIntent: 'Tense atmosphere or city overview',
        requiresMultiShot: false,
        targetShotCount: 1,
      },
    ],
  };
}

// ─────────────────────────────────────────────────────────────
// Test 1: Zero-Point Law & Opening Black Gap Elimination
// ─────────────────────────────────────────────────────────────
test('Master Repair — Zero-Point Law enforces outputShots[0].timelineStart === 0.000s', () => {
  const index = createMockIndex();
  const script = createMockScript();

  // Voiceover starts at 2.4s due to breathing/pre-roll
  assert.equal(script.segments[0].voiceoverStart, 2.4);

  const timeline = aiDirectorEngine.generateTimeline(index, script, '16:9');

  // Strict Zero-Point Law: Output shot 0 must ALWAYS start at 0.000s
  assert.equal(timeline.shots.length > 0, true);
  assert.equal(
    timeline.shots[0].timelineStart,
    0.0,
    'First video frame must strictly begin at output time 0.000s'
  );

  // The shots for segment 0 must extend to cover the pre-roll duration seamlessly
  const seg0Shots = timeline.shots.filter((s) => s.segmentId === 'seg_01');
  assert.equal(seg0Shots[0].timelineStart, 0.0, 'First video frame begins at output 0.000s');
  const seg0End = seg0Shots[seg0Shots.length - 1].timelineEnd;
  assert.equal(seg0End, 7.2, 'Shots for segment 0 span from 0.000s to 7.2s seamlessly');

  // Zero-gap verification: Every subsequent shot must match previous timelineEnd
  for (let i = 1; i < timeline.shots.length; i++) {
    const prev = timeline.shots[i - 1];
    const curr = timeline.shots[i];
    const delta = Math.abs(curr.timelineStart - prev.timelineEnd);
    assert.ok(
      delta < 0.005,
      `Gap detected between shot ${i - 1} and ${i}: delta is ${delta}s`
    );
  }
});

// ─────────────────────────────────────────────────────────────
// Test 2: Black Slate and Title Bumper Exclusion
// ─────────────────────────────────────────────────────────────
test('Master Repair — StorySceneMatcher rejects black screen and studio bumper scenes', () => {
  const index = createMockIndex();
  const script = createMockScript();
  const firstSeg = script.segments[0];

  const candidates = storySceneMatcher.matchCandidatesForSegment(
    firstSeg,
    index,
    script.segments,
    0,
    new Set()
  );

  // Black intro scene must NEVER be selected as the top candidate for sentence 1
  assert.ok(candidates.length > 0);
  assert.notEqual(
    candidates[0].scene.sceneId,
    'sc_black_intro',
    'Black screen intro scene must not be matched as primary footage'
  );

  // Correct scene with Detective Hayes in the rain must be selected
  assert.equal(
    candidates[0].scene.sceneId,
    'sc_detective_rain',
    'Opening scene featuring detective in rain must win match ranking'
  );
  assert.ok(candidates[0].matchScore >= 60, 'Rain detective match score must be confident');
});

// ─────────────────────────────────────────────────────────────
// Test 3: Voiceover Leading Silence Handling & Timestamp Re-Alignment
// ─────────────────────────────────────────────────────────────
test('Master Repair — VoiceoverSilenceService adjusts script timestamps when leading silence is trimmed', () => {
  const script = createMockScript();
  const leadingSilenceOffset = 2.4;

  const adjusted = voiceoverSilenceService.adjustScriptTimestamps(script, leadingSilenceOffset);

  // Segment 0 must now snap to 0.000s
  assert.equal(adjusted.segments[0].voiceoverStart, 0.0);
  assert.equal(Number(adjusted.segments[0].voiceoverEnd.toFixed(3)), 4.8);
  assert.equal(Number(adjusted.segments[1].voiceoverStart.toFixed(3)), 4.8);
  assert.equal(Number(adjusted.segments[1].voiceoverEnd.toFixed(3)), 11.1);

  // Original script timestamps must remain untouched (immutable safety)
  assert.equal(script.segments[0].voiceoverStart, 2.4);
});

// ─────────────────────────────────────────────────────────────
// Test 4: Two-Stage Moondream Vision Analysis
// ─────────────────────────────────────────────────────────────
test('Master Repair — Two-Stage Vision Analysis: Stage A tagging & Stage B candidate verification', async () => {
  // Test Stage A scene description parser
  const sampleFrameA = 'C:\\temp\\dummy_frame_rain.jpg';
  const stageAResult = await ollamaVisionService.analyzeSceneStageA(sampleFrameA);

  assert.ok(stageAResult.observableAction.length > 0, 'Stage A must extract observable action');
  assert.ok(stageAResult.keywords.length > 0, 'Stage A must provide descriptive keywords');
  assert.ok(stageAResult.confidence > 0, 'Stage A must assign confidence score');

  // Test Stage B Candidate Verification
  const narrationBeat = 'Detective Hayes walks through the pouring rain under neon lights.';
  const verification = await ollamaVisionService.verifyCandidateStageB(sampleFrameA, narrationBeat);

  assert.equal(typeof verification.supportsNarration, 'boolean');
  assert.ok(Array.isArray(verification.matchingDetails));
  assert.ok(Array.isArray(verification.contradictions));
  assert.ok(verification.calibratedConfidence >= 0 && verification.calibratedConfidence <= 1.0);
  assert.ok(verification.reason.length > 0, 'Stage B must produce a concise reason');
});

// ─────────────────────────────────────────────────────────────
// Test 5: Opening 120-Second Precision Verification Gate
// ─────────────────────────────────────────────────────────────
test('Master Repair — OpeningVerificationGate produces sentence-by-sentence 120s audit', () => {
  const index = createMockIndex();
  const script = createMockScript();
  const timeline = aiDirectorEngine.generateTimeline(index, script, '16:9');

  const report = openingVerificationGate.verifyOpening(timeline, index, script, 120);

  assert.equal(report.hasInitialBlackGap, false, 'Report must verify Zero-Point Law compliance');
  assert.equal(report.firstFrameTimestamp, 0.0, 'First frame must start at 0.0s');
  assert.equal(report.initialBlackDuration, 0.0, 'Initial black duration must be 0s');
  assert.ok(report.openingDuration > 0, 'Opening duration must be positive');
  assert.ok(report.narrationUnits.length > 0, 'Opening beats must be populated sentence by sentence');

  const firstUnit = report.narrationUnits[0];
  assert.equal(firstUnit.voiceoverStart, 0.0, 'First unit voiceover start must strictly be 0.000s');
  assert.notEqual(firstUnit.selectedShot.sceneId, 'sc_black_intro', 'First unit must not be black intro');
  assert.ok(firstUnit.matchConfidence > 0.5, 'First unit match confidence must be solid');
  assert.ok(firstUnit.candidateAlternatives.length > 0, 'Candidate alternatives must be available');
  assert.equal(report.isReadyForFullExport, true, 'Opening should be ready for full export');
});

// ─────────────────────────────────────────────────────────────
// Test 6: Transformative Editing Presets & Neutral Default
// ─────────────────────────────────────────────────────────────
test('Master Repair — Transformative Engine enforces neutral preset (1.00x, 0% color remap, no flip) by default', () => {
  const dummyShot = {
    shotId: 'sh_01',
    segmentId: 'seg_01',
    sceneId: 'sc_01',
    sourceFile: 'dummy.mp4',
    sourceStart: 10.0,
    sourceEnd: 15.0,
    timelineStart: 0.0,
    timelineEnd: 5.0,
    duration: 5.0,
    matchScore: 90,
    confidence: 0.9,
    whyThisScene: {} as any,
    transition: 'cut' as any,
    transitionDuration: 0,
    isLocked: false,
    isManualOverride: false,
    isLowConfidence: false,
    framingMode: 'action' as const,
  };

  // 1. Explicit Neutral Preset (Default Project Behavior)
  const neutralTransforms = transformativeFilterEngine.buildShotFiltergraph(
    dummyShot,
    0,
    '16:9',
    1920,
    1080,
    60,
    { preset: 'neutral', enableFairUsePreset: false }
  );

  assert.equal(neutralTransforms.speedShift, 1.0, 'Neutral preset must strictly run at 1.00x speed');
  assert.equal(neutralTransforms.isMirrored, false, 'Neutral preset must never flip video');
  assert.equal(neutralTransforms.colorGradeName, 'neutral', 'Neutral preset must use neutral color profile');
  assert.ok(neutralTransforms.fullFiltergraph.includes('setpts=PTS-STARTPTS'), 'Must reset PTS to zero strictly');
  assert.ok(!neutralTransforms.fullFiltergraph.includes('hflip'), 'Filtergraph must not contain hflip');

  // 2. Creative Preset: Subtle Cinema
  const cinemaTransforms = transformativeFilterEngine.buildShotFiltergraph(
    dummyShot,
    0,
    '16:9',
    1920,
    1080,
    60,
    { preset: 'subtle_cinema' }
  );
  assert.equal(cinemaTransforms.colorGradeName, 'subtle_cinema');
  assert.ok(cinemaTransforms.fullFiltergraph.includes('eq=contrast=1.04'));

  // 3. Creative Preset: Vibrant Commentary
  const vibrantTransforms = transformativeFilterEngine.buildShotFiltergraph(
    dummyShot,
    0,
    '16:9',
    1920,
    1080,
    60,
    { preset: 'vibrant_commentary' }
  );
  assert.equal(vibrantTransforms.colorGradeName, 'vibrant_commentary');
  assert.ok(vibrantTransforms.fullFiltergraph.includes('saturation=1.12'));
});

// ─────────────────────────────────────────────────────────────
// Test 7: Output Validation Functionality
// ─────────────────────────────────────────────────────────────
test('Master Repair — validateRenderedOutput validates stream integrity and opening luminance', async () => {
  const dummyTimeline: MovieExplanationTimeline = {
    timelineId: 'tl_dummy',
    projectId: 'p_dummy',
    duration: 10.0,
    outputAspectRatio: '16:9',
    outputWidth: 1920,
    outputHeight: 1080,
    outputFps: 60,
    shots: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Test validation on dummy invalid path
  const nonExistentPath = 'C:\\temp\\non_existent_export.mp4';
  const failResult = await movieExplanationRenderer.validateRenderedOutput(nonExistentPath, 10.0, dummyTimeline);

  assert.equal(failResult.isValid, false);
  assert.ok(failResult.issues.some((iss) => iss.toLowerCase().includes('missing')));
});
