// ============================================================
// Movie & Series Explanation Studio — Comprehensive Test Suite
// Verifies all 14 test scenarios required in Section 26
// ============================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { config } from '../config/index.js';
import { scriptAlignmentEngine } from '../services/movieExplanation/ScriptAlignmentEngine.js';
import { storySceneMatcher } from '../services/movieExplanation/StorySceneMatcher.js';
import { aiDirectorEngine } from '../services/movieExplanation/AIDirectorEngine.js';
import { movieExplanationQualityGate } from '../services/movieExplanation/MovieExplanationQualityGate.js';
import { movieExplanationStore } from '../services/movieExplanation/MovieExplanationStore.js';
import { movieExplanationRenderer } from '../services/movieExplanation/MovieExplanationRenderer.js';
import { titleBumperDetector } from '../services/movieExplanation/TitleBumperDetector.js';
import { extractMetadata, extractAudio } from '../services/ffmpeg.js';
import type {
  EpisodeIntelligenceIndex,
  EpisodeScene,
  ExplanationScript,
  ExplanationScriptSegment,
  StoryMap,
} from '../../../shared/types.js';

// Mock Episode Intelligence Index representing a 45-minute episode (2700s)
export function createMockEpisodeIndex(): EpisodeIntelligenceIndex {
  const scenes: EpisodeScene[] = [
    {
      sceneId: 'sc_001',
      sceneIndex: 0,
      startTime: 0,
      endTime: 120,
      duration: 120,
      shotBoundaries: [0, 45, 90],
      dialogueSnippet: 'Welcome to Riverdale. A quiet town where nothing bad ever happens.',
      dialogueText: 'Welcome to Riverdale. A quiet town where nothing bad ever happens.',
      characters: ['Mark', 'Narrator'],
      location: 'street / urban alley',
      actions: ['steady narrative focus'],
      objectsAndEvidence: [],
      events: ['OPENING at 0m0s'],
      emotionalTone: 'neutral / expository',
      narrativePurpose: 'opening',
      description: 'Opening street atmosphere establishing the setting.',
      visualDetails: ['Duration: 120s'],
      isClueOrReveal: false,
      isQuietMotivational: false,
      isActionHeavy: false,
      importance: 'important',
      confidence: 0.95,
      thumbnailUrl: '/api/files/movie_explanation/mock/thumb1.jpg',
    },
    {
      sceneId: 'sc_002',
      sceneIndex: 1,
      startTime: 120,
      endTime: 300,
      duration: 180,
      shotBoundaries: [120, 180, 240],
      dialogueSnippet: 'Mark: I promise I will find out who did this to our family. No matter what.',
      dialogueText: 'Mark: I promise I will find out who did this to our family. No matter what.',
      characters: ['Mark', 'Sister'],
      location: 'home / apartment',
      actions: ['quiet conversation / confession'],
      objectsAndEvidence: [],
      events: ['SETUP at 2m0s'],
      emotionalTone: 'sorrowful / emotional',
      narrativePurpose: 'setup',
      description: 'Mark quietly promises his sister he will investigate, explaining his personal motivation.',
      visualDetails: ['Duration: 180s'],
      isClueOrReveal: false,
      isQuietMotivational: true, // Scenario 6: Quiet scene explaining character motivation
      isActionHeavy: false,
      importance: 'important',
      confidence: 0.92,
      thumbnailUrl: '/api/files/movie_explanation/mock/thumb2.jpg',
    },
    {
      sceneId: 'sc_003',
      sceneIndex: 2,
      startTime: 300,
      endTime: 420,
      duration: 120,
      shotBoundaries: [300, 340, 380],
      dialogueSnippet: 'Look at the glass on the floor. Someone broke in through the back.',
      dialogueText: 'Look at the glass on the floor. Someone broke in through the back.',
      characters: ['Mark'],
      location: 'office / boardroom',
      actions: ['investigation / examining clues'],
      objectsAndEvidence: ['shattered glass', 'incriminating document / letter'],
      events: ['CLUE at 5m0s'],
      emotionalTone: 'mysterious / questioning',
      narrativePurpose: 'clue',
      description: 'Investigating the crime scene, finding broken glass and an envelope.',
      visualDetails: ['Duration: 120s'],
      isClueOrReveal: true,
      isQuietMotivational: false,
      isActionHeavy: false,
      importance: 'critical',
      confidence: 0.94,
      thumbnailUrl: '/api/files/movie_explanation/mock/thumb3.jpg',
    },
    {
      sceneId: 'sc_004',
      sceneIndex: 3,
      startTime: 420,
      endTime: 600,
      duration: 180,
      shotBoundaries: [420, 480, 540],
      dialogueSnippet: 'Mark stares in utter shock at the photograph, unable to speak.',
      dialogueText: 'Mark stares in utter shock at the photograph, unable to speak.',
      characters: ['Mark'],
      location: 'police station / interrogation',
      actions: ['revelation / discovery'],
      objectsAndEvidence: ['photo / surveillance tape'],
      events: ['REACTION at 7m0s'],
      emotionalTone: 'sorrowful / emotional',
      narrativePurpose: 'reaction',
      description: 'Emotional reaction shot of Mark discovering the truth about his partner.',
      visualDetails: ['Duration: 180s'],
      isClueOrReveal: false,
      isQuietMotivational: true,
      isActionHeavy: false,
      importance: 'critical',
      confidence: 0.93,
      thumbnailUrl: '/api/files/movie_explanation/mock/thumb4.jpg',
    },
    {
      sceneId: 'sc_005',
      sceneIndex: 4,
      startTime: 1800,
      endTime: 2100,
      duration: 300,
      shotBoundaries: [1800, 1850, 1920, 2000],
      dialogueSnippet: 'Mark confronts the Chief: You were the mastermind all along!',
      dialogueText: 'Mark confronts the Chief: You were the mastermind all along!',
      characters: ['Mark', 'Chief'],
      location: 'warehouse / industrial',
      actions: ['confrontation / argument'],
      objectsAndEvidence: ['murder weapon / gun / knife'],
      events: ['REVEAL at 30m0s'],
      emotionalTone: 'tense / high stakes',
      narrativePurpose: 'reveal',
      description: 'The major revelation exposing the Chief as the conspirator.',
      visualDetails: ['Duration: 300s'],
      isClueOrReveal: true, // Major reveal that must not be spoiled prematurely
      isQuietMotivational: false,
      isActionHeavy: true,
      importance: 'critical',
      confidence: 0.96,
      thumbnailUrl: '/api/files/movie_explanation/mock/thumb5.jpg',
    },
    {
      sceneId: 'sc_006',
      sceneIndex: 5,
      startTime: 2100,
      endTime: 2500,
      duration: 400,
      shotBoundaries: [2100, 2150, 2220, 2300, 2400],
      dialogueSnippet: 'Mark tackles the Chief before he can fire!',
      dialogueText: 'Mark tackles the Chief before he can fire!',
      characters: ['Mark', 'Chief'],
      location: 'warehouse / industrial',
      actions: ['chase / pursuit', 'confrontation / argument'],
      objectsAndEvidence: ['murder weapon / gun / knife'],
      events: ['CLIMAX at 35m0s'],
      emotionalTone: 'tense / high stakes',
      narrativePurpose: 'climax',
      description: 'The intense final physical showdown between Mark and the Chief.',
      visualDetails: ['Duration: 400s'],
      isClueOrReveal: false,
      isQuietMotivational: false,
      isActionHeavy: true,
      importance: 'critical',
      confidence: 0.98,
      thumbnailUrl: '/api/files/movie_explanation/mock/thumb6.jpg',
    },
    {
      sceneId: 'sc_007',
      sceneIndex: 6,
      startTime: 2500,
      endTime: 2700,
      duration: 200,
      shotBoundaries: [2500, 2600],
      dialogueSnippet: 'With justice served, the city can finally breathe.',
      dialogueText: 'With justice served, the city can finally breathe.',
      characters: ['Mark', 'Sister'],
      location: 'street / urban alley',
      actions: ['steady narrative focus'],
      objectsAndEvidence: [],
      events: ['RESOLUTION at 41m40s'],
      emotionalTone: 'neutral / expository',
      narrativePurpose: 'resolution',
      description: 'Closing resolution with Mark and his sister visiting their parents cemetery.',
      visualDetails: ['Duration: 200s'],
      isClueOrReveal: false,
      isQuietMotivational: true,
      isActionHeavy: false,
      importance: 'important',
      confidence: 0.95,
      thumbnailUrl: '/api/files/movie_explanation/mock/thumb7.jpg',
    },
  ];

  const storyMap: StoryMap = {
    title: 'The Riverdale Conspiracy',
    logline: 'Mark investigates his family downfall and uncovers betrayal at the highest levels.',
    characters: [
      { id: 'c1', name: 'Mark', aliases: [], role: 'protagonist', description: 'Detective investigating case', firstAppearanceTime: 0 },
      { id: 'c2', name: 'Chief', aliases: [], role: 'antagonist', description: 'Corrupt chief', firstAppearanceTime: 1800 },
    ],
    characterRelationships: [{ from: 'Mark', to: 'Chief', relationship: 'Adversaries' }],
    openingSituation: 'Opening in Riverdale.',
    initialConflict: 'Family tragedy triggers investigation.',
    importantDiscoveries: ['Shattered glass at scene', 'Incriminating photograph'],
    mysteriesAndClues: ['Who broke into the office?'],
    risingTensionBeats: ['Chief attempts to shut down case'],
    majorTurningPoints: [],
    revelations: [],
    climaxSetup: 'Mark corners the suspect at the abandoned warehouse.',
    mainClimax: {
      id: 'cl1',
      title: 'Warehouse Showdown',
      description: 'Mark fights the Chief',
      timestampStart: 2100,
      timestampEnd: 2500,
      stage: 'climax',
      charactersInvolved: ['Mark', 'Chief'],
      isKeyReveal: false,
      isClimax: true,
      evidence: 'Scene 6',
    },
    consequences: ['Chief arrested'],
    resolution: 'City returns to peace.',
    confidence: 0.95,
  };

  const existingTestVideo = path.resolve(__dirname, '../../../test_nvenc.mp4');

  return {
    mediaId: 'test_media_123',
    originalVideoPath: existingTestVideo,
    filename: 'test_nvenc.mp4',
    duration: 2700,
    width: 1920,
    height: 1080,
    fps: 24,
    codec: 'h264',
    audioCodec: 'aac',
    bitrate: 8000000,
    fileSize: 2000000000,
    scenes,
    storyMap,
    indexedAt: new Date().toISOString(),
  };
}

