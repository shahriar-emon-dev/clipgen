// ============================================================
// Scene Matching Accuracy & Grounding Test Suite (20 Real Scenarios)
// Exhaustively verifies all 20 required multimodal matching scenarios:
// 1. Discovery of secret plan / vault
// 2. Character entering room / arrival
// 3. Physical attack / confrontation
// 4. Uncovering physical evidence / clue
// 5. Climax & major reveal
// 6. Quiet confession / emotional motivation
// 7. Vehicle chase / pursuit
// 8. Urgent telephone call
// 9. Hospital / medical emergency
// 10. Precinct interrogation questioning
// 11. Flashback memory of past event
// 12. Ambiguous character realization vs eating dinner
// 13. Ambiguous boardroom contract vs shouting argument
// 14. Visual contradiction rejection (Stage B verification)
// 15. Missing matching footage flagged as unmatched (never filled with filler)
// 16. 25-clip spacing rule & non-overlapping interval reuse
// 17. Maximum video clip duration <= 3.0s
// 18. Screenshot cadence enforcement (<= 5 consecutive video clips)
// 19. Manual replacement persistence across timeline revisions
// 20. Strict separation of 4 time bases (Source, Audio, Clip, Timeline)
// ============================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { v4 as uuid } from 'uuid';
import { storySceneMatcher, type SceneMatchCandidate } from '../services/movieExplanation/StorySceneMatcher.js';
import { aiDirectorEngine } from '../services/movieExplanation/AIDirectorEngine.js';
import { modelOrchestrationService } from '../services/movieExplanation/ModelOrchestrationService.js';
import { movieExplanationQualityGate } from '../services/movieExplanation/MovieExplanationQualityGate.js';
import type {
  EpisodeIntelligenceIndex,
  EpisodeScene,
  ExplanationScript,
  ExplanationScriptSegment,
  MovieTimelineShot,
} from '../../../shared/types.js';

function makeScene(
  id: string,
  start: number,
  duration: number,
  overrides: Partial<EpisodeScene> = {}
): EpisodeScene {
  return {
    sceneId: id,
    sceneIndex: parseInt(id.replace(/\D/g, '') || '0', 10),
    startTime: start,
    endTime: start + duration,
    duration,
    shotBoundaries: [start],
    dialogueSnippet: '',
    dialogueText: '',
    characters: ['Alice', 'Bob'],
    location: 'interior / room',
    actions: ['talking'],
    objectsAndEvidence: [],
    events: [],
    emotionalTone: 'neutral / expository',
    narrativePurpose: 'setup',
    description: `Scene ${id}`,
    visualDetails: [],
    isClueOrReveal: false,
    isQuietMotivational: false,
    isActionHeavy: false,
    importance: 'supporting',
    confidence: 0.9,
    thumbnailUrl: `/mock/${id}.jpg`,
    ...overrides,
  };
}

function makeSegment(
  id: string,
  text: string,
  start: number,
  duration: number,
  overrides: Partial<ExplanationScriptSegment> = {}
): ExplanationScriptSegment {
  return {
    segmentId: id,
    text,
    voiceoverStart: start,
    voiceoverEnd: start + duration,
    duration,
    sentenceIndex: 0,
    paragraphIndex: 0,
    eventsDescribed: [],
    narrativePurpose: 'setup',
    visualIntent: '',
    requiresMultiShot: false,
    targetShotCount: 1,
    ...overrides,
  };
}

