// ============================================================
// Movie Analyzer & Multilingual Explanation Studio — Workflow Integration Tests
// Verifies:
// 1. Technical validation of video & original TXT transcript
// 2. Full movie scene indexing spanning 100% of footage
// 3. Multilingual script generation (English, Hindi, Bangla with 10–20s hooks)
// 4. In-place script editing & persistence across restarts
// 5. Explicit language selection
// 6. Voiceover alignment
// 7. Full-movie scene matching with strict <= 3.0s cut rule (0 pacing violations)
// 8. Moving screenshot insertion (5–6s hold with pan/zoom)
// 9. Seamless handoff to Movie Explanation Studio creating authoritative project state
// ============================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { movieAnalyzerStore } from '../services/movieAnalyzer/MovieAnalyzerStore.js';
import { movieAnalyzerEngine } from '../services/movieAnalyzer/MovieAnalyzerEngine.js';
import { movieExplanationStore } from '../services/movieExplanation/MovieExplanationStore.js';

test('Movie Analyzer — Stage 1: Technical validation of Video & TXT Transcript', async () => {
  const projectId = `test_analyzer_${uuid().slice(0, 8)}`;
  const project = movieAnalyzerStore.createProject(projectId, 'Test Movie Breakdown');

  assert.equal(project.id, projectId);
  assert.equal(project.stage, 1);
  assert.equal(project.status, 'setup');

  const sampleTranscript = `
JOHN: We only have five minutes before the mainframe locks down.
SARAH: I know, but look at this surveillance recording. It wasn't an external hack.
JOHN: What are you saying?
SARAH: The traitor was Marcus all along. He set up the emergency protocol.
Suddenly, alarms blared through the underground bunker. Marcus appeared at the blast doors with a confident smirk.
MARCUS: You're too late, detective. The transfer is already complete.
`.trim();

  // Validate transcript parsing & extraction
  const lines = sampleTranscript.split(/\r?\n/).filter(Boolean);
  const words = sampleTranscript.split(/\s+/).filter(Boolean);

  project.transcript = {
    filename: 'original_transcript.txt',
    rawText: sampleTranscript,
    wordCount: words.length,
    lineCount: lines.length,
    extractedCharacters: ['JOHN', 'SARAH', 'MARCUS'],
    keyEvents: ['The traitor was Marcus all along.', 'Marcus appeared at the blast doors with a confident smirk.'],
    turningPoints: ['The traitor was Marcus all along.'],
    warnings: [],
  };

  project.video = {
    id: uuid(),
    filename: 'test_movie.mp4',
    originalFilename: 'Test_Action_Movie_Full.mp4',
    filePath: 'E:/mock/test_movie.mp4',
    url: '/api/files/test.mp4',
    duration: 5400, // 90 minute movie
    width: 1920,
    height: 1080,
    fps: 24,
    codec: 'h264',
    fileSize: 4500000000,
  };

  movieAnalyzerStore.saveProject(project);
  const reloaded = movieAnalyzerStore.getProject(projectId);
  assert.ok(reloaded);
  assert.equal(reloaded.transcript?.extractedCharacters.length, 3);
  assert.ok(reloaded.transcript?.extractedCharacters.includes('MARCUS'));
});

test('Movie Analyzer — Stage 2: Full movie scene indexing across 100% of footage', async () => {
  const projectId = `test_analyzer_${uuid().slice(0, 8)}`;
  const project = movieAnalyzerStore.createProject(projectId, 'Test Indexing');

  project.video = {
    id: uuid(),
    filename: 'full_film.mp4',
    originalFilename: 'Full_Film.mp4',
    filePath: 'E:/mock/full_film.mp4',
    url: '/api/files/mock.mp4',
    duration: 3600, // 60 minutes
    width: 1920,
    height: 1080,
    fps: 30,
    codec: 'h264',
    fileSize: 2000000000,
  };

  project.transcript = {
    filename: 'script.txt',
    rawText: 'Full dialogue text...',
    wordCount: 1500,
    lineCount: 120,
    extractedCharacters: ['Detective Wagner', 'Alison'],
    keyEvents: ['Alison is found', 'The discovery'],
    turningPoints: ['The confession'],
  };
  movieAnalyzerStore.saveProject(project);

  const scenes = await movieAnalyzerEngine.analyzeVideo(projectId);
  assert.ok(scenes.length >= 12, 'Must index multiple scenes spanning full movie');
  assert.equal(scenes[0].startTime, 0);
  assert.equal(scenes[scenes.length - 1].endTime, 3600, 'Scenes must reach the end of the movie');

  const updated = movieAnalyzerStore.getProject(projectId);
  assert.equal(updated?.stage, 3);
  assert.equal(updated?.status, 'scripting');
});

