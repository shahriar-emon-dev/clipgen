// ============================================================
// Voiceover Production Workflow — Comprehensive Test Suite
// Verifies Narration Intelligence, Semantic Matching, Pacing,
// Locked Segments, Original Quality Preservation, & Quality Gate.
// ============================================================

import test from 'node:test';
import assert from 'node:assert';
import { VoiceoverAnalyzer } from '../services/voiceover/VoiceoverAnalyzer.js';
import { PacingEngine } from '../services/voiceover/PacingEngine.js';
import { SemanticVisualMatcher } from '../services/voiceover/SemanticVisualMatcher.js';
import { AIDirector } from '../services/voiceover/AIDirector.js';
import { VoiceoverQualityGate } from '../services/voiceover/VoiceoverQualityGate.js';
import { VoiceoverStore } from '../services/voiceover/VoiceoverStore.js';
import type {
  NarrationSegment,
  FootageAsset,
  VisualFootageIndex,
  VoiceoverTimeline,
  TranscriptSegment,
} from '../../../shared/types.js';

test('Voiceover Production — Narration Intelligence & Multi-Domain Understanding', async () => {
  const analyzer = new VoiceoverAnalyzer();

  // Test across multiple domains: Documentary, Travel, Business, Sports
  const sentences = [
    "In the heart of Tokyo, the neon lights never sleep.",
    "However, high up in the quiet temples, an ancient stillness remains.",
    "Meanwhile, across Wall Street, traders watched the market plunge in disbelief.",
    "Suddenly, Messi accelerated past two defenders and struck the ball into the top corner.",
  ];

  let curT = 0;
  const sentenceSegments: TranscriptSegment[] = sentences.map((st, i) => {
    const dur = 4.0;
    const start = curT;
    const end = curT + dur;
    curT = end;
    return {
      id: `sent_${i}`,
      transcriptId: 'tx_1',
      startTime: start,
      endTime: end,
      text: st,
      confidence: 0.98,
    };
  });

  // Test sentence segmentation
  const segments = analyzer.segmentNarration(sentenceSegments, curT);
  assert.strictEqual(segments.length, 4);

  // Apply deterministic semantics to each segment
  for (let i = 0; i < segments.length; i++) {
    analyzer.applyDeterministicSemantics(segments[i], segments[i - 1], segments[i + 1]);
  }

  // Test Tokyo location detection
  const tokyoSeg = segments[0];
  assert.strictEqual(tokyoSeg.location, 'tokyo');

  // Test contrast detection on sentence with "However"
  const contrastSeg = segments.find(s => s.text.toLowerCase().includes('however'));
  assert.ok(contrastSeg, 'Should identify segment containing contrast keyword');
  assert.strictEqual(contrastSeg?.hasContrast, true);
  assert.strictEqual(contrastSeg?.contrastWord, 'however');
  assert.strictEqual(contrastSeg?.narrativePurpose, 'contrast');

  // Test Wall Street entity / business context
  const bizSeg = segments.find(s => s.text.toLowerCase().includes('wall street'));
  assert.ok(bizSeg, 'Should identify business segment');
  assert.ok(bizSeg?.entities.some(e => e.includes('Wall Street')));

  // Test sports entity & action detection
  const sportsSeg = segments.find(s => s.text.toLowerCase().includes('messi'));
  assert.ok(sportsSeg, 'Should identify sports segment');
  assert.ok(sportsSeg?.entities.some(e => e.includes('Messi')));
});