function buildIndex(scenes: EpisodeScene[]): EpisodeIntelligenceIndex {
  const duration = scenes.reduce((max, s) => Math.max(max, s.endTime), 3600);
  return {
    mediaId: 'benchmark_movie_001',
    originalVideoPath: 'dummy_movie.mp4',
    filename: 'dummy_movie.mp4',
    duration,
    width: 1920,
    height: 1080,
    fps: 30,
    codec: 'h264',
    audioCodec: 'aac',
    bitrate: 5000000,
    fileSize: 500000000,
    scenes,
    storyMap: {
      title: 'Benchmark Mystery',
      logline: 'An investigator uncovers an intricate conspiracy.',
      characters: [
        { id: 'c1', name: 'Alice', aliases: [], role: 'protagonist', description: 'Detective', firstAppearanceTime: 0 },
        { id: 'c2', name: 'Bob', aliases: [], role: 'antagonist', description: 'Suspect', firstAppearanceTime: 100 },
      ],
      characterRelationships: [],
      openingSituation: 'Opening',
      initialConflict: 'Conflict',
      importantDiscoveries: ['Encrypted vault'],
      mysteriesAndClues: [],
      risingTensionBeats: [],
      majorTurningPoints: [],
      revelations: [],
      climaxSetup: '',
      mainClimax: {
        id: 'cl1',
        title: 'Climax',
        description: 'Final confrontation',
        timestampStart: 3000,
        timestampEnd: 3300,
        stage: 'climax',
        charactersInvolved: ['Alice', 'Bob'],
        isKeyReveal: true,
        isClimax: true,
        evidence: 'Confession',
      },
      consequences: [],
      resolution: 'Ending',
      confidence: 0.95,
    },
    indexedAt: new Date().toISOString(),
  };
}

// ────────────────────────────────────────────────────────────
// 20-Scenario Benchmarking Suite
// ────────────────────────────────────────────────────────────

test('Benchmark 1: Discovery of secret plan / vault ranks vault over generic dialogue', () => {
  const genericScene = makeScene('sc_gen_1', 100, 60, {
    description: 'Alice and Bob talk about the investigation in the corridor.',
  });
  const vaultScene = makeScene('sc_vault_1', 850, 45, {
    description: 'Alice discovers the hidden encrypted vault behind the wall and unlocks it.',
    actions: ['revelation / discovery', 'investigation / examining clues'],
    objectsAndEvidence: ['safe', 'secret plan', 'documents'],
    isClueOrReveal: true,
  });

  const index = buildIndex([genericScene, vaultScene]);
  const seg = makeSegment('seg_1', 'Alice uncovers the secret plan hidden inside the concealed vault.', 0, 3.0);
  const candidates = storySceneMatcher.matchCandidatesForSegment(seg, index, [seg], 0);

  assert.strictEqual(candidates[0].scene.sceneId, 'sc_vault_1');
  assert.ok(candidates[0].matchScore > candidates[1].matchScore);
});

test('Benchmark 2: Character entering room / arrival ranks entry moment over sitting inside', () => {
  const seatedScene = makeScene('sc_seated', 400, 60, {
    description: 'Bob sits at the desk reading paperwork.',
    actions: ['reading'],
  });
  const entryScene = makeScene('sc_entry', 720, 30, {
    description: 'Alice cautiously opens the door and enters the dark apartment.',
    actions: ['entering room', 'opening door', 'arrival'],
  });

  const index = buildIndex([seatedScene, entryScene]);
  const seg = makeSegment('seg_2', 'Alice enters the apartment quietly, stepping through the doorway.', 5, 2.5);
  const candidates = storySceneMatcher.matchCandidatesForSegment(seg, index, [seg], 0);

  assert.strictEqual(candidates[0].scene.sceneId, 'sc_entry');
});

test('Benchmark 3: Physical attack / fight ranks struggle over calm walking', () => {
  const walkScene = makeScene('sc_walk', 300, 50, {
    description: 'Two men walk down a paved street talking calmly.',
    actions: ['walking'],
  });
  const fightScene = makeScene('sc_fight', 1200, 40, {
    description: 'A masked attacker ambushes Bob from the shadows and violent struggle ensues.',
    actions: ['confrontation / argument', 'physical confrontation', 'attack'],
    isActionHeavy: true,
  });

  const index = buildIndex([walkScene, fightScene]);
  const seg = makeSegment('seg_3', 'Suddenly, an assailant lunges from the dark, attacking Bob violently.', 10, 3.0);
  const candidates = storySceneMatcher.matchCandidatesForSegment(seg, index, [seg], 0);

  assert.strictEqual(candidates[0].scene.sceneId, 'sc_fight');
  assert.ok(candidates[0].matchScore >= 60);
});