// ── Test 1: Continuous Dialogue Scene (No 1-2s cuts) ──
test('Movie Explanation — Scenario 1: Continuous dialogue scene is not chopped every 1-2 seconds', () => {
  const episodeIndex = createMockEpisodeIndex();
  const script: ExplanationScript = {
    rawText: 'Mark sits down with his sister. He explains his deep motivations and promises that everything will be okay.',
    format: 'plain',
    alignmentConfidence: 0.95,
    isAlignedToVoiceover: true,
    segments: [
      {
        segmentId: 'seg_01',
        text: 'Mark sits down with his sister.',
        voiceoverStart: 0,
        voiceoverEnd: 6.5,
        duration: 6.5,
        sentenceIndex: 0,
        paragraphIndex: 0,
        eventsDescribed: [],
        narrativePurpose: 'setup',
        visualIntent: 'Dialogue scene',
        requiresMultiShot: false,
        targetShotCount: 1,
      },
      {
        segmentId: 'seg_02',
        text: 'He explains his deep motivations and promises that everything will be okay.',
        voiceoverStart: 6.5,
        voiceoverEnd: 15.0,
        duration: 8.5,
        sentenceIndex: 1,
        paragraphIndex: 0,
        eventsDescribed: [],
        narrativePurpose: 'reaction',
        visualIntent: 'Dialogue continuation',
        requiresMultiShot: false,
        targetShotCount: 1,
      },
    ],
  };

  const timeline = aiDirectorEngine.generateTimeline(episodeIndex, script);
  assert.ok(timeline.shots.length > 0, 'Timeline should contain shots');

  // Verify that shots are natural length (no 1-2s arbitrary cuts)
  for (const shot of timeline.shots) {
    assert.ok(shot.duration >= 3.0, `Shot ${shot.shotId} duration (${shot.duration}s) must not be a 1-2 second chop`);
  }
});