test('Voiceover Production — Pacing Engine splits long sentences into multiple shots', () => {
  const pacing = new PacingEngine();

  const longSegment: NarrationSegment = {
    segmentId: 'seg_long',
    start: 0,
    end: 12.0,
    duration: 12.0,
    text: "The vast alpine mountains stretched endlessly toward the horizon, while the glacial river carved through the ancient granite canyon below.",
    sentenceIndex: 0,
    paragraphIndex: 0,
    type: 'sentence',
    entities: [],
    visualConcepts: ['mountain', 'river'],
    narrativePurpose: 'establishing_shot',
    visualPriority: 'high',
    storyImportance: 80,
  };

  const plan = pacing.planSegmentShots(longSegment, null, 'balanced');

  // A 12-second narration sentence should be cut into at least 2 shots to maintain visual engagement
  assert.ok(plan.length >= 2, `Expected at least 2 shots for 12s segment, got ${plan.length}`);

  // Sum of shot durations should equal segment duration exactly
  const totalPlannedDur = plan.reduce((sum, p) => sum + p.duration, 0);
  assert.ok(
    Math.abs(totalPlannedDur - longSegment.duration) < 0.05,
    `Planned duration (${totalPlannedDur}) should match segment duration (${longSegment.duration})`
  );
});

test('Voiceover Production — Semantic Visual Matcher & Confidence Scoring', () => {
  const matcher = new SemanticVisualMatcher();

  const testClips: FootageAsset[] = [
    {
      clipId: 'clip_mountain_drone',
      projectId: 'proj_test',
      originalFilename: 'swiss_alps_4k.mp4',
      filename: 'swiss_alps_4k.mp4',
      sourceFile: 'C:/media/swiss_alps_4k.mp4',
      fileSize: 45000000,
      duration: 20.0,
      width: 3840,
      height: 2160,
      fps: 60,
      codec: 'h264',
      visualSegments: [
        {
          subSegmentId: 'sub_1',
          clipId: 'clip_mountain_drone',
          start: 0,
          end: 8.0,
          duration: 8.0,
          subjects: ['mountain', 'snow', 'alps'],
          actions: [],
          environment: ['mountain'],
          shotCharacteristics: ['wide shot', 'aerial', 'drone'],
          semanticConcepts: ['nature', 'landscape'],
          motionIntensity: 40,
        },
      ],
      visualTags: ['mountain', 'snow', 'alps'],
      qualityScore: 95,
      usageCount: 0,
      matchCount: 0,
      analysisStatus: 'analyzed',
      createdAt: new Date().toISOString(),
    },
    {
      clipId: 'clip_city_traffic',
      projectId: 'proj_test',
      originalFilename: 'tokyo_night.mp4',
      filename: 'tokyo_night.mp4',
      sourceFile: 'C:/media/tokyo_night.mp4',
      fileSize: 32000000,
      duration: 15.0,
      width: 1920,
      height: 1080,
      fps: 30,
      codec: 'h264',
      visualSegments: [
        {
          subSegmentId: 'sub_2',
          clipId: 'clip_city_traffic',
          start: 0,
          end: 6.0,
          duration: 6.0,
          subjects: ['city', 'traffic', 'car'],
          actions: ['driving'],
          environment: ['city', 'street'],
          shotCharacteristics: ['night', 'traffic'],
          semanticConcepts: ['urban', 'speed'],
          motionIntensity: 75,
        },
      ],
      visualTags: ['city', 'night'],
      qualityScore: 90,
      usageCount: 0,
      matchCount: 0,
      analysisStatus: 'analyzed',
      createdAt: new Date().toISOString(),
    },
  ];

  const index: VisualFootageIndex = {
    projectId: 'proj_test',
    totalClips: 2,
    totalDuration: 35.0,
    totalSegments: 2,
    clips: testClips,
    indexedAt: new Date().toISOString(),
  };

  const segment: NarrationSegment = {
    segmentId: 'seg_mountains',
    start: 0,
    end: 5.0,
    duration: 5.0,
    text: "The snow-covered alpine mountain range stood majestic in the sunlight.",
    sentenceIndex: 0,
    paragraphIndex: 0,
    type: 'sentence',
    entities: [],
    visualConcepts: ['mountain', 'snow', 'nature'],
    location: 'mountain',
    narrativePurpose: 'establishing_shot',
    visualPriority: 'high',
    storyImportance: 75,
  };

  const candidates = matcher.findBestCandidates(
    segment,
    index,
    {
      mode: 'balanced',
      clipUsageCount: new Map(),
      lastUsedTimestamp: new Map(),
      currentTimelineTime: 0,
    },
    5.0
  );

  assert.ok(candidates.length > 0, 'Should find candidates');
  const topCandidate = candidates[0];
  assert.strictEqual(topCandidate.clipId, 'clip_mountain_drone', 'Alps footage should match mountain narration');
  assert.ok(topCandidate.score.overallScore >= 75, `Expected score >= 75, got ${topCandidate.score.overallScore}`);
  assert.strictEqual(topCandidate.isLowConfidence, false);
  assert.ok(topCandidate.reasons.length > 0, 'Should provide explainable reasoning tags');
});