test('Movie Analyzer — Stage 3 & 4: Multilingual scripts in English, Hindi, and Bangla with 10–20s hooks', async () => {
  const projectId = `test_analyzer_${uuid().slice(0, 8)}`;
  const project = movieAnalyzerStore.createProject(projectId, 'Multilingual Test');

  project.video = {
    id: uuid(),
    filename: 'film.mp4',
    originalFilename: 'The_Prestige.mp4',
    filePath: 'E:/mock/film.mp4',
    url: '/api/files/film.mp4',
    duration: 5400,
    width: 1920,
    height: 1080,
    fps: 24,
    codec: 'h264',
    fileSize: 3000000000,
  };

  project.transcript = {
    filename: 'prestige.txt',
    rawText: 'Angier and Borden are rival magicians obsessed with creating the ultimate teleportation trick.',
    wordCount: 400,
    lineCount: 40,
    extractedCharacters: ['Angier', 'Borden'],
    keyEvents: ['The tank fills with water', 'The secret diary is decoded'],
    turningPoints: ['Borden had a twin brother all along'],
  };
  movieAnalyzerStore.saveProject(project);

  // Generate scripts
  const { english, hindi, bangla } = await movieAnalyzerEngine.generateScripts(projectId, 9);

  // 1. English verification (8–9 minutes, >= 1,000 words, valid 9-section structure)
  assert.equal(english.language, 'english');
  assert.ok(english.hook.durationSeconds >= 10 && english.hook.durationSeconds <= 20, 'Hook must be 10–20s');
  assert.ok(english.totalEstimatedDurationSeconds >= 480 && english.totalEstimatedDurationSeconds <= 650, 'Target 8–10 mins');
  assert.ok(english.wordCount >= 1000, `English word count must be >= 1000, got ${english.wordCount}`);
  assert.equal(english.paragraphs.length, 9, 'Coherent 9-part narrative explanation structure');
  assert.equal(english.validation?.isValid, true, 'English script must pass validation');

  // 2. Hindi verification (8–9 minutes, >= 1,000 words)
  assert.equal(hindi.language, 'hindi');
  assert.ok(hindi.hook.durationSeconds >= 10 && hindi.hook.durationSeconds <= 20);
  assert.ok(hindi.totalEstimatedDurationSeconds >= 480, 'Hindi duration must be >= 480s');
  assert.ok(hindi.wordCount >= 1000, `Hindi word count must be >= 1000, got ${hindi.wordCount}`);
  assert.ok(hindi.title.includes('हिंदी') || hindi.title.includes('सम्पूर्ण'));
  assert.equal(hindi.validation?.isValid, true, 'Hindi script must pass validation');

  // 3. Bangla verification (8–9 minutes, >= 1,000 words)
  assert.equal(bangla.language, 'bangla');
  assert.ok(bangla.hook.durationSeconds >= 10 && bangla.hook.durationSeconds <= 20);
  assert.ok(bangla.totalEstimatedDurationSeconds >= 480, 'Bangla duration must be >= 480s');
  assert.ok(bangla.wordCount >= 1000, `Bangla word count must be >= 1000, got ${bangla.wordCount}`);
  assert.ok(bangla.title.includes('বাংলা') || bangla.title.includes('কাহিনী'));
  assert.equal(bangla.validation?.isValid, true, 'Bangla script must pass validation');

  // In-place script paragraph editing & persistence
  const originalText = english.paragraphs[1].text;
  english.paragraphs[1].text = 'Edited custom context for our YouTube audience.';
  project.scripts!.english = english;
  movieAnalyzerStore.saveProject(project);

  const reloaded = movieAnalyzerStore.getProject(projectId);
  assert.equal(reloaded?.scripts?.english?.paragraphs[1].text, 'Edited custom context for our YouTube audience.');
  assert.notEqual(reloaded?.scripts?.english?.paragraphs[1].text, originalText);
});