// ── Test 2: Sentence Describing Three Distinct Actions ──
test('Movie Explanation — Scenario 2: Sentence describing 3 distinct actions breaks into multiple shots', () => {
  const episodeIndex = createMockEpisodeIndex();
  const script: ExplanationScript = {
    rawText: 'He walks into the room, notices the broken glass, and suddenly realizes someone has been there.',
    format: 'plain',
    alignmentConfidence: 0.95,
    isAlignedToVoiceover: true,
    segments: [
      {
        segmentId: 'seg_multi',
        text: 'He walks into the room, notices the broken glass, and suddenly realizes someone has been there.',
        voiceoverStart: 0,
        voiceoverEnd: 10.5,
        duration: 10.5,
        sentenceIndex: 0,
        paragraphIndex: 0,
        eventsDescribed: [],
        narrativePurpose: 'clue',
        visualIntent: 'Multi-action progression',
        requiresMultiShot: true, // Marked by alignment engine
        targetShotCount: 3,      // 3 distinct shots
      },
    ],
  };

  const timeline = aiDirectorEngine.generateTimeline(episodeIndex, script);
  const shotsForSegment = timeline.shots.filter((s) => s.segmentId === 'seg_multi');

  assert.equal(shotsForSegment.length, 3, 'Multi-action sentence should generate 3 distinct shots');
  const totalDuration = shotsForSegment.reduce((acc, s) => acc + s.duration, 0);
  assert.ok(Math.abs(totalDuration - 10.5) < 0.1, 'Total shot duration should match narration duration');
});