test('Voiceover Production — AI Director & Locked Shots Preservation (🔒)', () => {
  const director = new AIDirector();

  const testClips: FootageAsset[] = [
    {
      clipId: 'clip_a',
      projectId: 'proj_1',
      originalFilename: 'ocean.mp4',
      filename: 'ocean.mp4',
      sourceFile: 'C:/test/ocean.mp4',
      fileSize: 1000,
      duration: 10,
      width: 1920,
      height: 1080,
      fps: 30,
      codec: 'h264',
      visualSegments: [
        {
          subSegmentId: 's1',
          clipId: 'clip_a',
          start: 0,
          end: 5,
          duration: 5,
          subjects: ['water', 'ocean'],
          actions: ['waves'],
          environment: ['ocean', 'beach'],
          shotCharacteristics: ['wide shot'],
          semanticConcepts: ['nature'],
          motionIntensity: 30,
        },
      ],
      visualTags: ['ocean'],
      qualityScore: 90,
      usageCount: 0,
      matchCount: 0,
      analysisStatus: 'analyzed',
      createdAt: new Date().toISOString(),
    },
    {
      clipId: 'clip_b',
      projectId: 'proj_1',
      originalFilename: 'forest.mp4',
      filename: 'forest.mp4',
      sourceFile: 'C:/test/forest.mp4',
      fileSize: 1000,
      duration: 10,
      width: 1920,
      height: 1080,
      fps: 30,
      codec: 'h264',
      visualSegments: [
        {
          subSegmentId: 's2',
          clipId: 'clip_b',
          start: 0,
          end: 5,
          duration: 5,
          subjects: ['trees', 'forest'],
          actions: [],
          environment: ['forest'],
          shotCharacteristics: ['wide shot'],
          semanticConcepts: ['nature'],
          motionIntensity: 20,
        },
      ],
      visualTags: ['forest'],
      qualityScore: 90,
      usageCount: 0,
      matchCount: 0,
      analysisStatus: 'analyzed',
      createdAt: new Date().toISOString(),
    },
  ];

  const index: VisualFootageIndex = {
    projectId: 'proj_1',
    totalClips: 2,
    totalDuration: 20,
    totalSegments: 2,
    clips: testClips,
    indexedAt: new Date().toISOString(),
  };

  const segments: NarrationSegment[] = [
    {
      segmentId: 'seg_1',
      start: 0,
      end: 4.0,
      duration: 4.0,
      text: 'First look at the ocean waves.',
      sentenceIndex: 0,
      paragraphIndex: 0,
      type: 'sentence',
      entities: [],
      visualConcepts: ['ocean'],
      location: 'ocean',
      narrativePurpose: 'establishing_shot',
      visualPriority: 'high',
      storyImportance: 60,
    },
    {
      segmentId: 'seg_2',
      start: 4.0,
      end: 8.0,
      duration: 4.0,
      text: 'Then walk into the deep forest.',
      sentenceIndex: 1,
      paragraphIndex: 0,
      type: 'sentence',
      entities: [],
      visualConcepts: ['forest'],
      location: 'forest',
      narrativePurpose: 'explanation',
      visualPriority: 'medium',
      storyImportance: 50,
    },
  ];

  // 1. Generate initial timeline
  const initialTimeline = director.generateTimeline('proj_1', 'voice_1', segments, index, 8.0);
  assert.strictEqual(initialTimeline.segments.length, 2);

  // 2. User manually locks shot in segment 1 (🔒)
  const shotToLock = initialTimeline.segments[0].shots[0];
  shotToLock.isLocked = true;
  shotToLock.clipId = 'clip_manual_choice';
  shotToLock.clipFilename = 'manual_choice.mp4';

  // 3. Regenerate timeline passing existingTimeline
  const regeneratedTimeline = director.generateTimeline('proj_1', 'voice_1', segments, index, 8.0, {
    existingTimeline: initialTimeline,
  });

  // Verify the locked shot remained 100% intact!
  const preservedShot = regeneratedTimeline.segments[0].shots[0];
  assert.strictEqual(preservedShot.clipId, 'clip_manual_choice', 'Locked shot must be preserved during regeneration');
  assert.strictEqual(preservedShot.isLocked, true);
});

