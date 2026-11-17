// ============================================================
// Timeline Engine Master Upgrade Verification
// Tests for:
// 1. Long-timeline duplicate scene elimination (fixing 00:03:09:18 looping bug)
// 2. Strict 3.0s minimum clip duration enforcement without micro-clips
// 3. Subtitle timing decoupling from visual shot boundaries with Bengali Unicode
// 4. Match status attribution ('matched', 'needs_review', 'unmatched')
// 5. DuplicateSceneReport and remediation pipeline
// 6. AIDirectorReviewStage audit for sub-3s clips and duplicate footage
// ============================================================

import test from 'node:test';
import assert from 'node:assert';
import { aiDirectorEngine } from '../services/movieExplanation/AIDirectorEngine.js';
import { aiDirectorReviewStage } from '../services/movieExplanation/AIDirectorReviewStage.js';
import { movieExplanationQualityGate } from '../services/movieExplanation/MovieExplanationQualityGate.js';
import type {
  EpisodeIntelligenceIndex,
  EpisodeScene,
  ExplanationScript,
  ExplanationScriptSegment,
  MovieTimelineShot,
} from '../../../shared/types.js';

function makeMockScene(id: string, start: number, end: number, overrides: Partial<EpisodeScene> = {}): EpisodeScene {
  return {
    sceneId: id,
    sceneIndex: 0,
    startTime: start,
    endTime: end,
    duration: end - start,
    shotBoundaries: [start, end],
    description: `Scene ${id} description`,
    actions: ['action'],
    characters: ['Protagonist'],
    emotionalTone: 'neutral',
    location: 'city_street',
    dialogueSnippet: '',
    objectsAndEvidence: [],
    events: [],
    visualDetails: [],
    thumbnailUrl: `/api/files/movie_explanation/proj_test/thumbnails/${id}_thumb.jpg`,
    narrativePurpose: 'investigation',
    importance: 'important',
    confidence: 0.9,
    isActionHeavy: false,
    isQuietMotivational: false,
    isClueOrReveal: false,
    ...overrides,
  };
}

function makeMockIndex(scenes: EpisodeScene[], duration: number = 1200): EpisodeIntelligenceIndex {
  return {
    mediaId: 'proj_test_long',
    originalVideoPath: 'E:/movies/long_movie.mp4',
    filename: 'long_movie.mp4',
    duration,
    width: 1920,
    height: 1080,
    fps: 24,
    codec: 'h264',
    audioCodec: 'aac',
    bitrate: 5000000,
    fileSize: 50000000,
    scenes,
    storyMap: {
      characters: [],
      characterRelationships: [],
      openingSituation: '',
      initialConflict: '',
      importantDiscoveries: [],
      mysteriesAndClues: [],
      risingTensionBeats: [],
      majorTurningPoints: [],
      revelations: [],
      climaxSetup: '',
      mainClimax: {} as any,
      consequences: [],
      resolution: '',
      confidence: 1.0,
    },
    indexedAt: new Date().toISOString(),
  };
}