// ── Test 3: Sentence Continuing Over One Existing Shot ──
test('Movie Explanation — Scenario 3: Continuation sentence holds over same source scene', () => {
  const episodeIndex = createMockEpisodeIndex();
  const script: ExplanationScript = {
    rawText: 'The conversation continues in the room. He listens carefully to every word she speaks.',
    format: 'plain',
    alignmentConfidence: 0.95,
    isAlignedToVoiceover: true,
    segments: [
      {
        segmentId: 'seg_a',
        text: 'The conversation continues in the room.',
        voiceoverStart: 0,
        voiceoverEnd: 5.0,
        duration: 5.0,
        sentenceIndex: 0,
        paragraphIndex: 0,
        eventsDescribed: [],
        narrativePurpose: 'setup',
        visualIntent: 'Conversation',
        requiresMultiShot: false,
        targetShotCount: 1,
      },
      {
        segmentId: 'seg_b',
        text: 'He listens carefully to every word she speaks.',
        voiceoverStart: 5.0,
        voiceoverEnd: 9.0,
        duration: 4.0,
        sentenceIndex: 1,
        paragraphIndex: 0,
        eventsDescribed: [],
        narrativePurpose: 'reaction',
        visualIntent: 'Reaction listening',
        requiresMultiShot: false,
        targetShotCount: 1,
      },
    ],
  };

  const timeline = aiDirectorEngine.generateTimeline(episodeIndex, script);
  assert.equal(timeline.shots.length, 2);
  // Both shots should preserve the same scene continuity
  assert.equal(timeline.shots[0].sceneId, timeline.shots[1].sceneId, 'Second shot should maintain continuity with first scene');
  assert.ok(timeline.shots[1].whyThisScene.fullSummary.includes('hold'), 'Rationale explains continuous hold');
});

// ── Test 4: Character Reaction Shot More Relevant Than Action Shot ──
test('Movie Explanation — Scenario 4: Character reaction is selected over action shot when realizing betrayal', () => {
  const episodeIndex = createMockEpisodeIndex();
  const segment: ExplanationScriptSegment = {
    segmentId: 'seg_react',
    text: 'He finally realizes that the person he trusted has been lying to him, leaving him in utter disbelief.',
    voiceoverStart: 100,
    voiceoverEnd: 108,
    duration: 8,
    sentenceIndex: 5,
    paragraphIndex: 1,
    eventsDescribed: [],
    narrativePurpose: 'reaction',
    visualIntent: 'Emotional reaction shot',
    requiresMultiShot: false,
    targetShotCount: 1,
  };

  const candidates = storySceneMatcher.matchCandidatesForSegment(
    segment,
    episodeIndex,
    [segment],
    0,
    new Set()
  );

  assert.ok(candidates.length > 0, 'Candidates should be matched');
  const topMatch = candidates[0];

  // The reaction scene (sc_004) should score higher than pure action scenes (sc_006)
  assert.equal(topMatch.scene.sceneId, 'sc_004', 'Reaction scene sc_004 should be selected for betrayal realization');
  assert.ok(topMatch.reasons.some((r) => r.includes('Reaction') || r.includes('emotional')), 'Reaction rationale highlighted');
});