test('Voiceover Production — Quality Gate & Original Resolution Preservation', () => {
  const qualityGate = new VoiceoverQualityGate();

  // Test 4K footage asset
  const clips: FootageAsset[] = [
    {
      clipId: 'c1',
      projectId: 'p1',
      originalFilename: 'cinematic_4k.mp4',
      filename: 'cinematic_4k.mp4',
      sourceFile: process.cwd(), // file exists
      fileSize: 10000,
      duration: 20,
      width: 3840,
      height: 2160,
      fps: 60,
      codec: 'h264',
      visualSegments: [],
      visualTags: [],
      qualityScore: 98,
      usageCount: 1,
      matchCount: 1,
      analysisStatus: 'analyzed',
      createdAt: new Date().toISOString(),
    },
  ];

  const timeline: VoiceoverTimeline = {
    timelineId: 't1',
    projectId: 'p1',
    voiceoverId: 'v1',
    duration: 10,
    matchingMode: 'balanced',
    outputAspectRatio: '16:9',
    outputWidth: 3840, // Preserved 4K resolution!
    outputHeight: 2160,
    outputFps: 60,     // Preserved 60 FPS!
    captionsEnabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    segments: [
      {
        segmentId: 's1',
        voiceStart: 0,
        voiceEnd: 10,
        duration: 10,
        text: 'The landscape in ultra high definition.',
        narrativePurpose: 'establishing_shot',
        shots: [
          {
            shotId: 'sh1',
            clipId: 'c1',
            clipFilename: 'cinematic_4k.mp4',
            sourceFile: process.cwd(),
            sourceStart: 0,
            sourceEnd: 10,
            timelineStart: 0,
            timelineEnd: 10,
            duration: 10,
            matchScore: 92,
            confidence: 0.92,
            isLowConfidence: false,
            reasons: ['Semantic match: landscape', 'High resolution (4K)'],
            transition: 'cut',
            transitionDuration: 0,
            isLocked: false,
            isManualOverride: false,
            framingMode: 'center',
          },
        ],
      },
    ],
  };

  const report = qualityGate.evaluateTimeline(timeline, clips, 10.0);

  assert.strictEqual(report.passed, true);
  assert.strictEqual(report.sourceResolutionPreserved, true);
  assert.strictEqual(report.sourceFpsPreserved, true);
  assert.ok(report.productionReadinessScore >= 95, `Expected score >= 95, got ${report.productionReadinessScore}`);

  const resCheck = report.checks.find(c => c.id === 'resolution_preservation');
  assert.strictEqual(resCheck?.status, 'pass');
});

test('Voiceover Production — VoiceoverStore ACID Persistence', () => {
  const store = new VoiceoverStore();
  const testId = `test_vo_${Date.now()}`;

  const created = store.createProject(testId);
  assert.strictEqual(created.projectId, testId);
  assert.strictEqual(created.status, 'setup');

  store.updateProject(testId, {
    status: 'timeline_ready',
    renderProgress: 50,
  });

  const reloaded = store.getProject(testId);
  assert.strictEqual(reloaded?.status, 'timeline_ready');
  assert.strictEqual(reloaded?.renderProgress, 50);

  // Clean up
  const deleted = store.deleteProject(testId);
  assert.strictEqual(deleted, true);
  assert.strictEqual(store.getProject(testId), null);
});
