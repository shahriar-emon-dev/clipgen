// ============================================================
// Bangla Voiceover Synchronization & Visual Storytelling Engine Upgrade
// Comprehensive Integration Verification for Master Prompt Requirements:
// 1. Bengali Unicode & Dari (।) multi-action sentence decomposition
// 2. Intelligent scene selection with continuity and normalized 100-pt scoring
// 3. Mandatory physical screenshot insertion every 3-4 video clips
// 4. Contextual on-screen hooks (Bengali & English) in safe upper third
// 5. Local sound effects library (SFX) with volume ducking & non-overlapping spacing
// 6. Context-aware transition selection & rendering (cut, crossfade, fade_black, fade_white)
// 7. AI Director pre-render quality review stage
// ============================================================

import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import { scriptAlignmentEngine } from '../services/movieExplanation/ScriptAlignmentEngine.js';
import { aiDirectorEngine } from '../services/movieExplanation/AIDirectorEngine.js';
import { soundDesignService } from '../services/movieExplanation/SoundDesignService.js';
import { contextualHookEngine } from '../services/movieExplanation/ContextualHookEngine.js';
import { transformativeFilterEngine } from '../services/movieExplanation/TransformativeFilterEngine.js';
import { aiDirectorReviewStage } from '../services/movieExplanation/AIDirectorReviewStage.js';
import type {
  EpisodeIntelligenceIndex,
  EpisodeScene,
  ExplanationScript,
  ExplanationScriptSegment,
  WordTimestamp,
} from '../../../shared/types.js';