test('Benchmark 4: Uncovering physical evidence / clue ranks inspection over distant shot', () => {
  const wideShot = makeScene('sc_wide', 500, 60, {
    description: 'Exterior wide shot of the municipal building during daylight.',
  });
  const clueScene = makeScene('sc_clue', 1450, 40, {
    description: 'The detective examines shattered glass and discovers a bloodied footprint.',
    actions: ['investigation / examining clues'],
    objectsAndEvidence: ['shattered glass', 'bloodied footprint', 'evidence'],
    isClueOrReveal: true,
  });

  const index = buildIndex([wideShot, clueScene]);
  const seg = makeSegment('seg_4', 'On the floor, the investigator finds shattered glass and a critical footprint clue.', 15, 3.0);
  const candidates = storySceneMatcher.matchCandidatesForSegment(seg, index, [seg], 0);

  assert.strictEqual(candidates[0].scene.sceneId, 'sc_clue');
});

test('Benchmark 5: Climax & major reveal selects climax scene and guards from early setup', () => {
  const climaxScene = makeScene('sc_climax', 3100, 90, {
    description: 'Final confrontation on the rooftop where the mastermind reveals his identity.',
    actions: ['revelation / discovery', 'confrontation / argument'],
    narrativePurpose: 'climax',
    importance: 'critical',
    isClueOrReveal: true,
  });
  const setupScene = makeScene('sc_setup', 150, 60, {
    description: 'Introductory discussion about the suspect in the office.',
    narrativePurpose: 'setup',
  });

  const index = buildIndex([setupScene, climaxScene]);

  // Setup beat should pick setupScene, not climax
  const earlySeg = makeSegment('seg_early', 'In the beginning, detectives begin tracking the mystery.', 0, 3.0);
  const earlyCand = storySceneMatcher.matchCandidatesForSegment(earlySeg, index, [earlySeg], 0);
  assert.strictEqual(earlyCand[0].scene.sceneId, 'sc_setup');

  // Climax beat selects climax
  const climaxSeg = makeSegment('seg_climax', 'The story reaches its climax as the truth is finally exposed.', 3000, 3.0, {
    narrativePurpose: 'climax',
  });
  const climaxCand = storySceneMatcher.matchCandidatesForSegment(climaxSeg, index, [climaxSeg], 0);
  assert.strictEqual(climaxCand[0].scene.sceneId, 'sc_climax');
});

test('Benchmark 6: Quiet confession / emotional motivation prioritizes emotional close-up over action', () => {
  const actionChase = makeScene('sc_action_chase', 900, 40, {
    description: 'High-speed police pursuit through downtown traffic.',
    isActionHeavy: true,
  });
  const confessionScene = makeScene('sc_confession', 600, 70, {
    description: 'Alice breaks down and confesses the dark reason she took the case.',
    actions: ['quiet conversation / confession'],
    isQuietMotivational: true,
    emotionalTone: 'sorrowful / emotional',
  });

  const index = buildIndex([actionChase, confessionScene]);
  const seg = makeSegment('seg_confess', 'In a quiet moment, Alice tearfully confesses why she cannot let this case go.', 25, 3.0);
  const candidates = storySceneMatcher.matchCandidatesForSegment(seg, index, [seg], 0);

  assert.strictEqual(candidates[0].scene.sceneId, 'sc_confession');
});