test('Master Upgrade A: 20-Minute Timeline Duplicate Prevention (Eliminate 00:03:09:18 Looping)', () => {
  // Scenario: Pool of scenes where one scene starts at 189.3s (00:03:09:18).
  // In the buggy version, after 189.3s, unmatched shots failed to track intervals,
  // repeating 189.3s-193.3s indefinitely for all subsequent segments across a 20-min video.
  const scenes: EpisodeScene[] = [
    makeMockScene('sc_intro', 0, 60, { description: 'Intro scene city morning', location: 'city' }),
    makeMockScene('sc_office', 60, 180, { description: 'Office discussion with detective', location: 'office' }),
    makeMockScene('sc_189', 189.3, 210, { description: 'Specific alley scene at 03:09:18', location: 'alley' }),
    makeMockScene('sc_park', 210, 400, { description: 'Park walk and conversation', location: 'park' }),
    makeMockScene('sc_lab', 400, 700, { description: 'Laboratory analysis and clues', location: 'lab' }),
    makeMockScene('sc_climax', 700, 1200, { description: 'Chase scene and climax resolution', location: 'warehouse' }),
  ];

  const episodeIndex = makeMockIndex(scenes, 1200);

  // Generate 40 consecutive segments spanning 160s (representing long-form narration)
  const segments: ExplanationScriptSegment[] = [];
  let t = 0;
  for (let i = 0; i < 40; i++) {
    const dur = 4.0;
    segments.push({
      segmentId: `seg_${i}`,
      text: `দীর্ঘ বর্ণনার দৃশ্য পর্ব ${i + 1}। চরিত্রটি এগিয়ে যাচ্ছে এবং পরবর্তী ক্লু খুঁজছে।`,
      voiceoverStart: t,
      voiceoverEnd: t + dur,
      duration: dur,
      sentenceIndex: i,
      paragraphIndex: 0,
      eventsDescribed: [],
      narrativePurpose: 'investigation',
      visualIntent: 'Normal narrative progression',
      requiresMultiShot: false,
      targetShotCount: 1,
    });
    t += dur;
  }

  const script: ExplanationScript = {
    rawText: segments.map((s) => s.text).join(' '),
    format: 'plain',
    segments,
    alignmentConfidence: 0.95,
    isAlignedToVoiceover: true,
  };

  const timeline = aiDirectorEngine.generateTimeline(episodeIndex, script, '16:9', undefined, {
    minShotDuration: 3.0,
    minClipDuration: 3.0,
  });

  // 1. Verify timeline shots were generated
  assert.ok(timeline.shots.length > 0, 'Timeline must contain shots');

  // 2. Check for duplicate 189.3s footage loops:
  // In the buggy version, there were 20+ shots starting at 189.3s
  const shotsAt189 = timeline.shots.filter(
    (s: MovieTimelineShot) => s.sourceStart !== undefined && Math.abs(s.sourceStart - 189.3) < 0.2
  );
  assert.ok(
    shotsAt189.length <= 1,
    `Shots starting at 189.3s must occur at most once, found: ${shotsAt189.length}`
  );

  // 3. Verify duplicate report indicates zero duplicates
  const dupReport = aiDirectorEngine.detectDuplicateScenes(timeline.shots);
  assert.strictEqual(dupReport.hasDuplicates, false, 'Timeline should not have unresolved duplicate intervals');
  assert.strictEqual(dupReport.duplicateCount, 0, 'Duplicate count must be 0');

  // 4. Verify no overlapping intervals for the same scene (> 0.5s)
  const intervalsByScene = new Map<string, Array<{ start: number; end: number }>>();
  for (const shot of timeline.shots) {
    if (
      shot.sceneId &&
      shot.sceneId !== 'unmatched' &&
      shot.sourceStart !== undefined &&
      shot.sourceEnd !== undefined &&
      !shot.isScreenshot
    ) {
      if (!intervalsByScene.has(shot.sceneId)) {
        intervalsByScene.set(shot.sceneId, []);
      }
      const intervals = intervalsByScene.get(shot.sceneId)!;
      for (const prev of intervals) {
        const overlap = Math.max(0, Math.min(shot.sourceEnd, prev.end) - Math.max(shot.sourceStart, prev.start));
        assert.ok(
          overlap <= 0.5,
          `Scene ${shot.sceneId} has overlapping usage (${overlap.toFixed(2)}s) between [${prev.start}-${prev.end}] and [${shot.sourceStart}-${shot.sourceEnd}]`
        );
      }
      intervals.push({ start: shot.sourceStart, end: shot.sourceEnd });
    }
  }
});

