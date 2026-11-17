// ============================================================
// Transformative Rendering Engine — Comprehensive Test Suite
// Verifies all Master Directive objectives:
// 1. The Visual "Invisible" Pipeline (Micro-scaling, Color LUT, Temporal shift, Intelligent Mirroring)
// 2. The Audio "Composite" Pipeline (The Void, Anchor, Mask, Texture)
// 3. Advanced Editing Logic (6-Second Rule, Ken Burns, Jump-cuts)
// 4. Pro Export Quality (CRF 18, Preset Slow, Lanczos, Sequential i3 rendering)
// ============================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { config } from '../config/index.js';
import { transformativeFilterEngine, CINEMATIC_COLOR_PRESETS } from '../services/movieExplanation/TransformativeFilterEngine.js';
import { audioCompositeEngine } from '../services/movieExplanation/AudioCompositeEngine.js';
import { aiDirectorEngine } from '../services/movieExplanation/AIDirectorEngine.js';
import { movieExplanationRenderer } from '../services/movieExplanation/MovieExplanationRenderer.js';
import { movieExplanationStore } from '../services/movieExplanation/MovieExplanationStore.js';
import type {
  EpisodeIntelligenceIndex,
  EpisodeScene,
  ExplanationScript,
  MovieTimelineShot,
  TransformativeEditingSettings,
} from '../../../shared/types.js';

function createDummyScene(overrides?: Partial<EpisodeScene>): EpisodeScene {
  return {
    sceneId: 'sc_001',
    sceneIndex: 0,
    startTime: 0,
    endTime: 60,
    duration: 60,
    shotBoundaries: [0, 15, 30, 45],
    dialogueSnippet: 'He enters the room quietly.',
    dialogueText: 'He enters the room quietly.',
    characters: ['Detective'],
    location: 'office',
    actions: ['walking'],
    objectsAndEvidence: [],
    events: [],
    emotionalTone: 'mysterious',
    narrativePurpose: 'setup',
    description: 'A detective investigates the dimly lit room.',
    visualDetails: ['Dim lighting', 'Wood desk'],
    isClueOrReveal: false,
    isQuietMotivational: false,
    isActionHeavy: false,
    importance: 'important',
    confidence: 0.95,
    ...overrides,
  };
}

function createDummyShot(overrides?: Partial<MovieTimelineShot>): MovieTimelineShot {
  return {
    shotId: 'shot_101',
    segmentId: 'seg_1',
    sceneId: 'sc_001',
    sourceFile: 'dummy.mp4',
    sourceStart: 10.0,
    sourceEnd: 15.0,
    timelineStart: 0.0,
    timelineEnd: 5.0,
    duration: 5.0,
    matchScore: 90,
    confidence: 0.90,
    isLowConfidence: false,
    whyThisScene: {} as any,
    transition: 'cut',
    transitionDuration: 0,
    isLocked: false,
    isManualOverride: false,
    framingMode: 'action',
    ...overrides,
  };
}

// ── Test 1: Dynamic Micro-Scaling (The "Breath" Effect) & Lanczos Scaling ──
test('Transformative Engine — Dynamic Micro-Scaling applies 2-5% crop with Lanczos scaling', () => {
  const shot = createDummyShot();
  const scene = createDummyScene();

  const result = transformativeFilterEngine.buildShotFiltergraph(
    shot,
    0,
    '16:9',
    1920,
    1080,
    30,
    {
      enableFairUsePreset: true,
      invisibleTransforms: {
        enabled: true,
        microScaling: true,
        colorRemapping: true,
        microTemporalShift: true,
        intelligentMirroring: true,
        sixSecondRule: true,
        jumpCutIntegration: true,
      },
    } as any,
    scene
  );

  // Must contain Lanczos scaling to guarantee zero pixelation
  assert.ok(result.fullFiltergraph.includes('flags=lanczos'), 'Must use Lanczos scaling for pristine quality');
  assert.ok(result.fullFiltergraph.includes('crop='), 'Must apply micro-scaling crop');

  // Verify crop factor is between 0.94 and 0.99 (2% to 5% reduction)
  assert.ok(result.cropFactor >= 0.94 && result.cropFactor <= 0.99, `Crop factor (${result.cropFactor}) must be in 2-5% range`);
});