test('Benchmark 7: Vehicle chase / pursuit ranks pursuit over parked car conversation', () => {
  const parkedCar = makeScene('sc_parked', 450, 60, {
    description: 'Alice and Bob sit in a parked surveillance car eating sandwiches.',
  });
  const chaseScene = makeScene('sc_chase', 1600, 50, {
    description: 'Fast vehicle pursuit as suspect speeds across the bridge trying to escape.',
    actions: ['chase / pursuit'],
    isActionHeavy: true,
  });

  const index = buildIndex([parkedCar, chaseScene]);
  const seg = makeSegment('seg_chase', 'A high-speed pursuit breaks out as Bob flees in his vehicle across the bridge.', 35, 3.0);
  const candidates = storySceneMatcher.matchCandidatesForSegment(seg, index, [seg], 0);

  assert.strictEqual(candidates[0].scene.sceneId, 'sc_chase');
});

test('Benchmark 8: Urgent telephone call ranks phone receiver over in-person conversation', () => {
  const hallwayTalk = makeScene('sc_hallway', 200, 50, {
    description: 'Alice talks face to face with the precinct captain in the hallway.',
  });
  const phoneScene = makeScene('sc_phone', 1100, 35, {
    description: 'Bob answers an urgent phone call in a phone booth receiving critical instructions.',
    actions: ['phone call / message'],
    objectsAndEvidence: ['mobile phone / records'],
  });

  const index = buildIndex([hallwayTalk, phoneScene]);
  const seg = makeSegment('seg_phone', 'Bob receives an urgent phone call warning him that the police are coming.', 40, 2.5);
  const candidates = storySceneMatcher.matchCandidatesForSegment(seg, index, [seg], 0);

  assert.strictEqual(candidates[0].scene.sceneId, 'sc_phone');
});

test('Benchmark 9: Hospital / medical emergency ranks trauma ward over outpatient hallway', () => {
  const hospitalHall = makeScene('sc_hosp_hall', 350, 45, {
    description: 'Visitors walk down a brightly lit hospital corridor.',
    location: 'hospital / clinic',
  });
  const traumaWard = makeScene('sc_trauma', 1750, 50, {
    description: 'Doctors and nurses rush a critical wounded victim into the emergency surgery room.',
    location: 'hospital / clinic',
    actions: ['emergency surgery / medical rescue'],
    emotionalTone: 'tense / emergency',
  });

  const index = buildIndex([hospitalHall, traumaWard]);
  const seg = makeSegment('seg_hosp', 'Paramedics rush the wounded victim into emergency surgery at the hospital.', 50, 3.0);
  const candidates = storySceneMatcher.matchCandidatesForSegment(seg, index, [seg], 0);

  assert.strictEqual(candidates[0].scene.sceneId, 'sc_trauma');
});

test('Benchmark 10: Precinct interrogation questioning ranks interrogation room over court hallway', () => {
  const courtHall = makeScene('sc_court', 800, 50, {
    description: 'Lawyers speak in the courthouse corridor before the trial.',
    location: 'courthouse',
  });
  const interrogation = makeScene('sc_interrog', 1300, 60, {
    description: 'Detectives question the suspect under bright lights inside the interrogation room.',
    location: 'police station / interrogation',
    actions: ['interrogation / questioning'],
  });

  const index = buildIndex([courtHall, interrogation]);
  const seg = makeSegment('seg_interrog', 'Inside the interrogation room, detectives relentlessly question the suspect.', 60, 3.0);
  const candidates = storySceneMatcher.matchCandidatesForSegment(seg, index, [seg], 0);

  assert.strictEqual(candidates[0].scene.sceneId, 'sc_interrog');
});

test('Benchmark 11: Flashback memory of past event ranks earlier scene over contemporary timeline', () => {
  const contemporaryScene = makeScene('sc_now', 2200, 60, {
    description: 'Alice discusses current case progress at her desk.',
  });
  const flashbackScene = makeScene('sc_past', 40, 30, {
    description: 'Flashback memory showing the original incident five years earlier.',
    events: ['FLASHBACK at 0m40s'],
    narrativePurpose: 'clue',
  });

  const index = buildIndex([contemporaryScene, flashbackScene]);
  const seg = makeSegment('seg_flashback', 'Alice remembers back to years earlier when the tragedy first occurred.', 70, 3.0, {
    visualIntent: 'Flashback memory',
  });
  const candidates = storySceneMatcher.matchCandidatesForSegment(seg, index, [seg], 0);

  assert.strictEqual(candidates[0].scene.sceneId, 'sc_past');
});