test('Master Upgrade B: Strict 3.0s Minimum Clip Duration Enforcement', () => {
  // Scenario: Script contains short Bengali sentences / micro-clauses (0.6s, 0.8s, 1.0s, 1.2s, 1.4s)
  // Previous version produced 0.4s and 0.8s micro-clips.
  // The upgrade must cluster these into visual shots of at least 3.0s.
  const scenes: EpisodeScene[] = [
    makeMockScene('sc_1', 0, 100, { description: 'Detective investigating room', location: 'room' }),
    makeMockScene('sc_2', 100, 200, { description: 'Detective discovers letter on desk', location: 'office' }),
  ];

  const episodeIndex = makeMockIndex(scenes, 200);

  // Series of short clauses totaling 11.5 seconds
  const shortDurations = [0.8, 1.2, 0.6, 1.4, 1.0, 1.0, 2.0, 1.5, 2.0];
  let currentStart = 0;
  const segments: ExplanationScriptSegment[] = shortDurations.map((dur, i) => {
    const seg: ExplanationScriptSegment = {
      segmentId: `seg_short_${i}`,
      text: `সংক্ষিপ্ত বাক্য পর্ব ${i + 1}।`,
      voiceoverStart: currentStart,
      voiceoverEnd: currentStart + dur,
      duration: dur,
      sentenceIndex: i,
      paragraphIndex: 0,
      eventsDescribed: [],
      narrativePurpose: 'investigation',
      visualIntent: 'Quick beat',
      requiresMultiShot: false,
      targetShotCount: 1,
    };
    currentStart += dur;
    return seg;
  });

  const script: ExplanationScript = {
    rawText: segments.map((s) => s.text).join(' '),
    format: 'plain',
    segments,
    alignmentConfidence: 0.95,
    isAlignedToVoiceover: true,
  };

  const timeline = aiDirectorEngine.generateTimeline(episodeIndex, script, '16:9', undefined, {
    minShotDuration: 3.0,
    minClipDuration: 3.0,
  });

  // Assert every single shot in the timeline satisfies duration >= 2.95s
  for (let i = 0; i < timeline.shots.length; i++) {
    const shot = timeline.shots[i];
    assert.ok(
      shot.duration >= 2.95,
      `Shot #${i} (${shot.shotId}) duration is ${shot.duration.toFixed(2)}s, which is below the strict 3.0s minimum!`
    );
  }
});

test('Master Upgrade C: Bengali Subtitle Decoupling & Dari (।) Unicode Preservation', () => {
  // Scenario: Captions must retain their exact spoken timestamps (voiceoverStart/End)
  // and preserve Bengali Unicode chars including Dari (।) and Nukta.
  // When visual shots cut beneath them, captions must NOT be truncated or shifted.
  const scenes: EpisodeScene[] = [
    makeMockScene('sc_1', 0, 50, { description: 'Entering room' }),
    makeMockScene('sc_2', 50, 100, { description: 'Inspecting glass' }),
  ];

  const episodeIndex = makeMockIndex(scenes, 100);

  const segments: ExplanationScriptSegment[] = [
    {
      segmentId: 'seg_sub_1',
      text: 'সে দ্রুত ঘরে প্রবেশ করল।',
      voiceoverStart: 0.0,
      voiceoverEnd: 3.5,
      duration: 3.5,
      sentenceIndex: 0,
      paragraphIndex: 0,
      eventsDescribed: [],
      narrativePurpose: 'setup',
      visualIntent: 'Entering room',
      requiresMultiShot: false,
      targetShotCount: 1,
    },
    {
      segmentId: 'seg_sub_2',
      text: 'ভাঙা কাচের টুকরো দেখে সে চমকে উঠল এবং ফোনটি হাতে তুলে নিল॥',
      voiceoverStart: 3.5,
      voiceoverEnd: 7.2,
      duration: 3.7,
      sentenceIndex: 1,
      paragraphIndex: 0,
      eventsDescribed: [],
      narrativePurpose: 'investigation',
      visualIntent: 'Examining glass and phone',
      requiresMultiShot: false,
      targetShotCount: 1,
    },
  ];

  const script: ExplanationScript = {
    rawText: segments.map((s) => s.text).join(' '),
    format: 'plain',
    segments,
    alignmentConfidence: 0.95,
    isAlignedToVoiceover: true,
  };

  const timeline = aiDirectorEngine.generateTimeline(episodeIndex, script, '16:9', undefined, {
    minShotDuration: 3.0,
    minClipDuration: 3.0,
  });

  // Captions must match original segments exactly in timing and text
  assert.ok(timeline.captions && timeline.captions.length === 2, 'Captions count must equal narration segments');
  assert.strictEqual(timeline.captions[0].startTime, 0.0);
  assert.strictEqual(timeline.captions[0].endTime, 3.5);
  assert.ok(timeline.captions[0].text.includes('।'), 'Bengali Dari (।) must be preserved');

  assert.strictEqual(timeline.captions[1].startTime, 3.5);
  assert.strictEqual(timeline.captions[1].endTime, 7.2);
  assert.ok(timeline.captions[1].text.includes('॥'), 'Bengali Double Dari (॥) must be preserved');
});