function makeMockScene(id: string, start: number, end: number, overrides: Partial<EpisodeScene> = {}): EpisodeScene {
  return {
    sceneId: id,
    sceneIndex: 0,
    startTime: start,
    endTime: end,
    duration: end - start,
    shotBoundaries: [start, end],
    description: 'Detailed scene description',
    actions: ['talking'],
    characters: ['Protagonist'],
    emotionalTone: 'neutral',
    location: 'interior_office',
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

test('Master Upgrade 1: Multi-action Bengali sentence is intelligently divided into distinct visual shots', () => {
  const sentence = 'সে ঘরে ঢুকে ভাঙা গ্লাসটি দেখে এবং ফোনটি তুলে নেয়।';

  // Words with realistic word-level timestamps (total 6.0s)
  const words: WordTimestamp[] = [
    { word: 'সে', start: 0.0, end: 0.4 },
    { word: 'ঘরে', start: 0.5, end: 1.0 },
    { word: 'ঢুকে', start: 1.1, end: 1.8 },
    { word: 'ভাঙা', start: 2.0, end: 2.6 },
    { word: 'গ্লাসটি', start: 2.7, end: 3.3 },
    { word: 'দেখে', start: 3.4, end: 3.9 },
    { word: 'এবং', start: 4.0, end: 4.3 },
    { word: 'ফোনটি', start: 4.4, end: 5.1 },
    { word: 'তুলে', start: 5.2, end: 5.6 },
    { word: 'নেয়।', start: 5.7, end: 6.0 },
  ];

  const subActions = scriptAlignmentEngine.extractSubActionClauses(sentence, 0.0, 6.0, words);

  // Must decompose into 3 sequential narrative beats
  assert.strictEqual(subActions.length, 3, 'Multi-action Bengali sentence must split into 3 distinct visual clauses');

  // Clause 1: Entering room
  assert.ok(subActions[0].actionText.includes('ঘরে ঢুকে'), 'Clause 1 must capture entering room');
  assert.strictEqual(subActions[0].actionConcept, 'movement_enter');
  assert.ok((subActions[0].subStart ?? 0) >= 0.0 && (subActions[0].subEnd ?? 0) <= 2.0);

  // Clause 2: Seeing broken glass
  assert.ok(subActions[1].actionText.includes('ভাঙা গ্লাসটি দেখে'), 'Clause 2 must capture seeing broken glass');
  assert.strictEqual(subActions[1].actionConcept, 'observation_object');
  assert.ok((subActions[1].subStart ?? 0) >= 1.5 && (subActions[1].subEnd ?? 0) <= 4.2);

  // Clause 3: Picking up phone
  assert.ok(subActions[2].actionText.includes('ফোনটি তুলে নেয়'), 'Clause 3 must capture picking up phone');
  assert.strictEqual(subActions[2].actionConcept, 'interaction_phone');
  assert.ok((subActions[2].subStart ?? 0) >= 4.0 && (subActions[2].subEnd ?? 0) <= 6.0);
});

test('Master Upgrade 2: AIDirectorEngine maps each Bengali sub-action to relevant scene footage', () => {
  const sceneEnter = makeMockScene('sc_enter', 10, 40, {
    description: 'Character enters the dark apartment room slowly.',
    actions: ['walking', 'enters room'],
    location: 'apartment_room',
  });
  const sceneGlass = makeMockScene('sc_glass', 60, 90, {
    description: 'Close-up of broken glass shattered on the floor.',
    actions: ['examining broken glass'],
    objectsAndEvidence: ['broken glass'],
    location: 'apartment_room',
  });
  const scenePhone = makeMockScene('sc_phone', 120, 150, {
    description: 'Character reaches down and picks up the ringing telephone receiver.',
    actions: ['phone call', 'picks up phone'],
    objectsAndEvidence: ['telephone'],
    location: 'apartment_room',
  });

  const index: EpisodeIntelligenceIndex = {
    mediaId: 'proj_test_multi',
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
    scenes: [sceneEnter, sceneGlass, scenePhone],
    storyMap: {} as any,
    indexedAt: new Date().toISOString(),
  };

  const segment: ExplanationScriptSegment = {
    segmentId: 'seg_multi_1',
    text: 'সে ঘরে ঢুকে ভাঙা গ্লাসটি দেখে এবং ফোনটি তুলে নেয়।',
    voiceoverStart: 0.0,
    voiceoverEnd: 6.0,
    duration: 6.0,
    sentenceIndex: 0,
    paragraphIndex: 0,
    eventsDescribed: [],
    narrativePurpose: 'investigation',
    visualIntent: 'Multi-action sequence',
    requiresMultiShot: true,
    targetShotCount: 3,
    subActions: [
      { clauseIndex: 0, clauseText: 'সে ঘরে ঢুকে', actionText: 'সে ঘরে ঢুকে', startTime: 0.0, endTime: 1.8, subStart: 0.0, subEnd: 1.8, actionConcept: 'movement_enter', duration: 1.8, keywords: ['ঘরে ঢুকে', 'enter', 'walk'] },
      { clauseIndex: 1, clauseText: 'ভাঙা গ্লাসটি দেখে', actionText: 'ভাঙা গ্লাসটি দেখে', startTime: 1.8, endTime: 3.9, subStart: 1.8, subEnd: 3.9, actionConcept: 'observation_object', duration: 2.1, keywords: ['ভাঙা', 'গ্লাস', 'broken glass'] },
      { clauseIndex: 2, clauseText: 'এবং ফোনটি তুলে নেয়।', actionText: 'এবং ফোনটি তুলে নেয়।', startTime: 3.9, endTime: 6.0, subStart: 3.9, subEnd: 6.0, actionConcept: 'interaction_phone', duration: 2.1, keywords: ['ফোনটি তুলে', 'phone', 'telephone'] },
    ],
  };

  const script: ExplanationScript = {
    rawText: segment.text,
    format: 'plain',
    segments: [segment],
    isAlignedToVoiceover: true,
    alignmentConfidence: 0.95,
  };

  const timeline = aiDirectorEngine.generateTimeline(index, script, '16:9');

  // Must generate separate sub-shots
  assert.ok(timeline.shots.length >= 3, `Expected at least 3 shots for 3 sub-actions, got ${timeline.shots.length}`);

  // Shot 0 should match entering room
  assert.ok(timeline.shots[0].sentenceText?.includes('ঘরে ঢুকে'));
  assert.strictEqual(timeline.shots[0].sceneId, 'sc_enter');

  // Shot 1 should match broken glass
  assert.ok(timeline.shots[1].sentenceText?.includes('গ্লাস'));
  assert.strictEqual(timeline.shots[1].sceneId, 'sc_glass');

  // Shot 2 should match telephone interaction
  assert.ok(timeline.shots[2].sentenceText?.includes('ফোন'));
  assert.strictEqual(timeline.shots[2].sceneId, 'sc_phone');
});

test('Master Upgrade 3: Automatic screenshot insertion every 3-4 video clips with Ken Burns motion', () => {
  const scenes = Array.from({ length: 8 }, (_, i) =>
    makeMockScene(`sc_${i}`, i * 30, (i + 1) * 30, {
      description: `Scene ${i} of investigation narrative`,
      location: `location_${i % 2}`,
    })
  );

  const index: EpisodeIntelligenceIndex = {
    mediaId: 'proj_test_screens',
    originalVideoPath: 'dummy.mp4',
    filename: 'dummy.mp4',
    duration: 600,
    width: 1920,
    height: 1080,
    fps: 30,
    codec: 'h264',
    audioCodec: 'aac',
    bitrate: 5000000,
    fileSize: 1000,
    scenes,
    storyMap: {} as any,
    indexedAt: new Date().toISOString(),
  };

  const segments: ExplanationScriptSegment[] = Array.from({ length: 8 }, (_, i) => ({
    segmentId: `seg_${i}`,
    text: `Narration sentence number ${i + 1} advancing the story mystery.`,
    voiceoverStart: i * 3.0,
    voiceoverEnd: (i + 1) * 3.0,
    duration: 3.0,
    sentenceIndex: i,
    paragraphIndex: 0,
    eventsDescribed: [],
    narrativePurpose: i === 3 ? 'reveal' : 'investigation',
    visualIntent: '',
    requiresMultiShot: false,
    targetShotCount: 1,
  }));

  const script: ExplanationScript = {
    rawText: segments.map((s) => s.text).join(' '),
    format: 'plain',
    segments,
    isAlignedToVoiceover: true,
    alignmentConfidence: 0.95,
  };

  const timeline = aiDirectorEngine.generateTimeline(index, script, '16:9', undefined, {
    screenshotInterval: 3,
    maxConsecutiveVideoClips: 4,
  });

  // Verify screenshot is present in timeline shots
  const screenshotShots = timeline.shots.filter((s) => s.isScreenshot || s.presentationType === 'screenshot');
  assert.ok(screenshotShots.length >= 1, 'Timeline must contain at least one real screenshot shot');

  // Verify Ken Burns motion is assigned
  for (const s of screenshotShots) {
    assert.ok(s.motionEffect, 'Screenshot shot must have an assigned Ken Burns motion effect');
    assert.ok(
      ['gentle_zoom_in', 'pan_left_to_right', 'pan_right_to_left', 'subtle_diagonal', 'gentle_zoom_out'].includes(s.motionEffect!),
      `Valid motion effect expected, got ${s.motionEffect}`
    );
  }

  // Verify no consecutive sequence of video clips exceeds 4
  let consecutiveVideo = 0;
  for (const shot of timeline.shots) {
    if (shot.isScreenshot || shot.presentationType === 'screenshot') {
      consecutiveVideo = 0;
    } else {
      consecutiveVideo++;
      assert.ok(consecutiveVideo <= 4, `Consecutive video clips must not exceed 4 (was ${consecutiveVideo})`);
    }
  }
});

test('Master Upgrade 4: Local SFX library indexes authentic audio files and places ducked sound layers', () => {
  const availableSounds = soundDesignService.getAvailableSounds();
  assert.ok(availableSounds.length >= 8, `Expected at least 8 local SFX assets, found ${availableSounds.length}`);

  // Verify real physical file existence for all assets
  for (const sound of availableSounds) {
    assert.ok(fs.existsSync(sound.filePath), `SFX file must exist on disk: ${sound.filePath}`);
    assert.ok(sound.defaultVolume <= 0.20, `SFX volume must be safely ducked (<= 0.20), was ${sound.defaultVolume}`);
  }

  // Test automatic sound layer generation from Bengali script triggers
  const segments: ExplanationScriptSegment[] = [
    {
      segmentId: 'seg_sfx_1',
      text: 'হঠাৎ দরজার শব্দ হলো এবং সে ঘরে ঢুকে ভাঙা গ্লাস দেখে আঁতকে উঠল।',
      voiceoverStart: 0.0,
      voiceoverEnd: 5.0,
      duration: 5.0,
      sentenceIndex: 0,
      paragraphIndex: 0,
      eventsDescribed: [],
      narrativePurpose: 'investigation',
      visualIntent: '',
      requiresMultiShot: false,
      targetShotCount: 1,
      subActions: [
        { clauseIndex: 0, clauseText: 'দরজার শব্দ হলো', actionText: 'দরজার শব্দ হলো', startTime: 0.0, endTime: 1.5, subStart: 0.0, subEnd: 1.5, actionConcept: 'door', duration: 1.5, keywords: ['দরজা খুলল', 'door'] },
        { clauseIndex: 1, clauseText: 'ভাঙা গ্লাস দেখে', actionText: 'ভাঙা গ্লাস দেখে', startTime: 2.8, endTime: 4.8, subStart: 2.8, subEnd: 4.8, actionConcept: 'glass', duration: 2.0, keywords: ['ভাঙা', 'গ্লাস', 'broken glass'] },
      ],
    },
  ];

  const dummyShots = [
    { shotId: 's1', timelineStart: 0.0, timelineEnd: 2.5 } as any,
    { shotId: 's2', timelineStart: 2.5, timelineEnd: 5.0 } as any,
  ];

  const audioLayers = soundDesignService.generateAudioLayers(segments, dummyShots, 5.0);
  assert.ok(audioLayers.length >= 1, 'Should place at least one contextual SFX audio layer');

  const sfxLayer = audioLayers.find((l) => l.trackType === 'sfx')!;
  assert.ok(sfxLayer, 'Must have trackType === "sfx"');
  assert.ok(sfxLayer.sourceFilePath && fs.existsSync(sfxLayer.sourceFilePath), 'Layer source file must exist on disk');
  assert.ok(sfxLayer.volume <= 0.20, 'Layer volume must be ducked under voiceover');
});

test('Master Upgrade 5: Contextual on-screen hooks are generated in safe upper-third positioning', () => {
  const segments: ExplanationScriptSegment[] = [
    {
      segmentId: 'seg_hook_1',
      text: 'চারপাশে অন্ধকার নেমে এল এবং কিছু একটা ঠিক নেই বলে মনে হলো।',
      voiceoverStart: 0.0,
      voiceoverEnd: 4.0,
      duration: 4.0,
      sentenceIndex: 0,
      paragraphIndex: 0,
      eventsDescribed: [],
      narrativePurpose: 'setup',
      visualIntent: '',
      requiresMultiShot: false,
      targetShotCount: 1,
    },
  ];

  const dummyShots = [{ shotId: 's1', timelineStart: 0.0, timelineEnd: 4.0 } as any];
  const hooks = contextualHookEngine.generateHooks(segments, dummyShots);

  assert.ok(hooks.length >= 1, 'Should generate at least one contextual hook');
  const hook = hooks[0];
  assert.ok(/[\u0980-\u09FF]/.test(hook.text), 'Hook should be generated in Bengali matching script language');
  assert.strictEqual(hook.category, 'callout');
  assert.ok(hook.positionY <= 25, 'Hook must be placed in safe upper third (positionY <= 25) so it never covers faces');
});

test('Master Upgrade 6: TransformativeFilterEngine generates real transition filters for FFmpeg', () => {
  const shotFadeBlack = {
    shotId: 'shot_fb',
    segmentId: 'seg_1',
    sceneId: 'sc_1',
    sourceFile: 'dummy.mp4',
    sourceStart: 10,
    sourceEnd: 13,
    timelineStart: 0,
    timelineEnd: 3,
    duration: 3.0,
    transition: 'fade_black' as const,
    transitionDuration: 0.5,
    transitionOut: 'fade_black' as const,
    transitionOutDuration: 0.5,
    matchScore: 85,
    confidence: 0.85,
    isLowConfidence: false,
    whyThisScene: {} as any,
    isLocked: false,
    isManualOverride: false,
    framingMode: 'action' as const,
  };

  const filterResult = transformativeFilterEngine.buildShotFiltergraph(shotFadeBlack, 0, '16:9', 1920, 1080, 60);

  // Filtergraph must contain fade in and fade out
  assert.ok(filterResult.fullFiltergraph.includes('fade=t=in'), 'Filtergraph must include fade in');
  assert.ok(filterResult.fullFiltergraph.includes('fade=t=out'), 'Filtergraph must include fade out');
  assert.ok(filterResult.fullFiltergraph.includes('c=black'), 'Must fade through black');
  assert.ok(filterResult.fullFiltergraph.includes('fps=60'), 'Must enforce 60 FPS output');
});

test('Master Upgrade 7: AI Director Review Stage audits 8 dimensions and passes compliant timeline', () => {
  const dummyScene = makeMockScene('sc_rev', 10, 40);
  const index: EpisodeIntelligenceIndex = {
    mediaId: 'proj_rev',
    originalVideoPath: 'dummy.mp4',
    filename: 'dummy.mp4',
    duration: 100,
    width: 1920,
    height: 1080,
    fps: 30,
    codec: 'h264',
    audioCodec: 'aac',
    bitrate: 5000000,
    fileSize: 1000,
    scenes: [dummyScene],
    storyMap: {} as any,
    indexedAt: new Date().toISOString(),
  };

  const script: ExplanationScript = {
    rawText: 'সে ঘরে ঢুকে রহস্যের সমাধান করল।',
    format: 'plain',
    isAlignedToVoiceover: true,
    alignmentConfidence: 0.95,
    segments: [
      {
        segmentId: 'seg_rev_1',
        text: 'সে ঘরে ঢুকে রহস্যের সমাধান করল।',
        voiceoverStart: 0.0,
        voiceoverEnd: 3.0,
        duration: 3.0,
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

  const timeline = aiDirectorEngine.generateTimeline(index, script, '16:9');
  const review = aiDirectorReviewStage.reviewTimeline(timeline, script, index);

  assert.ok(review.overallScore >= 80, `Expected review score >= 80, got ${review.overallScore}`);
  assert.strictEqual(review.isApprovedForRender, true, 'Timeline must be approved for rendering');
  assert.ok(review.checksPassed.length >= 5, 'Should pass at least 5 audit checks');
  assert.strictEqual(review.issues.length, 0, 'Compliant timeline must have zero blocking issues');
});