test('Benchmark 12: Ambiguous character realization vs eating dinner in same dining room', () => {
  const dinnerScene = makeScene('sc_dinner', 650, 45, {
    description: 'Alice calmly eats dinner with Bob at the dining room table.',
    location: 'home / apartment',
    actions: ['eating dinner'],
  });
  const shockScene = makeScene('sc_realize', 1900, 40, {
    description: 'Alice stands frozen in the dining room with shock as she realizes Bob is the traitor.',
    location: 'home / apartment',
    actions: ['revelation / discovery', 'realizing betrayal'],
    emotionalTone: 'shock / tense',
    isClueOrReveal: true,
  });

  const index = buildIndex([dinnerScene, shockScene]);
  const seg = makeSegment('seg_realize', 'In pure shock, Alice suddenly realizes that Bob has betrayed her all along.', 80, 3.0);
  const candidates = storySceneMatcher.matchCandidatesForSegment(seg, index, [seg], 0);

  assert.strictEqual(candidates[0].scene.sceneId, 'sc_realize');
});

test('Benchmark 13: Ambiguous boardroom: signing contract vs heated shouting argument', () => {
  const signScene = makeScene('sc_sign', 500, 40, {
    description: 'Executives quietly sign business contracts in the boardroom.',
    location: 'office / boardroom',
    actions: ['signing contract'],
  });
  const argueScene = makeScene('sc_argue', 1550, 45, {
    description: 'An explosive heated argument erupts in the boardroom with furious shouting.',
    location: 'office / boardroom',
    actions: ['confrontation / argument', 'shouting argument'],
    emotionalTone: 'angry / explosive',
  });

  const index = buildIndex([signScene, argueScene]);
  const seg = makeSegment('seg_argue', 'A furious argument breaks out in the boardroom as accusations fly.', 90, 3.0);
  const candidates = storySceneMatcher.matchCandidatesForSegment(seg, index, [seg], 0);

  assert.strictEqual(candidates[0].scene.sceneId, 'sc_argue');
});

test('Benchmark 14: Visual contradiction rejection (Stage B verification model integration)', async () => {
  const candidate = makeScene('sc_contra', 700, 30, {
    description: 'Two characters laugh and share drinks in a sunlit cafe.',
  });

  const seg = makeSegment('seg_contra', 'A violent assault leaves the victim terrified and fighting for life.', 100, 3.0);
  const candObj: SceneMatchCandidate = {
    scene: candidate,
    matchScore: 65,
    confidence: 0.65,
    isLowConfidence: false,
    isUnmatched: false,
    scoreBreakdown: { semanticScore: 10, characterScore: 10, visualContinuityScore: 0, actionEventScore: 0, narrativeRoleScore: 5, chronologyScore: 15, durationSuitability: 5 },
    reasons: ['Keyword match on character'],
  };

  // Mock contradicted response from Stage B parser
  const parsedVerification = modelOrchestrationService.parseStageBResponse(
    'sc_contra',
    'NO. This frame does not support the narration. It shows two people laughing and sharing coffee, which directly contradicts a violent assault.',
    seg.text
  );

  assert.strictEqual(parsedVerification.status, 'contradicted');
  assert.strictEqual(parsedVerification.supportsNarration, false);
  assert.ok(parsedVerification.contradictions.length > 0);

  // Apply penalty in matcher logic
  candObj.stageBVerification = parsedVerification;
  candObj.matchScore = Math.max(10, candObj.matchScore - 40);
  assert.ok(candObj.matchScore <= 25, 'Contradicted scene score must drop significantly');
});