test('Master Upgrade D: Match Status Attribution & Explainability', () => {
  const scenes: EpisodeScene[] = [
    makeMockScene('sc_vault', 0, 50, {
      description: 'The protagonist opens a secret wooden vault in the library.',
      actions: ['opens vault', 'unlocking'],
      narrativePurpose: 'investigation',
    }),
  ];

  const episodeIndex = makeMockIndex(scenes, 50);

  const segments: ExplanationScriptSegment[] = [
    {
      segmentId: 'seg_match_1',
      text: 'নায়ক একটি গোপন কাঠের ভল্ট খুলে ফেলল।',
      voiceoverStart: 0.0,
      voiceoverEnd: 4.0,
      duration: 4.0,
      sentenceIndex: 0,
      paragraphIndex: 0,
      eventsDescribed: ['opening vault'],
      narrativePurpose: 'investigation',
      visualIntent: 'Unlocking secret vault',
      requiresMultiShot: false,
      targetShotCount: 1,
    },
  ];

  const script: ExplanationScript = {
    rawText: segments.map((s) => s.text).join(' '),
    format: 'plain',
    segments,
    alignmentConfidence: 0.95,
    isAlignedToVoiceover: true,
  };

  const timeline = aiDirectorEngine.generateTimeline(episodeIndex, script, '16:9');

  assert.ok(timeline.shots.length > 0);
  const shot = timeline.shots[0];
  // Verify matchStatus field exists and is valid
  assert.ok(['matched', 'needs_review', 'unmatched', 'manually_assigned'].includes(shot.matchStatus ?? ''));
  // Verify explainability
  assert.ok(shot.whyThisScene && shot.whyThisScene.fullSummary.length > 0, 'Shot must have whyThisScene explanation');
});