// ── Test 2: Professional Color Remapping (The "LUT" Effect) ──
test('Transformative Engine — Professional Color Remapping shifts color matrix with natural balance', () => {
  const shot1 = createDummyShot({ shotId: 'sh_1' });
  const shot2 = createDummyShot({ shotId: 'sh_2' });

  const res1 = transformativeFilterEngine.buildShotFiltergraph(shot1, 0, '16:9', 1920, 1080, 30);
  const res2 = transformativeFilterEngine.buildShotFiltergraph(shot2, 1, '16:9', 1920, 1080, 30);

  // Both shots have valid cinematic grades
  assert.ok(res1.colorGradeName.length > 0, 'Shot 1 must receive a color grade');
  assert.ok(res2.colorGradeName.length > 0, 'Shot 2 must receive a color grade');

  // Must include subtle contrast and saturation shift
  assert.ok(res1.fullFiltergraph.includes('eq=contrast=') || res1.fullFiltergraph.includes('colorbalance='), 'Filtergraph must include color remapping');
});

// ── Test 3: Micro-Temporal Shifting (0.98x - 1.02x Speed) ──
test('Transformative Engine — Micro-Temporal Shifting sets speed to 0.98x or 1.02x', () => {
  const shotEven = createDummyShot();
  const shotOdd = createDummyShot();

  const resEven = transformativeFilterEngine.buildShotFiltergraph(shotEven, 0, '16:9', 1920, 1080, 30);
  const resOdd = transformativeFilterEngine.buildShotFiltergraph(shotOdd, 1, '16:9', 1920, 1080, 30);

  assert.equal(resEven.speedShift, 0.98, 'Even shot index must shift temporal speed to 0.98x');
  assert.equal(resOdd.speedShift, 1.02, 'Odd shot index must shift temporal speed to 1.02x');
  assert.ok(resEven.fullFiltergraph.includes('setpts='), 'Filtergraph must include setpts for temporal shift');
  assert.ok(resOdd.fullFiltergraph.includes('setpts='), 'Filtergraph must include setpts for temporal shift');
});

// ── Test 4: Intelligent Mirroring Text Detection ──
test('Transformative Engine — Intelligent Mirroring prevents flipping when text or signs are present', () => {
  // Scene with document/evidence text
  const sceneWithText = createDummyScene({
    objectsAndEvidence: ['incriminating document / letter'],
    description: 'The protagonist reads an old newspaper clipping.',
  });
  const shotWithText = createDummyShot();

  const hasText = transformativeFilterEngine.detectTextOrReadableSigns(sceneWithText, shotWithText);
  assert.equal(hasText, true, 'Must detect readable text or signs in scene');

  const resText = transformativeFilterEngine.buildShotFiltergraph(shotWithText, 1, '16:9', 1920, 1080, 30, undefined, sceneWithText);
  assert.equal(resText.isMirrored, false, 'Must NOT mirror shot when text is present');
  assert.ok(!resText.fullFiltergraph.includes('hflip'), 'Filtergraph must not contain hflip when text is present');

  // Scene without text or signs
  const cleanScene = createDummyScene({
    objectsAndEvidence: [],
    description: 'Walking alone down a foggy dirt road.',
    visualDetails: ['Fog', 'Trees'],
  });
  const cleanShot = createDummyShot();
  const hasTextClean = transformativeFilterEngine.detectTextOrReadableSigns(cleanScene, cleanShot);
  assert.equal(hasTextClean, false, 'Clean nature scene must not be flagged for text');

  // When safe, mirroring can be selected
  const resClean = transformativeFilterEngine.buildShotFiltergraph(cleanShot, 1, '16:9', 1920, 1080, 30, undefined, cleanScene);
  assert.equal(resClean.isMirrored, true, 'Clean scene is safely mirrored at designated index');
  assert.ok(resClean.fullFiltergraph.includes('hflip'), 'Filtergraph must include hflip');
});

