import test from 'node:test';
import assert from 'node:assert/strict';
import { aiDirectorEngine } from '../services/movieExplanation/AIDirectorEngine.js';
import type {
  ExplanationScriptSegment,
  EpisodeScene,
} from '../../../shared/types.js';

test('Stage 2.1: Directorial Framing determines Close-Up for clues, expressions, and weapons', () => {
  const segClue: ExplanationScriptSegment = {
    segmentId: 'seg_clue_1',
    sentenceIndex: 0,
    text: 'প্যাট্রিক জেন টেবিলের উপর পড়ে থাকা একটি রক্তমাখা ছুরি এবং গোপন চিঠি লক্ষ্য করে।',
    cleanScript: 'প্যাট্রিক জেন টেবিলের উপর পড়ে থাকা একটি রক্তমাখা ছুরি এবং গোপন চিঠি লক্ষ্য করে।',
    voiceoverStart: 0,
    voiceoverEnd: 3.5,
  };

  const framingClue = aiDirectorEngine.determineDirectorialFraming(segClue);
  assert.equal(framingClue.framing, 'close_up');
  assert.ok(framingClue.scale > 1.15, 'Close-up scale should punch in (> 1.15x)');
  assert.match(framingClue.reason, /Close-up punch-in/i);
});

test('Stage 2.2: Directorial Framing determines Wide establishing frame for cities, buildings, and exteriors', () => {
  const segWide: ExplanationScriptSegment = {
    segmentId: 'seg_wide_1',
    sentenceIndex: 0,
    text: 'পরের দিন সকালে তারা স্যাক্রামেন্টো শহরের পুলিশ হেডকোয়ার্টারে পৌঁছায়।',
    cleanScript: 'পরের দিন সকালে তারা স্যাক্রামেন্টো শহরের পুলিশ হেডকোয়ার্টারে পৌঁছায়।',
    voiceoverStart: 3.5,
    voiceoverEnd: 7.0,
  };

  const sceneExt: EpisodeScene = {
    sceneId: 'sc_precinct',
    startTime: 100,
    endTime: 140,
    duration: 40,
    environmentType: 'exterior',
    description: 'Police precinct building exterior on city street.',
    characters: [],
    actions: [],
  };

  const framingWide = aiDirectorEngine.determineDirectorialFraming(segWide, sceneExt);
  assert.equal(framingWide.framing, 'wide');
  assert.equal(framingWide.scale, 1.0);
  assert.match(framingWide.reason, /Wide establishing frame/i);
});

test('Stage 2.3: Directorial Framing determines Medium frame for dialogue and balanced interactions', () => {
  const segDialogue: ExplanationScriptSegment = {
    segmentId: 'seg_diag_1',
    sentenceIndex: 0,
    text: 'লিসবন জেনকে জিজ্ঞেস করে সে কেন এই মামলায় এত আগ্রহী।',
    cleanScript: 'লিসবন জেনকে জিজ্ঞেস করে সে কেন এই মামলায় এত আগ্রহী।',
    voiceoverStart: 7.0,
    voiceoverEnd: 10.0,
  };

  const framingMedium = aiDirectorEngine.determineDirectorialFraming(segDialogue);
  assert.equal(framingMedium.framing, 'medium');
  assert.ok(framingMedium.scale >= 1.05 && framingMedium.scale <= 1.15);
});