test('Master Upgrade E: Pre-render AIDirectorReviewStage Quality Audit for Sub-3s Clips & Duplicates', () => {
  const dummyScene = makeMockScene('sc_1', 10, 40);
  const episodeIndex = makeMockIndex([dummyScene], 100);

  const script: ExplanationScript = {
    rawText: 'সে ঘরে ঢুকে রহস্যের সমাধান করল।',
    format: 'plain',
    isAlignedToVoiceover: true,
    alignmentConfidence: 0.95,
    segments: [
      {
        segmentId: 'seg_1',
        text: 'সে ঘরে ঢুকে রহস্যের সমাধান করল।',
        voiceoverStart: 0.0,
        voiceoverEnd: 4.0,
        duration: 4.0,
        sentenceIndex: 0,
        paragraphIndex: 0,
        eventsDescribed: [],
        narrativePurpose: 'climax',
        visualIntent: '',
        requiresMultiShot: false,
        targetShotCount: 1,
      },
    ],
  };

  // Test 1: Compliant timeline with >= 3.0s clips and no duplicates
  const compliantTimeline = aiDirectorEngine.generateTimeline(episodeIndex, script, '16:9', undefined, {
    minShotDuration: 3.0,
    minClipDuration: 3.0,
  });

  const compliantReview = aiDirectorReviewStage.reviewTimeline(compliantTimeline, script, episodeIndex);
  assert.strictEqual(compliantReview.isApprovedForRender, true, 'Clean timeline should pass review');
  assert.ok(
    !compliantReview.warnings.some((w: string) => w.includes('minimum clip pacing rule')),
    'Clean timeline should have no sub-3s warning'
  );
  assert.ok(
    !compliantReview.warnings.some((w: string) => w.includes('repeated source footage intervals')),
    'Clean timeline should have no duplicate warning'
  );

  // Test 2: Defective timeline with a 1.2s micro-clip and duplicate scene report
  const defectiveTimeline = {
    ...compliantTimeline,
    shots: [
      {
        shotId: 'shot_micro',
        sceneId: 'sc_1',
        sourceStart: 10,
        sourceEnd: 11.2,
        timelineStart: 0,
        timelineEnd: 1.2,
        duration: 1.2, // Violates 3.0s minimum
        matchScore: 80,
        matchStatus: 'matched' as const,
        isLocked: false,
      },
      {
        shotId: 'shot_dup',
        sceneId: 'sc_1',
        sourceStart: 10,
        sourceEnd: 11.2,
        timelineStart: 1.2,
        timelineEnd: 6.2,
        duration: 5.0,
        matchScore: 80,
        matchStatus: 'matched' as const,
        isDuplicate: true,
        isLocked: false,
      },
    ],
    duplicateReport: {
      hasDuplicates: true,
      duplicateCount: 1,
      duplicateIntervals: [{ sceneId: 'sc_1', start: 10, end: 11.2, shotIds: ['shot_micro', 'shot_dup'] }],
    },
  };

  const defectiveReview = aiDirectorReviewStage.reviewTimeline(defectiveTimeline as any, script, episodeIndex);
  // Review score should be penalized and warnings should flag sub-3.0s and duplicates
  assert.ok(defectiveReview.overallScore < compliantReview.overallScore, 'Defective review score must be lower');
  assert.ok(
    defectiveReview.warnings.some((w: string) => w.includes('minimum clip pacing rule')),
    'Review must flag clips shorter than 3.0s'
  );
  assert.ok(
    defectiveReview.warnings.some((w: string) => w.includes('repeated source footage intervals')),
    'Review must flag duplicate footage'
  );
});