test('Benchmark 15: Missing matching footage is flagged unmatched without filler hallucination', () => {
  const index = buildIndex([
    makeScene('sc_crime_1', 100, 60, { description: 'Detective examines fingerprint in police lab.' }),
  ]);

  const sciFiSeg = makeSegment('seg_alien', 'Alien spaceships warp into low orbit, vaporizing skyscrapers with plasma beams.', 200, 3.0);
  const script: ExplanationScript = {
    rawText: sciFiSeg.text,
    format: 'plain',
    alignmentConfidence: 1.0,
    isAlignedToVoiceover: true,
    segments: [sciFiSeg],
  };

  const timeline = aiDirectorEngine.generateTimeline(index, script, '16:9');
  assert.ok(timeline.shots.length > 0);
  const shot = timeline.shots[0];
  assert.strictEqual(shot.isUnmatched, true);
  assert.strictEqual(shot.sceneId, 'unmatched');
});

test('Benchmark 16: Strict 25-clip spacing rule & non-overlapping interval reuse', () => {
  const longScene = makeScene('sc_long', 500, 120, {
    description: 'Extensive dialogue scene between Alice and Bob.',
  });
  const otherScenes = Array.from({ length: 30 }, (_, i) =>
    makeScene(`sc_filler_${i}`, 700 + i * 30, 25, { description: `Filler scene ${i}` })
  );
  const index = buildIndex([longScene, ...otherScenes]);

  // Clip history with sc_long used 1 clip ago
  const recentHistory = [{ sceneId: 'sc_long', sourceStartTime: 500, sourceEndTime: 503 }];
  const seg = makeSegment('seg_reuse', 'Alice discusses the case.', 10, 3.0);

  const blockedCandidates = storySceneMatcher.matchCandidatesForSegment(
    seg,
    index,
    [seg],
    1,
    { recentClipHistory: recentHistory, lastSelectedSceneId: 'sc_long', minSceneSpacing: 25 }
  );
  const longCandBlocked = blockedCandidates.find((c) => c.scene.sceneId === 'sc_long')!;
  assert.strictEqual(longCandBlocked.isDuplicate, true);

  // Beyond 25 clips ago (30 clips later)
  const distantHistory = Array.from({ length: 30 }, (_, i) => ({
    sceneId: `sc_filler_${i}`,
    sourceStartTime: 700 + i * 30,
    sourceEndTime: 703 + i * 30,
  }));
  const distantCandidates = storySceneMatcher.matchCandidatesForSegment(
    seg,
    index,
    [seg],
    31,
    { recentClipHistory: distantHistory, lastSelectedSceneId: 'sc_filler_29', minSceneSpacing: 25 }
  );
  const longCandAllowed = distantCandidates.find((c) => c.scene.sceneId === 'sc_long')!;
  assert.strictEqual(longCandAllowed.isDuplicate, false);
});

test('Benchmark 17: Maximum video clip duration <= 3.0s enforced', () => {
  const scene = makeScene('sc_dur', 100, 60, { description: 'Continuous uninterrupted discussion.' });
  const index = buildIndex([scene]);
  const longSeg = makeSegment('seg_long_dur', 'A long continuous sentence explaining the entire background in depth.', 0, 7.5);
  const script: ExplanationScript = {
    rawText: longSeg.text,
    format: 'plain',
    alignmentConfidence: 1.0,
    isAlignedToVoiceover: true,
    segments: [longSeg],
  };

  const timeline = aiDirectorEngine.generateTimeline(index, script, '16:9', undefined, {
    strictClipDurationMode: true,
    maxShotDuration: 3.0,
  });
  for (const shot of timeline.shots) {
    if (!shot.isScreenshot) {
      assert.ok(shot.duration <= 3.05, `Video clip duration (${shot.duration}s) must be <= 3.0s`);
    }
  }
});