// ── Test 5: Major Reveal Protection (Chronology Rule) ──
test('Movie Explanation — Scenario 5: Major reveal is guarded from premature selection in opening setup', () => {
  const episodeIndex = createMockEpisodeIndex();
  const openingSegment: ExplanationScriptSegment = {
    segmentId: 'seg_early',
    text: 'In the opening of the story, Mark is living a normal life as an ordinary investigator.',
    voiceoverStart: 5,
    voiceoverEnd: 15,
    duration: 10,
    sentenceIndex: 0,
    paragraphIndex: 0,
    eventsDescribed: [],
    narrativePurpose: 'setup',
    visualIntent: 'Early setup',
    requiresMultiShot: false,
    targetShotCount: 1,
  };

  const candidates = storySceneMatcher.matchCandidatesForSegment(
    openingSegment,
    episodeIndex,
    [openingSegment],
    0,
    new Set()
  );

  // The climax reveal scene (sc_005 at 30 min) must NOT be chosen for early setup!
  assert.notEqual(candidates[0].scene.sceneId, 'sc_005', 'Major reveal scene sc_005 must not appear during early setup');
});

// ── Test 6: Important Quiet Scene Explaining Character Motivation ──
test('Movie Explanation — Scenario 6: Quiet scene explaining character motivation is prioritized', () => {
  const episodeIndex = createMockEpisodeIndex();
  const motivationSegment: ExplanationScriptSegment = {
    segmentId: 'seg_motiv',
    text: 'He promises to avenge his family, motivated by the vow he made to his sister.',
    voiceoverStart: 25,
    voiceoverEnd: 35,
    duration: 10,
    sentenceIndex: 2,
    paragraphIndex: 0,
    eventsDescribed: [],
    narrativePurpose: 'setup',
    visualIntent: 'Emotional motivation',
    requiresMultiShot: false,
    targetShotCount: 1,
  };

  const candidates = storySceneMatcher.matchCandidatesForSegment(
    motivationSegment,
    episodeIndex,
    [motivationSegment],
    0,
    new Set()
  );

  assert.equal(candidates[0].scene.sceneId, 'sc_002', 'Quiet motivation scene sc_002 should be selected');
});

// ── Test 7: Narration With No Suitable Footage Flags Low Confidence ──
test('Movie Explanation — Scenario 7: Narration with no matching footage flags low confidence instead of inventing', () => {
  const episodeIndex = createMockEpisodeIndex();
  const unrelatedSegment: ExplanationScriptSegment = {
    segmentId: 'seg_unrelated',
    text: 'Suddenly an alien spaceship lands in the middle of the Sahara desert with laser beams.',
    voiceoverStart: 50,
    voiceoverEnd: 58,
    duration: 8,
    sentenceIndex: 3,
    paragraphIndex: 1,
    eventsDescribed: [],
    narrativePurpose: 'transition',
    visualIntent: 'Alien spaceship',
    requiresMultiShot: false,
    targetShotCount: 1,
  };

  const candidates = storySceneMatcher.matchCandidatesForSegment(
    unrelatedSegment,
    episodeIndex,
    [unrelatedSegment],
    0,
    new Set()
  );

  // Score should be low (< 48%) and marked isLowConfidence = true
  assert.ok(candidates[0].isLowConfidence, 'Unmatched segment should be flagged as low confidence');
  assert.ok(candidates[0].reasons.some((r) => r.includes('Low-confidence')), 'Contains low confidence reason');
});

// ── Test 8: Transcript-Voiceover Mismatch Warning ──
test('Movie Explanation — Scenario 8: Script that does not match voiceover produces a clear warning', async () => {
  // Pass a dummy script that has totally different words from the speech
  const scriptText = 'Quantum physics explains the curvature of spacetime across wormholes and black hole singularities.';
  const detectedFormat = scriptAlignmentEngine.detectFormat(scriptText);
  assert.equal(detectedFormat, 'plain');

  // Verify alignment engine detects discrepancy
  const validator = (scriptAlignmentEngine as any).validateCorrespondence(
    [{ text: scriptText }],
    'The detective walked into the room and found the weapon',
    60
  );

  assert.ok(validator.confidence < 0.5, 'Confidence should be low for mismatched text');
  assert.ok(validator.warning?.includes('Discrepancy detected'), 'Warning should explain discrepancy to user');
});