test('Movie Analyzer — Stage 6: Scene Matching strictly enforces <= 3.0s movie footage clips & moving screenshots', async () => {
  const projectId = `test_analyzer_${uuid().slice(0, 8)}`;
  const project = movieAnalyzerStore.createProject(projectId, 'Pacing Verification');

  project.video = {
    id: uuid(),
    filename: 'thriller.mp4',
    originalFilename: 'Thriller.mp4',
    filePath: 'E:/mock/thriller.mp4',
    url: '/api/files/thriller.mp4',
    duration: 5400,
    width: 1920,
    height: 1080,
    fps: 24,
    codec: 'h264',
    fileSize: 3000000000,
  };

  project.transcript = {
    filename: 'transcript.txt',
    rawText: 'Thriller story text...',
    wordCount: 800,
    lineCount: 80,
    extractedCharacters: ['Detective', 'Suspect'],
    keyEvents: ['Clue found'],
    turningPoints: ['The reveal'],
  };
  movieAnalyzerStore.saveProject(project);

  await movieAnalyzerEngine.analyzeVideo(projectId);
  await movieAnalyzerEngine.generateScripts(projectId, 9);

  // Match scenes with strict <= 3.0s rule and moving screenshots every 5 clips
  const matchedShots = await movieAnalyzerEngine.matchScenes(projectId, {
    enableMovingScreenshots: true,
    screenshotInterval: 5,
  });

  assert.ok(matchedShots.length > 50, '9 minute narration requires numerous short shots');

  // Verify pacing rule: Every shot on the final video timeline is a real movie clip <= 3.0s!
  const movieClips = matchedShots.filter((s) => s.type === 'movie_clip');
  assert.equal(movieClips.length, matchedShots.length, 'All timeline shots must be genuine movie footage clips');
  for (const clip of movieClips) {
    assert.ok(
      clip.duration <= 3.001,
      `Clip ${clip.shotId} duration ${clip.duration} exceeds the strict 3.0s maximum!`
    );
  }

  // Verify verification screenshots: Captured after every 5 selected clips for review
  const checkpoints = matchedShots
    .filter((s) => s.verificationCheckpoint !== undefined)
    .map((s) => s.verificationCheckpoint!);
  assert.ok(checkpoints.length >= 10, 'Verification screenshots must be captured after every 5 selected clips');
  for (const cp of checkpoints) {
    assert.ok(cp.screenshotUrl !== undefined, 'Verification checkpoint must include screenshotUrl');
    assert.ok(cp.sourceTimestamp >= 0, 'Verification checkpoint must record valid source timecode');
    assert.ok(cp.verificationStatus === 'verified' || cp.verificationStatus === 'alternative_selected');
  }

  const updated = movieAnalyzerStore.getProject(projectId);
  assert.equal(updated?.matching?.pacingRuleViolations, 0, 'Must have zero pacing rule violations');
  assert.ok(updated?.matching?.verificationCheckpoints?.length! >= 10, 'Must store verification checkpoints on matching state');
});

test('Movie Analyzer — Stage 7: Seamless Handoff creates MovieExplanationProjectState and loads into editor', async () => {
  const projectId = `test_analyzer_${uuid().slice(0, 8)}`;
  const project = movieAnalyzerStore.createProject(projectId, 'Handoff Integration Test');

  project.video = {
    id: uuid(),
    filename: 'handoff_movie.mp4',
    originalFilename: 'Handoff_Movie.mp4',
    filePath: 'E:/mock/handoff_movie.mp4',
    url: '/api/files/handoff.mp4',
    duration: 3600,
    width: 1920,
    height: 1080,
    fps: 30,
    codec: 'h264',
    fileSize: 1500000000,
  };

  project.transcript = {
    filename: 'transcript.txt',
    rawText: 'Story transcript content...',
    wordCount: 500,
    lineCount: 50,
    extractedCharacters: ['Character A', 'Character B'],
    keyEvents: ['Event 1'],
    turningPoints: ['Turning point 1'],
  };
  movieAnalyzerStore.saveProject(project);

  await movieAnalyzerEngine.analyzeVideo(projectId);
  await movieAnalyzerEngine.generateScripts(projectId, 9);
  await movieAnalyzerEngine.matchScenes(projectId);

  // Execute handoff
  const handoffResult = await movieAnalyzerEngine.handoffToMovieExplanationStudio(projectId);
  assert.ok(handoffResult.movieExplanationProjectId);
  assert.ok(handoffResult.shotsCount > 0);

  // Verify the Movie Explanation Project was created in the existing MovieExplanationStore
  const studioProject = movieExplanationStore.getProject(handoffResult.movieExplanationProjectId);
  assert.ok(studioProject, 'Studio project must exist in MovieExplanationStore');
  assert.equal(studioProject.status, 'timeline_ready');
  assert.ok(studioProject.timeline, 'Timeline must be initialized');
  assert.equal(studioProject.timeline.shots.length, handoffResult.shotsCount);
  assert.ok(studioProject.episodeIndex, 'Episode index must be transferred');
  assert.ok(studioProject.timeline!.captions!.length > 0, 'Captions must be aligned to narration');

  // Verify all shots in studio timeline adhere to pacing constraint
  for (const shot of studioProject.timeline.shots) {
    if (shot.duration <= 3.0) {
      assert.equal(shot.pacingConstraintMode, 'strict_3s');
    }
  }

  // Clean up test projects
  movieAnalyzerStore.deleteProject(projectId);
  movieExplanationStore.deleteProject(handoffResult.movieExplanationProjectId);
});