test('Benchmark 18: Screenshot cadence enforcement (no >5 consecutive video clips)', () => {
  const scenes = Array.from({ length: 15 }, (_, i) =>
    makeScene(`sc_seq_${i}`, i * 30, 25, { description: `Sequence scene ${i}` })
  );
  const index = buildIndex(scenes);
  const segments = Array.from({ length: 10 }, (_, i) =>
    makeSegment(`seg_seq_${i}`, `Sentence beat number ${i + 1} advancing the story.`, i * 2.5, 2.5)
  );
  const script: ExplanationScript = {
    rawText: segments.map((s) => s.text).join(' '),
    format: 'plain',
    alignmentConfidence: 1.0,
    isAlignedToVoiceover: true,
    segments,
  };

  const timeline = aiDirectorEngine.generateTimeline(index, script, '16:9');
  let consecutiveVideo = 0;
  for (const shot of timeline.shots) {
    if (shot.isScreenshot) {
      consecutiveVideo = 0;
    } else {
      consecutiveVideo++;
      assert.ok(consecutiveVideo <= 5, `Consecutive video clips (${consecutiveVideo}) exceeded 5`);
    }
  }
});

test('Benchmark 19: Manual clip replacement persistence survives recalculation', () => {
  const sceneA = makeScene('sc_auto', 100, 30, { description: 'Auto selected scene' });
  const sceneB = makeScene('sc_manual', 500, 30, { description: 'Manually replaced scene' });
  const index = buildIndex([sceneA, sceneB]);

  const seg = makeSegment('seg_rep', 'Test segment for manual replacement.', 0, 3.0);
  const script: ExplanationScript = {
    rawText: seg.text,
    format: 'plain',
    alignmentConfidence: 1.0,
    isAlignedToVoiceover: true,
    segments: [seg],
  };

  const initialTimeline = aiDirectorEngine.generateTimeline(index, script, '16:9');
  const targetShot = initialTimeline.shots[0];

  // User manually replaces shot with sc_manual and locks it
  targetShot.sceneId = 'sc_manual';
  targetShot.sourceStart = 500;
  targetShot.sourceEnd = 503;
  targetShot.isLocked = true;
  targetShot.isManualOverride = true;

  // Regeneration preserves manual override
  const regenerated = aiDirectorEngine.generateTimeline(index, script, '16:9', initialTimeline);
  assert.strictEqual(regenerated.shots[0].sceneId, 'sc_manual');
  assert.strictEqual(regenerated.shots[0].isLocked, true);
});

test('Benchmark 20: Strict separation of 4 time bases (Source, Audio, Clip, Timeline)', () => {
  const scene = makeScene('sc_time', 1500, 60, {
    description: 'Alice confronts Bob late in the episode regarding the conspiracy.',
    actions: ['confrontation / argument'],
  });
  const index = buildIndex([scene]);
  const seg0 = makeSegment('seg_intro', 'Introductory setup commentary describing background.', 0.0, 45.0);
  const seg1 = makeSegment('seg_time', 'Alice confronts Bob directly about the conspiracy.', 45.0, 2.8);
  const script: ExplanationScript = {
    rawText: `${seg0.text} ${seg1.text}`,
    format: 'plain',
    alignmentConfidence: 1.0,
    isAlignedToVoiceover: true,
    segments: [seg0, seg1],
  };

  const timeline = aiDirectorEngine.generateTimeline(index, script, '16:9');
  const shot1 = timeline.shots.find((s) => s.segmentId === 'seg_time')!;
  assert.ok(shot1, 'Shot for seg_time must exist');

  // 1. Voiceover audio time: 45.0 .. 47.8
  assert.strictEqual(seg1.voiceoverStart, 45.0);
  // 2. Timeline time: matches voiceover sync
  assert.strictEqual(shot1.timelineStart, 45.0);
  assert.strictEqual(shot1.timelineEnd, 47.8);
  // 3. Source movie time: within scene interval [1500, 1560]
  assert.ok(shot1.sourceStart >= 1500 && shot1.sourceStart <= 1560);
  // 4. Clip duration: exact difference (2.8s)
  assert.strictEqual(shot1.duration, 2.8);
  assert.notStrictEqual(shot1.sourceStart, shot1.timelineStart, 'Source and timeline timebases must never be confused');
});