// ── Test 9 & 10: Locked Scene Preservation During Regeneration ──
test('Movie Explanation — Scenarios 9 & 10: Locked shots (🔒) are preserved during regeneration', () => {
  const episodeIndex = createMockEpisodeIndex();
  const script: ExplanationScript = {
    rawText: 'Scene one introduction. Scene two discovery. Scene three climax.',
    format: 'plain',
    alignmentConfidence: 0.95,
    isAlignedToVoiceover: true,
    segments: [
      { segmentId: 'seg_1', text: 'Scene one introduction.', voiceoverStart: 0, voiceoverEnd: 5, duration: 5, sentenceIndex: 0, paragraphIndex: 0, eventsDescribed: [], narrativePurpose: 'opening', visualIntent: '', requiresMultiShot: false, targetShotCount: 1 },
      { segmentId: 'seg_2', text: 'Scene two discovery.', voiceoverStart: 5, voiceoverEnd: 10, duration: 5, sentenceIndex: 1, paragraphIndex: 0, eventsDescribed: [], narrativePurpose: 'clue', visualIntent: '', requiresMultiShot: false, targetShotCount: 1 },
      { segmentId: 'seg_3', text: 'Scene three climax.', voiceoverStart: 10, voiceoverEnd: 15, duration: 5, sentenceIndex: 2, paragraphIndex: 0, eventsDescribed: [], narrativePurpose: 'climax', visualIntent: '', requiresMultiShot: false, targetShotCount: 1 },
    ],
  };

  // Initial timeline
  const initialTimeline = aiDirectorEngine.generateTimeline(episodeIndex, script);
  assert.equal(initialTimeline.shots.length, 3);

  // User manually locks shot #2 and replaces with sc_007
  initialTimeline.shots[1].sceneId = 'sc_007';
  initialTimeline.shots[1].isLocked = true; // 🔒 LOCKED
  initialTimeline.shots[1].isManualOverride = true;

  // Now trigger regeneration
  const regeneratedTimeline = aiDirectorEngine.generateTimeline(
    episodeIndex,
    script,
    '16:9',
    initialTimeline // Pass existing timeline to preserve locked shots
  );

  assert.equal(regeneratedTimeline.shots.length, 3);
  const shot2 = regeneratedTimeline.shots.find((s) => s.segmentId === 'seg_2');
  assert.ok(shot2, 'Shot 2 must exist');
  assert.equal(shot2.sceneId, 'sc_007', 'Shot 2 must remain sc_007 because it was locked!');
  assert.equal(shot2.isLocked, true, 'Locked status must be preserved');
});

// ── Test 11 & 12: Quality Gate & Native Resolution Preservation ──
test('Movie Explanation — Scenarios 11 & 12: 16-point Quality Gate validates sync and native resolution', () => {
  const episodeIndex = createMockEpisodeIndex();
  const script: ExplanationScript = {
    rawText: 'Mark arrives on the quiet street in Riverdale as the opening atmosphere establishes the town.',
    format: 'plain',
    alignmentConfidence: 0.95,
    isAlignedToVoiceover: true,
    segments: [
      {
        segmentId: 'seg_1',
        text: 'Mark arrives on the quiet street in Riverdale as the opening atmosphere establishes the town.',
        voiceoverStart: 0,
        voiceoverEnd: 60,
        duration: 60,
        sentenceIndex: 0,
        paragraphIndex: 0,
        eventsDescribed: [],
        narrativePurpose: 'setup',
        visualIntent: 'Opening town setting',
        requiresMultiShot: false,
        targetShotCount: 1,
      },
    ],
  };

  const timeline = aiDirectorEngine.generateTimeline(episodeIndex, script);
  const report = movieExplanationQualityGate.evaluateTimeline(timeline, 60, episodeIndex);

  assert.ok(report.checks.length >= 16, 'Quality Gate must run comprehensive checks (at least 16)');
  assert.equal(report.sourceResolutionPreserved, true, 'Source resolution must be preserved');
  assert.ok(report.overallReadinessScore >= 80, 'Well-formed timeline must achieve passing readiness score');
});

// ── Test 13: Project Persistence and Recovery ──
test('Movie Explanation — Scenario 13: Project state persists to disk and recovers cleanly', () => {
  const testProjectId = `test_proj_${Date.now()}`;
  const created = movieExplanationStore.createProject(testProjectId, 'Test Explanation Movie');
  assert.equal(created.projectId, testProjectId);

  // Update fields
  movieExplanationStore.updateProject(testProjectId, {
    status: 'timeline_ready',
    renderProgress: 100,
  });

  // Fetch from store
  const recovered = movieExplanationStore.getProject(testProjectId);
  assert.ok(recovered, 'Project must be recoverable from disk');
  assert.equal(recovered.status, 'timeline_ready');
  assert.equal(recovered.renderProgress, 100);

  // Clean up test project
  movieExplanationStore.deleteProject(testProjectId);
  const deleted = movieExplanationStore.getProject(testProjectId);
  assert.equal(deleted, null, 'Deleted project must not exist');
});