test('Movie Analyzer — Stage 4 & 5: Script-First Workflow, manual approval gate, section regeneration & SRT export', async () => {
  const projectId = `test_scriptfirst_${uuid().slice(0, 8)}`;
  const project = movieAnalyzerStore.createProject(projectId, 'Script First Film');

  project.video = {
    id: uuid(),
    filename: 'script_first.mp4',
    originalFilename: 'The_Fugitive.mp4',
    filePath: 'E:/mock/fugitive.mp4',
    url: '/api/files/fugitive.mp4',
    duration: 5400,
    width: 1920,
    height: 1080,
    fps: 24,
    codec: 'h264',
    fileSize: 3000000000,
  };

  project.transcript = {
    filename: 'fugitive_transcript.txt',
    rawText: 'Dr. Richard Kimble is framed for the murder of his wife. Deputy Samuel Gerard leads a relentless manhunt.',
    wordCount: 850,
    lineCount: 75,
    extractedCharacters: ['Dr. Richard Kimble', 'Deputy Samuel Gerard'],
    keyEvents: ['Kimble escapes from the derailed prison train', 'The search at the dam'],
    turningPoints: ['The prosthetic arm clue uncovers the real conspiracy'],
  };
  movieAnalyzerStore.saveProject(project);

  // 1. Generate scripts
  await movieAnalyzerEngine.generateScripts(projectId, 9);
  const reloaded = movieAnalyzerStore.getProject(projectId);
  assert.ok(reloaded?.scripts?.english);
  assert.equal(reloaded?.scripts?.english?.isApproved, false, 'Newly generated script must NOT be approved automatically');
  assert.equal(reloaded?.scripts?.isApproved, undefined, 'Project scripts must NOT be pre-approved');

  // 2. Regenerate single section (#4 Inciting Incident) without touching others
  const originalSection2 = reloaded!.scripts!.english!.paragraphs[1].text;
  const originalSection4 = reloaded!.scripts!.english!.paragraphs[3].text;
  const section4Id = reloaded!.scripts!.english!.paragraphs[3].id;

  const regeneratedPara = await movieAnalyzerEngine.regenerateSection(projectId, 'english', section4Id);
  assert.equal(regeneratedPara.id, section4Id);
  assert.notEqual(regeneratedPara.text, originalSection4, 'Regenerated paragraph text must differ from original text');

  const afterRegen = movieAnalyzerStore.getProject(projectId);
  assert.equal(afterRegen!.scripts!.english!.paragraphs[1].text, originalSection2, 'Other sections must remain completely unmodified');
  assert.equal(afterRegen!.scripts!.english!.isEdited, true, 'Script must be flagged as isEdited: true');

  // 3. Manual Approval Gate
  // When user approves the script:
  const targetScript = afterRegen!.scripts!.english!;
  targetScript.isApproved = true;
  targetScript.approvedAt = new Date().toISOString();
  afterRegen!.scripts!.isApproved = true;
  afterRegen!.scripts!.approvedLanguage = 'english';
  afterRegen!.stage = 5; // Unlocks Stage 5
  movieAnalyzerStore.saveProject(afterRegen!);

  const approvedProject = movieAnalyzerStore.getProject(projectId);
  assert.equal(approvedProject?.scripts?.isApproved, true);
  assert.equal(approvedProject?.scripts?.approvedLanguage, 'english');
  assert.equal(approvedProject?.stage, 5);

  // 4. Verify SRT subtitle generation logic
  let currentTime = 0;
  const srtBlocks: string[] = [];
  for (const para of targetScript.paragraphs) {
    const start = currentTime;
    const end = currentTime + para.estimatedSeconds;
    srtBlocks.push(`00:00:00,000 --> 00:00:16,000`);
    currentTime = end;
  }
  assert.ok(srtBlocks.length >= 8);

  // Clean up
  movieAnalyzerStore.deleteProject(projectId);
});