test('Stage 2.4: Emotion-Aware Camera Motion matches narrative sentiment', () => {
  // Discovery / Truth / Shock -> Zoom In
  const segReveal: ExplanationScriptSegment = {
    segmentId: 'seg_rev_1',
    sentenceIndex: 0,
    text: 'হঠাৎ জেন বুঝতে পারল আসল খুনির পরিচয় এবং সত্য উন্মোচন করল।',
    cleanScript: 'হঠাৎ জেন বুঝতে পারল আসল খুনির পরিচয় এবং সত্য উন্মোচন করল।',
    voiceoverStart: 0,
    voiceoverEnd: 3.5,
    narrativePurpose: 'reveal',
  };
  const motionReveal = aiDirectorEngine.selectDirectorialMotionEffect(segReveal);
  assert.equal(motionReveal.motionEffect, 'gentle_zoom_in');
  assert.match(motionReveal.reason, /Dramatic push-in/i);

  // Grief / Isolation / Departure -> Zoom Out
  const segGrief: ExplanationScriptSegment = {
    segmentId: 'seg_grief_1',
    sentenceIndex: 1,
    text: 'সে একা দাঁড়িয়ে পুরোনো স্মৃতি মনে করে গভীর কষ্ট অনুভব করে।',
    cleanScript: 'সে একা দাঁড়িয়ে পুরোনো স্মৃতি মনে করে গভীর কষ্ট অনুভব করে।',
    voiceoverStart: 3.5,
    voiceoverEnd: 7.0,
    narrativePurpose: 'resolution',
  };
  const motionGrief = aiDirectorEngine.selectDirectorialMotionEffect(segGrief);
  assert.equal(motionGrief.motionEffect, 'gentle_zoom_out');
  assert.match(motionGrief.reason, /Reflective pull-out/i);

  // Action / Search / Track -> Lateral Pan
  const segSearch: ExplanationScriptSegment = {
    segmentId: 'seg_search_1',
    sentenceIndex: 2,
    text: 'গোয়েন্দারা পুরো বাড়ি তল্লাশি চালিয়ে কোনো প্রমাণ খুঁজছিল।',
    cleanScript: 'গোয়েন্দারা পুরো বাড়ি তল্লাশি চালিয়ে কোনো প্রমাণ খুঁজছিল।',
    voiceoverStart: 7.0,
    voiceoverEnd: 10.5,
  };
  const motionSearch = aiDirectorEngine.selectDirectorialMotionEffect(segSearch, undefined, 0);
  assert.match(motionSearch.motionEffect, /pan_/);
  assert.match(motionSearch.reason, /Lateral tracking motion/i);

  // Suspense / Unease -> Diagonal Drift
  const segSuspense: ExplanationScriptSegment = {
    segmentId: 'seg_suspense_1',
    sentenceIndex: 3,
    text: 'তার মনে গভীর সন্দেহ জাগে যে কেউ তাদের উপর গোপনে নজর রাখছে।',
    cleanScript: 'তার মনে গভীর সন্দেহ জাগে যে কেউ তাদের উপর গোপনে নজর রাখছে।',
    voiceoverStart: 10.5,
    voiceoverEnd: 14.0,
  };
  const motionSuspense = aiDirectorEngine.selectDirectorialMotionEffect(segSuspense);
  assert.equal(motionSuspense.motionEffect, 'subtle_diagonal');
  assert.match(motionSuspense.reason, /psychological tension/i);
});

test('Stage 2.5: Contextual Transitions select Dip-to-Black on time jumps and Cut on dialogue', () => {
  const sceneA: EpisodeScene = {
    sceneId: 'sc_early',
    startTime: 60,
    endTime: 90,
    duration: 30,
    characters: ['Patrick'],
    actions: [],
  };

  const sceneBTimeJump: EpisodeScene = {
    sceneId: 'sc_late',
    startTime: 600, // 510s gap (>300s!)
    endTime: 630,
    duration: 30,
    characters: ['Patrick'],
    actions: [],
  };

  const segTimeJump: ExplanationScriptSegment = {
    segmentId: 'seg_tj',
    sentenceIndex: 0,
    text: 'পরের দিন সকালে ঘটনা এক নতুন মোড় নেয়।',
    cleanScript: 'পরের দিন সকালে ঘটনা এক নতুন মোড় নেয়।',
    voiceoverStart: 0,
    voiceoverEnd: 3,
  };

  // 1. Time Jump should trigger fade_black
  const transTimeJump = aiDirectorEngine.selectContextualTransition(sceneBTimeJump, sceneA, segTimeJump, false, false);
  assert.equal(transTimeJump.transition, 'fade_black');
  assert.equal(transTimeJump.duration, 0.5);

  // 2. Same scene continuous dialogue should trigger hard cut (0.0s)
  const segCont: ExplanationScriptSegment = {
    segmentId: 'seg_cont',
    sentenceIndex: 1,
    text: 'লিসবন তার দিকে তাকিয়ে হাসল।',
    cleanScript: 'লিসবন তার দিকে তাকিয়ে হাসল।',
    voiceoverStart: 3,
    voiceoverEnd: 6,
  };
  const transCut = aiDirectorEngine.selectContextualTransition(sceneA, sceneA, segCont, false, false);
  assert.equal(transCut.transition, 'cut');
  assert.equal(transCut.duration, 0);

  // 3. Shock / Revelation should trigger fade_white
  const segShock: ExplanationScriptSegment = {
    segmentId: 'seg_shock',
    sentenceIndex: 2,
    text: 'হঠাৎ একটা প্রচণ্ড বিস্ফোরণে সবাই চমকে ওঠে!',
    cleanScript: 'হঠাৎ একটা প্রচণ্ড বিস্ফোরণে সবাই চমকে ওঠে!',
    voiceoverStart: 6,
    voiceoverEnd: 9,
    narrativePurpose: 'climax',
  };
  const transShock = aiDirectorEngine.selectContextualTransition(sceneBTimeJump, sceneA, segShock, false, false);
  assert.equal(transShock.transition, 'fade_white');
});