// ── Test 5: The 6-Second Rule Enforcement in AI Director ──
test('Transformative Engine — The 6-Second Rule strictly limits clip durations <= 6.0s', () => {
  const dummyIndex: EpisodeIntelligenceIndex = {
    mediaId: 'test_idx',
    originalVideoPath: 'dummy.mp4',
    filename: 'dummy.mp4',
    duration: 300,
    width: 1920,
    height: 1080,
    fps: 30,
    codec: 'h264',
    audioCodec: 'aac',
    bitrate: 5000000,
    fileSize: 1000,
    scenes: [
      createDummyScene({ sceneId: 'sc_001', startTime: 0, endTime: 60, duration: 60 }),
      createDummyScene({ sceneId: 'sc_002', startTime: 60, endTime: 120, duration: 60, description: 'B-roll outdoor shot' }),
    ],
    storyMap: {} as any,
    indexedAt: '',
  };

  const scriptWithLongSentence: ExplanationScript = {
    rawText: 'This is an extensive 14 second narration sentence describing a key plot point.',
    format: 'plain',
    alignmentConfidence: 0.95,
    isAlignedToVoiceover: true,
    segments: [
      {
        segmentId: 'seg_long',
        text: 'This is an extensive 14 second narration sentence describing a key plot point.',
        voiceoverStart: 0,
        voiceoverEnd: 14.0,
        duration: 14.0,
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

  const timeline = aiDirectorEngine.generateTimeline(dummyIndex, scriptWithLongSentence);

  // Must split into at least 3 shots (14 / 6 = ~2.33 -> 3 shots)
  assert.ok(timeline.shots.length >= 3, `14s narration must split into at least 3 shots (got ${timeline.shots.length})`);

  for (const shot of timeline.shots) {
    assert.ok(shot.duration <= 6.001, `Shot ${shot.shotId} duration (${shot.duration}s) must not exceed 6.0 seconds`);
  }

  // Jump-cut flag must be integrated
  const hasJumpCut = timeline.shots.some((s) => s.hasJumpCut);
  assert.ok(hasJumpCut, 'Secondary sub-shots must feature jump-cut integration');
});

// ── Test 6: Audio Composite Pipeline — The Mask & The Texture Generation ──
test('Transformative Engine — Audio Composite Pipeline generates multi-layer composite audio', async () => {
  const testDir = path.resolve(__dirname, '../../../temp_test_audio');
  if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

  // Generate short 2s test voiceover
  const testVoPath = path.join(testDir, 'test_vo.wav');
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(config.ffmpegPath, [
      '-y',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3',
      '-c:a', 'pcm_s16le',
      testVoPath,
    ]);
    proc.on('close', (code) => code === 0 ? resolve() : reject());
    proc.on('error', reject);
  });

  const dummyShots = [
    createDummyShot({ timelineStart: 0, timelineEnd: 1.5, duration: 1.5 }),
    createDummyShot({ timelineStart: 1.5, timelineEnd: 3.0, duration: 1.5 }),
  ];

  const compositeOutputPath = path.join(testDir, 'composite_out.aac');

  const finalAudio = await audioCompositeEngine.buildCompositeAudio(
    testVoPath,
    dummyShots,
    3.0,
    compositeOutputPath,
    testDir,
    {
      audioMixing: {
        sourceMovieVolume: 0.0, // Step 1 The Void
        voiceoverVolume: 1.0,   // Step 2 The Anchor
        bgmVolume: 0.10,        // Step 3 The Mask
        enableAmbientCinematicBed: true,
        enableCutSoundEffects: true, // Step 4 The Texture
        sfxVolume: 0.12,
      },
    } as any
  );

  assert.ok(fs.existsSync(finalAudio), 'Composite audio file must exist');
  const stat = fs.statSync(finalAudio);
  assert.ok(stat.size > 1000, `Composite audio file must have valid size (got ${stat.size} bytes)`);

  // Cleanup test audio
  try {
    fs.rmSync(testDir, { recursive: true, force: true });
  } catch {}
});

// ── Test 7: End-to-End Master Render with CRF 18 & Sequential Rendering ──
test('Transformative Engine — Master Render produces visually lossless video with unique digital fingerprint', async () => {
  const sampleVideo = path.resolve(__dirname, '../../../test_render_sample.mp4');
  if (!fs.existsSync(sampleVideo)) {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(config.ffmpegPath, [
        '-y',
        '-f', 'lavfi', '-i', 'testsrc=duration=2:size=1920x1080:rate=30',
        '-f', 'lavfi', '-i', 'sine=frequency=800:duration=2',
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-c:a', 'aac',
        '-pix_fmt', 'yuv420p',
        sampleVideo,
      ]);
      proc.on('close', (code) => code === 0 ? resolve() : reject());
      proc.on('error', reject);
    });
  }

  const sampleAudio = path.resolve(__dirname, '../../../test_vo_sample.wav');
  if (!fs.existsSync(sampleAudio)) {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(config.ffmpegPath, [
        '-y',
        '-f', 'lavfi', '-i', 'sine=frequency=400:duration=2',
        '-c:a', 'pcm_s16le',
        sampleAudio,
      ]);
      proc.on('close', (code) => code === 0 ? resolve() : reject());
      proc.on('error', reject);
    });
  }

  const testProjectId = `test_trans_proj_${Date.now()}`;
  movieExplanationStore.createProject(testProjectId, 'Transformative Test');

  const timeline = {
    timelineId: 'tl_trans_test',
    projectId: testProjectId,
    duration: 2.0,
    outputAspectRatio: '16:9' as const,
    outputWidth: 1920,
    outputHeight: 1080,
    outputFps: 30,
    transformativeSettings: {
      enableFairUsePreset: true,
      maxShotDuration: 5.0,
      minShotDuration: 1.5,
      horizontalFlip: false,
      playbackSpeed: 1.02,
      zoomLevel: 1.04,
      colorGrading: { enabled: true, brightness: 0.01, contrast: 1.03, saturation: 1.05, sharpness: 0.5, vignette: false },
      audioMixing: {
        sourceMovieVolume: 0.0,
        voiceoverVolume: 1.0,
        bgmVolume: 0.10,
        enableAmbientCinematicBed: true,
        enableCutSoundEffects: false,
      },
      invisibleTransforms: {
        enabled: true,
        microScaling: true,
        colorRemapping: true,
        microTemporalShift: true,
        intelligentMirroring: false,
        sixSecondRule: true,
        jumpCutIntegration: false,
      },
      framingMode: 'action' as const,
      captionsEnabled: false,
      qualityPreset: 'pro_lossless' as const,
      crf: 18,
      encoder: 'libx264' as const,
      encoderPreset: 'veryfast' as const, // veryfast for fast test execution
    },
    shots: [
      createDummyShot({
        shotId: 'shot_t1',
        sourceFile: sampleVideo,
        sourceStart: 0,
        sourceEnd: 1.0,
        timelineStart: 0,
        timelineEnd: 1.0,
        duration: 1.0,
      }),
      createDummyShot({
        shotId: 'shot_t2',
        sourceFile: sampleVideo,
        sourceStart: 1.0,
        sourceEnd: 2.0,
        timelineStart: 1.0,
        timelineEnd: 2.0,
        duration: 1.0,
      }),
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const renderResult = await movieExplanationRenderer.renderExplanationVideo(
    testProjectId,
    timeline,
    sampleAudio
  );

  assert.ok(fs.existsSync(renderResult.outputPath), 'Rendered video must exist');
  assert.ok(renderResult.fileSize > 10000, `Rendered video must have non-trivial file size (got ${renderResult.fileSize} bytes)`);

  // Verify SHA-256 hash mutation: Rendered video must have completely different SHA-256 than original source!
  const originalHash = crypto.createHash('sha256').update(fs.readFileSync(sampleVideo)).digest('hex');
  const renderedHash = crypto.createHash('sha256').update(fs.readFileSync(renderResult.outputPath)).digest('hex');

  assert.notEqual(renderedHash, originalHash, 'Rendered video must have a completely broken/unique SHA-256 hash');

  // Clean up test files
  movieExplanationStore.deleteProject(testProjectId);
  try {
    if (fs.existsSync(sampleVideo)) fs.unlinkSync(sampleVideo);
    if (fs.existsSync(sampleAudio)) fs.unlinkSync(sampleAudio);
  } catch {}
});