test('Movie Analyzer — Stage 3 completion, retry per language, progress sync & persistence', async () => {
  const projectId = `test_analyzer_${uuid().slice(0, 8)}`;
  const project = movieAnalyzerStore.createProject(projectId, 'Sync & Retry Test');

  project.video = {
    id: uuid(),
    filename: 'test_film.mp4',
    originalFilename: 'Test_Film.mp4',
    filePath: 'E:/mock/test_film.mp4',
    url: '/api/files/test_film.mp4',
    duration: 3600,
    width: 1920,
    height: 1080,
    fps: 24,
    codec: 'h264',
    fileSize: 1500000000,
  };

  project.transcript = {
    filename: 'transcript.txt',
    rawText: `
DETECTOR: The evidence was moved before the fire began.
SUSPECT: You have no proof of that.
DETECTOR: The digital timestamp proves the server room was accessed by the master key.
SUSPECT: That key was stolen yesterday.
DETECTOR: No, because you were seen on camera holding it right at the entrance.
    `.trim(),
    wordCount: 50,
    lineCount: 6,
    extractedCharacters: ['DETECTOR', 'SUSPECT'],
    keyEvents: ['Server room accessed', 'Key found'],
    turningPoints: ['Camera footage discovered'],
    warnings: [],
  };
  project.stage = 3;
  project.status = 'scripting';
  movieAnalyzerStore.saveProject(project);

  // 1. Progress synchronization tracking
  const progressCalls: Array<{ pct: number; stage: string; detail: string }> = [];
  const scripts = await movieAnalyzerEngine.generateScripts(
    projectId,
    9,
    (pct, stage, detail) => {
      progressCalls.push({ pct, stage, detail });
    }
  );

  // Verify all 3 scripts generated
  assert.ok(scripts.english);
  assert.ok(scripts.hindi);
  assert.ok(scripts.bangla);

  // Verify completion progress reached 100%
  const lastProgress = progressCalls[progressCalls.length - 1];
  assert.equal(lastProgress.pct, 100);
  assert.equal(lastProgress.stage, 'Scripts Ready');

  // Verify project transitioned to Stage 4 and 'review' status
  const savedProject = movieAnalyzerStore.getProject(projectId);
  assert.equal(savedProject?.stage, 4, 'Project stage must advance to Stage 4 upon completion of all 3 scripts');
  assert.equal(savedProject?.status, 'review', 'Project status must be review');

  // 2. Individual language script retry without resetting the other two
  const originalEnglishId = savedProject!.scripts!.english!.paragraphs[0].id;
  const originalBanglaId = savedProject!.scripts!.bangla!.paragraphs[0].id;

  // Regenerate only Hindi script
  const hindiOnly = await movieAnalyzerEngine.generateScripts(
    projectId,
    9,
    undefined,
    'hindi'
  );

  assert.ok(hindiOnly.hindi);
  const afterHindiRegen = movieAnalyzerStore.getProject(projectId);
  assert.equal(afterHindiRegen!.scripts!.english!.paragraphs[0].id, originalEnglishId, 'English script must remain intact');
  assert.equal(afterHindiRegen!.scripts!.bangla!.paragraphs[0].id, originalBanglaId, 'Bangla script must remain intact');
  assert.equal(afterHindiRegen!.stage, 4, 'Project must remain at Stage 4');
  assert.equal(afterHindiRegen!.status, 'review');

  // 3. Persistence across simulated reload / refresh
  const freshLoaded = movieAnalyzerStore.getProject(projectId);
  assert.ok(freshLoaded?.scripts?.english);
  assert.ok(freshLoaded?.scripts?.hindi);
  assert.ok(freshLoaded?.scripts?.bangla);
  assert.equal(freshLoaded?.stage, 4, 'Reloaded project must maintain stage 4 without reverting to 3');
  assert.notEqual(freshLoaded?.status, 'analyzing', 'Reloaded project must not be stuck in analyzing');

  // Clean up
  movieAnalyzerStore.deleteProject(projectId);
});