test('Master Upgrade F: Bulk Screenshot Acceptance & Auto-Review Quality Gate Re-validation', () => {
  const dummyScene = makeMockScene('sc_hero', 10, 50, { description: 'Hero arriving at scene' });
  const episodeIndex = makeMockIndex([dummyScene], 100);

  // Timeline with 3 shots: one video, one screenshot (unlocked), and one unmatched shot
  const testShots: MovieTimelineShot[] = [
    {
      shotId: 'shot_1',
      segmentId: 'seg_1',
      sceneId: 'sc_hero',
      sourceFile: 'dummy_movie.mp4',
      sourceStart: 10,
      sourceEnd: 15,
      timelineStart: 0,
      timelineEnd: 5,
      duration: 5,
      matchScore: 85,
      confidence: 0.85,
      isLowConfidence: false,
      isUnmatched: false,
      presentationType: 'video_clip',
      isScreenshot: false,
      isLocked: false,
      isManualOverride: false,
      framingMode: 'action',
      whyThisScene: { characterMatch: '', actionMatch: '', storyContextReason: '', chronologyCheck: '', emotionalFit: '', fullSummary: 'Hero arrival' },
      transition: 'cut',
      transitionDuration: 0,
    },
    {
      shotId: 'shot_2',
      segmentId: 'seg_2',
      sceneId: 'sc_hero',
      sourceFile: 'dummy_movie.mp4',
      sourceStart: 15,
      sourceEnd: 20,
      timelineStart: 5,
      timelineEnd: 10,
      duration: 5,
      matchScore: 75,
      confidence: 0.75,
      isLowConfidence: false,
      isUnmatched: false,
      presentationType: 'screenshot',
      isScreenshot: true,
      motionEffect: 'gentle_zoom_in',
      isLocked: false, // Not yet accepted
      isManualOverride: false,
      framingMode: 'action',
      whyThisScene: { characterMatch: '', actionMatch: '', storyContextReason: '', chronologyCheck: '', emotionalFit: '', fullSummary: 'Screenshot evidence' },
      transition: 'cut',
      transitionDuration: 0,
    },
    {
      shotId: 'shot_3',
      segmentId: 'seg_3',
      sceneId: 'unmatched',
      sourceFile: 'dummy_movie.mp4',
      sourceStart: 20,
      sourceEnd: 25,
      timelineStart: 10,
      timelineEnd: 15,
      duration: 5,
      matchScore: 0,
      confidence: 0,
      isLowConfidence: true,
      isUnmatched: true,
      presentationType: 'video_clip',
      isScreenshot: false,
      isLocked: false,
      isManualOverride: false,
      framingMode: 'action',
      whyThisScene: { characterMatch: '', actionMatch: '', storyContextReason: '', chronologyCheck: '', emotionalFit: '', fullSummary: 'Unmatched beat' },
      transition: 'cut',
      transitionDuration: 0,
    },
  ];

  const timeline = {
    timelineId: 'tl_bulk_test',
    projectId: 'proj_bulk_test',
    duration: 15,
    shots: testShots,
    outputAspectRatio: '16:9' as const,
    outputWidth: 1920,
    outputHeight: 1080,
    outputFps: 30,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Initially: unmatched shot 3 causes quality failure (e.g. 20-50/100)
  const initialQuality = movieExplanationQualityGate.evaluateTimeline(timeline as any, 15, episodeIndex);
  assert.strictEqual(initialQuality.passed, false, 'Timeline with unmatched shot must fail initial gate');

  // 1. Bulk accept all screenshots:
  let acceptedScreenshotsCount = 0;
  for (const shot of timeline.shots) {
    if (shot.isScreenshot || shot.presentationType === 'screenshot') {
      shot.isLocked = true;
      shot.isManualOverride = true;
      acceptedScreenshotsCount++;
    }
  }
  assert.strictEqual(acceptedScreenshotsCount, 1, 'Should accept 1 screenshot');
  assert.strictEqual(timeline.shots[1].isLocked, true, 'Screenshot shot must now be locked/approved');

  // 2. Convert unmatched to moving screenshot:
  for (const shot of timeline.shots) {
    if (shot.isUnmatched || shot.sceneId === 'unmatched') {
      shot.sceneId = dummyScene.sceneId;
      shot.presentationType = 'screenshot';
      shot.isScreenshot = true;
      shot.motionEffect = 'gentle_zoom_in';
      shot.isUnmatched = false;
      shot.isLowConfidence = false;
      shot.matchScore = 80;
      shot.confidence = 0.85;
      shot.isLocked = true;
      shot.isManualOverride = true;
    }
  }

  // 3. Re-validate timeline Quality Gate:
  const revalidatedQuality = movieExplanationQualityGate.evaluateTimeline(timeline as any, 15, episodeIndex);
  assert.strictEqual(revalidatedQuality.passed, true, 'Timeline must pass after resolving unmatched and approving screenshots');
  assert.ok(revalidatedQuality.overallReadinessScore >= 90, `Readiness score should be >= 90, got ${revalidatedQuality.overallReadinessScore}`);
});