// ── Test 14: Complete End-to-End Master Render with Source Quality Preservation ──
test('Movie Explanation — Scenario 14: Complete master render produces synchronized MP4 with native resolution', async () => {
  const testSampleVideo = path.resolve(__dirname, '../../../test_sample_1080p.mp4');
  if (!fs.existsSync(testSampleVideo)) {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(config.ffmpegPath, [
        '-y',
        '-f', 'lavfi', '-i', 'testsrc=duration=4:size=1920x1080:rate=30',
        '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=4',
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-c:a', 'aac',
        '-pix_fmt', 'yuv420p',
        testSampleVideo,
      ]);
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Failed to generate test video: code ${code}`));
      });
      proc.on('error', reject);
    });
  }

  const testProjectId = `render_test_${Date.now()}`;
  movieExplanationStore.createProject(testProjectId, 'Render Test');

  // Extract small audio track from test video to serve as master voiceover
  const voiceoverAudioPath = await extractAudio(testSampleVideo, testProjectId);

  const timeline = {
    timelineId: 'tl_test_render',
    projectId: testProjectId,
    duration: 3.0,
    outputAspectRatio: '16:9' as const,
    outputWidth: 1920,
    outputHeight: 1080,
    outputFps: 30,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    shots: [
      {
        shotId: 'shot_r1',
        segmentId: 'seg_1',
        sceneId: 'sc_001',
        sourceFile: testSampleVideo,
        sourceStart: 0,
        sourceEnd: 1.5,
        timelineStart: 0,
        timelineEnd: 1.5,
        duration: 1.5,
        matchScore: 90,
        confidence: 0.9,
        isLowConfidence: false,
        whyThisScene: {
          characterMatch: 'Test match',
          actionMatch: 'Action match',
          storyContextReason: 'Opening shot',
          chronologyCheck: 'Verified',
          emotionalFit: 'Neutral',
          fullSummary: 'Test render shot 1',
        },
        transition: 'cut' as const,
        transitionDuration: 0.5,
        isLocked: false,
        isManualOverride: false,
        framingMode: 'action' as const,
      },
      {
        shotId: 'shot_r2',
        segmentId: 'seg_2',
        sceneId: 'sc_002',
        sourceFile: testSampleVideo,
        sourceStart: 1.5,
        sourceEnd: 3.0,
        timelineStart: 1.5,
        timelineEnd: 3.0,
        duration: 1.5,
        matchScore: 88,
        confidence: 0.88,
        isLowConfidence: false,
        whyThisScene: {
          characterMatch: 'Test match 2',
          actionMatch: 'Action match 2',
          storyContextReason: 'Continuation',
          chronologyCheck: 'Verified',
          emotionalFit: 'Neutral',
          fullSummary: 'Test render shot 2',
        },
        transition: 'cut' as const,
        transitionDuration: 0.5,
        isLocked: false,
        isManualOverride: false,
        framingMode: 'action' as const,
      },
    ],
  };

  const renderResult = await movieExplanationRenderer.renderExplanationVideo(
    testProjectId,
    timeline,
    voiceoverAudioPath
  );

  assert.ok(fs.existsSync(renderResult.outputPath), 'Rendered output file must exist on disk');
  assert.ok(renderResult.fileSize > 10000, 'Rendered file must have valid non-zero size');

  const meta = await extractMetadata(renderResult.outputPath);
  assert.equal(meta.width, 1920, 'Output width must preserve 1920 native resolution');
  assert.equal(meta.height, 1080, 'Output height must preserve 1080 native resolution');
  assert.ok(Math.abs(meta.duration - 3.0) < 0.5, `Rendered duration (${meta.duration}s) must match voiceover timeline duration (3.0s)`);

  // Cleanup
  movieExplanationStore.deleteProject(testProjectId);
  try { fs.unlinkSync(renderResult.outputPath); } catch {}
  try { fs.unlinkSync(testSampleVideo); } catch {}
});

test('Movie Explanation — Scenario 15: Non-narrative title card, definition slate, and bumper clips are eliminated', async () => {
  // 1. TitleBumperDetector correctly identifies title card/slate vs natural scene
  const titleSlateCheck = titleBumperDetector.isSceneTitleOrBumper({
    sceneId: 'sc_title',
    sceneIndex: 0,
    startTime: 0,
    endTime: 16,
    duration: 16,
    shotBoundaries: [0],
    dialogueSnippet: '',
    characters: [],
    actions: ['static title / slate display'],
    objectsAndEvidence: ['readable text / signs'],
    events: ['TITLE CARD at 0m0s'],
    emotionalTone: 'neutral / expository',
    narrativePurpose: 'title_or_bumper',
    description: 'A black screen displaying the word "MENTALIST" in white text.',
    visualDetails: ['Monochrome black background', 'White text'],
    isClueOrReveal: false,
    isQuietMotivational: false,
    isActionHeavy: false,
    importance: 'unnecessary',
    confidence: 1.0,
    isTitleOrBumper: true,
    isExcludedFromNarration: true,
  });
  assert.equal(titleSlateCheck, true, 'Title card / definition slate must be identified as title/bumper');

  // 2. StorySceneMatcher rejects title card / bumper with 0 score
  const mockIndex = createMockEpisodeIndex();
  // Add a bumper scene at the beginning
  const bumperScene: EpisodeScene = {
    sceneId: 'sc_bumper_001',
    sceneIndex: 0,
    startTime: 0,
    endTime: 16,
    duration: 16,
    shotBoundaries: [0],
    dialogueSnippet: '',
    dialogueText: '',
    characters: [],
    location: 'Title Card / Slate',
    actions: ['static title display'],
    objectsAndEvidence: ['readable text / signs'],
    events: ['TITLE at 0m0s'],
    emotionalTone: 'neutral / expository',
    narrativePurpose: 'title_or_bumper',
    description: 'Black screen displaying title definition slate.',
    visualDetails: [],
    isClueOrReveal: false,
    isQuietMotivational: false,
    isActionHeavy: false,
    importance: 'unnecessary',
    confidence: 1.0,
    isTitleOrBumper: true,
    isExcludedFromNarration: true,
  };
  mockIndex.scenes.unshift(bumperScene);
  mockIndex.narrativeStartTime = 16.0;

  const openingSegment: ExplanationScriptSegment = {
    segmentId: 'seg_open',
    text: 'In the quiet morning fog, a hunter stalks his prey through a quiet vineyard.',
    voiceoverStart: 0,
    voiceoverEnd: 5.0,
    duration: 5.0,
    sentenceIndex: 0,
    paragraphIndex: 0,
    eventsDescribed: ['hunting in vineyard'],
    narrativePurpose: 'opening',
    visualIntent: 'hunter in vineyard',
    requiresMultiShot: false,
    targetShotCount: 1,
  };

  const matches = storySceneMatcher.matchCandidatesForSegment(
    openingSegment,
    mockIndex,
    [openingSegment],
    0,
    new Set()
  );

  const bumperMatch = matches.find((m) => m.scene.sceneId === 'sc_bumper_001');
  assert.ok(bumperMatch, 'Bumper candidate must be evaluated');
  assert.equal(bumperMatch.matchScore, 0, 'Bumper candidate must receive matchScore = 0');

  // 3. AIDirectorEngine must not select bumper and must enforce narrativeStartTime
  const script: ExplanationScript = {
    rawText: openingSegment.text,
    format: 'plain',
    alignmentConfidence: 1.0,
    isAlignedToVoiceover: true,
    segments: [openingSegment],
  };

  const timeline = aiDirectorEngine.generateTimeline(mockIndex, script, '16:9');
  assert.ok(timeline.shots.length > 0, 'Timeline must generate shots');
  for (const shot of timeline.shots) {
    assert.notEqual(shot.sceneId, 'sc_bumper_001', 'Timeline must never select bumper scene');
    assert.ok(
      shot.sourceStart >= mockIndex.narrativeStartTime,
      `Shot sourceStart (${shot.sourceStart}s) must be >= narrativeStartTime (${mockIndex.narrativeStartTime}s)`
    );
  }

  // 4. Quality Gate passes Check 6 (Black Frame & Title/Bumper Elimination)
  const qualityReport = movieExplanationQualityGate.evaluateTimeline(timeline, 5.0, mockIndex);
  const chk6 = qualityReport.checks.find((c) => c.id === 'chk_6_black_frames');
  assert.ok(chk6, 'Quality Gate must include Check 6');
  assert.equal(chk6.status, 'pass', 'Check 6 must pass for clean episodic footage');
});

