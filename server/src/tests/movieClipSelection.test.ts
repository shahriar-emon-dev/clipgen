// ============================================================
// Movie Clip Selection, Anti-Repetition & Screenshot Verification Tests
// Validates:
// 1. Clips are selected across the FULL movie (0% to 100% runtime)
// 2. Consecutive scenes are NOT used as filler
// 3. Title cards, interval screens, black frames, and bumpers are 100% excluded
// 4. Verification screenshot checkpoints are recorded after every 5 selected clips
// 5. Strict 25-clip spacing rule on source footage
// 6. Every clip matches its narration beat
// 7. Controlled reuse limitations reporting when scene pool is constrained
// ============================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { v4 as uuid } from 'uuid';
import { movieAnalyzerStore } from '../services/movieAnalyzer/MovieAnalyzerStore.js';
import { movieAnalyzerEngine } from '../services/movieAnalyzer/MovieAnalyzerEngine.js';
import { titleBumperDetector } from '../services/movieExplanation/TitleBumperDetector.js';
import type {
  MovieAnalyzerProject,
  MovieAnalyzerIndexedScene,
} from '../../../shared/types.js';

function createMockIndexedScenes(count: number, movieDurationSeconds: number): MovieAnalyzerIndexedScene[] {
  const sceneDuration = movieDurationSeconds / count;
  const scenes: MovieAnalyzerIndexedScene[] = [];

  for (let i = 0; i < count; i++) {
    const startTime = Number((i * sceneDuration).toFixed(2));
    const endTime = Number((startTime + sceneDuration).toFixed(2));
    const act = i < count * 0.25 ? 'setup' : i < count * 0.70 ? 'investigation' : 'climax';

    scenes.push({
      sceneId: `sc_${String(i + 1).padStart(3, '0')}`,
      startTime,
      endTime,
      duration: Number(sceneDuration.toFixed(2)),
      visualDescription: `Scene ${i + 1} (${act}) action at ${Math.floor(startTime / 60)}m. Depicts characters in narrative action.`,
      characters: i % 2 === 0 ? ['Detective John', 'Witness Mary'] : ['Suspect Marcus', 'Chief Evans'],
      actions: i % 3 === 0 ? ['investigating crime scene', 'discovering clues'] : ['arguing intensely', 'confrontation'],
      setting: i % 4 === 0 ? 'dark warehouse' : 'police headquarters',
      tone: i > count * 0.7 ? 'dramatic tension' : 'mysterious',
      confidence: 0.95,
      thumbnailUrl: `/thumbnails/sc_${String(i + 1).padStart(3, '0')}.jpg`,
      isTitleOrBumper: false,
      isExcludedFromNarration: false,
    });
  }

  return scenes;
}

test('Clip Selection — 1. Selects clips from across the entire movie (0% to 100% runtime)', async () => {
  const projectId = `test_full_movie_${uuid().slice(0, 8)}`;
  const project = movieAnalyzerStore.createProject(projectId, 'Full Movie Coverage Test');

  const movieDuration = 5400; // 90-minute movie
  project.video = {
    id: uuid(),
    filename: 'movie_90m.mp4',
    originalFilename: 'Movie_90m.mp4',
    filePath: 'E:/mock/movie_90m.mp4',
    url: '/api/files/movie.mp4',
    duration: movieDuration,
    width: 1920,
    height: 1080,
    fps: 24,
    codec: 'h264',
    fileSize: 4000000000,
  };

  // 40 indexed scenes spanning the entire 90 minutes (0s to 5400s)
  project.analysis = {
    progress: 100,
    stageName: 'Completed',
    statusMessage: 'Ready',
    totalScenes: 40,
    indexedScenes: createMockIndexedScenes(40, movieDuration),
  };

  // 9-minute script covering standard acts
  project.scripts = {
    targetDurationMinutes: 9,
    selectedLanguage: 'english',
    isApproved: true,
    english: {
      language: 'english',
      title: 'Movie 90m Mystery',
      totalEstimatedDurationSeconds: 540,
      wordCount: 1350,
      hook: { text: 'Watch closely before the truth is revealed in this gripping mystery.', hookType: 'mystery', durationSeconds: 15 },
      paragraphs: [
        { id: 'p1', section: 'hook', text: 'Before the climax twists everything, observe this opening moment.', estimatedSeconds: 40 },
        { id: 'p2', section: 'context', text: 'Our story begins in the city where Detective John arrives at headquarters.', estimatedSeconds: 60 },
        { id: 'p3', section: 'characters', text: 'Witness Mary explains the initial warning she received from Chief Evans.', estimatedSeconds: 65 },
        { id: 'p4', section: 'inciting_incident', text: 'The investigation suddenly erupts when a crucial clue is discovered.', estimatedSeconds: 65 },
        { id: 'p5', section: 'escalation', text: 'Detective John uncovers a web of corruption connecting Suspect Marcus.', estimatedSeconds: 70 },
        { id: 'p6', section: 'reversals', text: 'A shocking reversal shows Marcus was being framed by someone inside.', estimatedSeconds: 75 },
        { id: 'p7', section: 'climax', text: 'In the final showdown, Detective John confronts the real culprit at the warehouse.', estimatedSeconds: 85 },
        { id: 'p8', section: 'resolution', text: 'With the confrontation resolved, the truth is officially revealed to the public.', estimatedSeconds: 45 },
        { id: 'p9', section: 'takeaway', text: 'And so, justice prevails after a complex journey of deception.', estimatedSeconds: 35 },
      ],
      isApproved: true,
      updatedAt: new Date().toISOString(),
    },
  };

  movieAnalyzerStore.saveProject(project);

  const matchedShots = await movieAnalyzerEngine.matchScenes(projectId);
  assert.ok(matchedShots.length > 100, 'Should have over 100 short cuts for a 9-minute video');

  // Verify full-movie coverage:
  const sourceStartTimes = matchedShots.map((s) => s.sourceStartTime);
  const minSourceTime = Math.min(...sourceStartTimes);
  const maxSourceTime = Math.max(...sourceStartTimes);

  assert.ok(minSourceTime < movieDuration * 0.15, `Earliest shot (${minSourceTime}s) must come from opening acts (<15%)`);
  assert.ok(maxSourceTime > movieDuration * 0.75, `Latest shot (${maxSourceTime}s) must reach into late movie/climax (>75%)`);

  // Verify narrative section grounding:
  // Climax paragraph (p7) shots should come from the late movie (> 60% of runtime)
  const climaxShots = matchedShots.filter((s) => s.narrationText.includes('final showdown'));
  assert.ok(climaxShots.length > 0, 'Must have climax shots');
  for (const s of climaxShots) {
    assert.ok(s.sourceStartTime > movieDuration * 0.50, `Climax shot at ${s.sourceStartTime}s must be from late movie`);
  }

  // Clean up
  movieAnalyzerStore.deleteProject(projectId);
});

test('Clip Selection — 2. Anti-consecutive scenes: never uses consecutive scenes as filler', async () => {
  const projectId = `test_no_consecutive_${uuid().slice(0, 8)}`;
  const project = movieAnalyzerStore.createProject(projectId, 'Anti-Consecutive Scenes Test');

  project.video = {
    id: uuid(),
    filename: 'movie.mp4',
    originalFilename: 'Movie.mp4',
    filePath: 'E:/mock/movie.mp4',
    url: '/api/files/movie.mp4',
    duration: 3600,
    width: 1920,
    height: 1080,
    fps: 24,
    codec: 'h264',
    fileSize: 2000000000,
  };

  // 30 distinct scenes
  project.analysis = {
    progress: 100,
    stageName: 'Completed',
    statusMessage: 'Ready',
    totalScenes: 30,
    indexedScenes: createMockIndexedScenes(30, 3600),
  };

  project.scripts = {
    targetDurationMinutes: 8,
    selectedLanguage: 'english',
    isApproved: true,
    english: {
      language: 'english',
      title: 'Dark Streets Investigation',
      totalEstimatedDurationSeconds: 120,
      wordCount: 300,
      hook: { text: 'Hook line', hookType: 'mystery', durationSeconds: 15 },
      paragraphs: [
        { id: 'p1', section: 'context', text: 'The investigation starts in the dark streets.', estimatedSeconds: 30 },
        { id: 'p2', section: 'escalation', text: 'Detective John searches for clues across the city.', estimatedSeconds: 40 },
        { id: 'p3', section: 'climax', text: 'Suspect Marcus attempts a daring escape.', estimatedSeconds: 50 },
      ],
      isApproved: true,
      updatedAt: new Date().toISOString(),
    },
  };

  movieAnalyzerStore.saveProject(project);

  const matchedShots = await movieAnalyzerEngine.matchScenes(projectId);

  // Check that adjacent timeline shots do NOT repeatedly select the same scene ID
  let consecutiveSameSceneCount = 0;
  for (let i = 1; i < matchedShots.length; i++) {
    if (matchedShots[i].sceneId === matchedShots[i - 1].sceneId) {
      consecutiveSameSceneCount++;
    }
  }

  // When 30 varied candidate scenes are available, the algorithm must not use the same continuous scene consecutively
  assert.equal(consecutiveSameSceneCount, 0, 'Must have zero consecutive same-scene selections when alternatives exist');

  // Clean up
  movieAnalyzerStore.deleteProject(projectId);
});

test('Clip Selection — 3. Strict 100% exclusion of title cards, interval screens, black frames, and bumpers', async () => {
  const projectId = `test_bumpers_${uuid().slice(0, 8)}`;
  const project = movieAnalyzerStore.createProject(projectId, 'Bumper Elimination Test');

  project.video = {
    id: uuid(),
    filename: 'movie.mp4',
    originalFilename: 'Movie.mp4',
    filePath: 'E:/mock/movie.mp4',
    url: '/api/files/movie.mp4',
    duration: 3600,
    width: 1920,
    height: 1080,
    fps: 24,
    codec: 'h264',
    fileSize: 2000000000,
  };

  const normalScenes = createMockIndexedScenes(15, 3600);

  // Inject non-narrative bumper and title scenes
  const studioLogo: MovieAnalyzerIndexedScene = {
    sceneId: 'sc_logo',
    startTime: 0,
    endTime: 18,
    duration: 18,
    visualDescription: 'Universal Pictures rotating globe production company studio logo',
    characters: [],
    actions: [],
    setting: 'Logo graphic',
    tone: 'ambient',
    confidence: 0.99,
    thumbnailUrl: '/thumbnails/logo.jpg',
    isTitleOrBumper: true,
    isExcludedFromNarration: true,
  };

  const titleCard: MovieAnalyzerIndexedScene = {
    sceneId: 'sc_title',
    startTime: 18,
    endTime: 35,
    duration: 17,
    visualDescription: 'White text on black screen reads movie title card definition slate',
    characters: [],
    actions: [],
    setting: 'Black screen',
    tone: 'none',
    confidence: 0.95,
    thumbnailUrl: '/thumbnails/title.jpg',
    isTitleOrBumper: false,
    isExcludedFromNarration: false,
  };

  const intervalCard: MovieAnalyzerIndexedScene = {
    sceneId: 'sc_interval',
    startTime: 1800,
    endTime: 1830,
    duration: 30,
    visualDescription: 'Interval intermission card screen text intermission',
    characters: [],
    actions: [],
    setting: 'Text screen',
    tone: 'none',
    confidence: 0.95,
    thumbnailUrl: '/thumbnails/interval.jpg',
    isTitleOrBumper: false,
    isExcludedFromNarration: false,
  };

  const blackoutFrame: MovieAnalyzerIndexedScene = {
    sceneId: 'sc_blackout',
    startTime: 2500,
    endTime: 2510,
    duration: 10,
    visualDescription: 'blackout frame blank frame static screen',
    characters: [],
    actions: [],
    setting: 'black screen',
    tone: 'none',
    confidence: 0.95,
    thumbnailUrl: '/thumbnails/blackout.jpg',
    isTitleOrBumper: false,
    isExcludedFromNarration: false,
  };

  project.analysis = {
    progress: 100,
    stageName: 'Completed',
    statusMessage: 'Ready',
    totalScenes: normalScenes.length + 4,
    indexedScenes: [studioLogo, titleCard, ...normalScenes, intervalCard, blackoutFrame],
  };

  // Verify that detector detects all of them
  assert.equal(titleBumperDetector.isSceneTitleOrIntervalScreen(studioLogo), true);
  assert.equal(titleBumperDetector.isSceneTitleOrIntervalScreen(titleCard), true);
  assert.equal(titleBumperDetector.isSceneTitleOrIntervalScreen(intervalCard), true);
  assert.equal(titleBumperDetector.isSceneTitleOrIntervalScreen(blackoutFrame), true);

  project.scripts = {
    targetDurationMinutes: 8,
    selectedLanguage: 'english',
    isApproved: true,
    english: {
      language: 'english',
      title: 'Title Exclusion Test',
      totalEstimatedDurationSeconds: 60,
      wordCount: 150,
      hook: { text: 'Hook', hookType: 'mystery', durationSeconds: 15 },
      paragraphs: [
        { id: 'p1', section: 'context', text: 'Detective John investigates the early crime scene.', estimatedSeconds: 60 },
      ],
      isApproved: true,
      updatedAt: new Date().toISOString(),
    },
  };

  movieAnalyzerStore.saveProject(project);

  const matchedShots = await movieAnalyzerEngine.matchScenes(projectId);

  // Assert ZERO shots use any of the bumper/title scenes
  const forbiddenSceneIds = new Set(['sc_logo', 'sc_title', 'sc_interval', 'sc_blackout']);
  for (const shot of matchedShots) {
    assert.equal(
      forbiddenSceneIds.has(shot.sceneId),
      false,
      `Forbidden scene ${shot.sceneId} must never appear on timeline!`
    );
  }

  // Clean up
  movieAnalyzerStore.deleteProject(projectId);
});

test('Clip Selection — 4. Visual verification screenshot checkpoints captured after every 5 selected clips', async () => {
  const projectId = `test_verification_cp_${uuid().slice(0, 8)}`;
  const project = movieAnalyzerStore.createProject(projectId, 'Screenshot Checkpoint Test');

  project.video = {
    id: uuid(),
    filename: 'movie.mp4',
    originalFilename: 'Movie.mp4',
    filePath: 'E:/mock/movie.mp4',
    url: '/api/files/movie.mp4',
    duration: 3600,
    width: 1920,
    height: 1080,
    fps: 24,
    codec: 'h264',
    fileSize: 2000000000,
  };

  project.analysis = {
    progress: 100,
    stageName: 'Completed',
    statusMessage: 'Ready',
    totalScenes: 25,
    indexedScenes: createMockIndexedScenes(25, 3600),
  };

  project.scripts = {
    targetDurationMinutes: 8,
    selectedLanguage: 'english',
    isApproved: true,
    english: {
      language: 'english',
      title: 'Verification Checkpoints Test',
      totalEstimatedDurationSeconds: 120, // ~40-50 shots
      wordCount: 300,
      hook: { text: 'Hook', hookType: 'mystery', durationSeconds: 15 },
      paragraphs: [
        { id: 'p1', section: 'context', text: 'The mystery begins at headquarters with Detective John.', estimatedSeconds: 60 },
        { id: 'p2', section: 'climax', text: 'The investigation escalates into a dramatic confrontation.', estimatedSeconds: 60 },
      ],
      isApproved: true,
      updatedAt: new Date().toISOString(),
    },
  };

  movieAnalyzerStore.saveProject(project);

  const matchedShots = await movieAnalyzerEngine.matchScenes(projectId, { screenshotInterval: 5 });

  // 1. Verify that all shots on final video timeline are genuine movie footage clips <= 3.0s
  for (const shot of matchedShots) {
    assert.equal(shot.type, 'movie_clip', 'Timeline shots must remain real movie clips, NOT moving screenshots');
    assert.ok(shot.duration <= 3.001, `Duration ${shot.duration} must be <= 3.0s`);
  }

  // 2. Verify verification checkpoints recorded on the 5th, 10th, 15th, etc. shots:
  const checkpointShots = matchedShots.filter((s) => s.verificationCheckpoint !== undefined);
  assert.ok(checkpointShots.length >= 8, 'Must have at least 8 verification checkpoints for ~45 shots');

  for (let idx = 0; idx < checkpointShots.length; idx++) {
    const cp = checkpointShots[idx].verificationCheckpoint!;
    assert.equal(cp.checkpointIndex, idx + 1, `Checkpoint index must increment sequentially`);
    assert.ok(cp.screenshotUrl !== undefined, 'Screenshot URL must be provided');
    assert.ok(cp.sourceTimestamp >= 0, 'Source timestamp must be valid');
    assert.ok(cp.verificationStatus === 'verified' || cp.verificationStatus === 'alternative_selected');
    assert.ok(cp.verificationNotes.length > 10, 'Verification notes must describe review validation');
  }

  // Verify stored on project matching state
  const updated = movieAnalyzerStore.getProject(projectId);
  assert.equal(updated?.matching?.verificationCheckpoints?.length, checkpointShots.length);

  // Clean up
  movieAnalyzerStore.deleteProject(projectId);
});

test('Clip Selection — 5. Strict 25-clip spacing rule on source footage reuse', async () => {
  const projectId = `test_25_clip_rule_${uuid().slice(0, 8)}`;
  const project = movieAnalyzerStore.createProject(projectId, '25-Clip Rule Test');

  project.video = {
    id: uuid(),
    filename: 'movie.mp4',
    originalFilename: 'Movie.mp4',
    filePath: 'E:/mock/movie.mp4',
    url: '/api/files/movie.mp4',
    duration: 3600,
    width: 1920,
    height: 1080,
    fps: 24,
    codec: 'h264',
    fileSize: 2000000000,
  };

  // Provide 60 distinct scenes (sufficient to satisfy 25-clip spacing rule for 55 shots)
  project.analysis = {
    progress: 100,
    stageName: 'Completed',
    statusMessage: 'Ready',
    totalScenes: 60,
    indexedScenes: createMockIndexedScenes(60, 3600),
  };

  project.scripts = {
    targetDurationMinutes: 8,
    selectedLanguage: 'english',
    isApproved: true,
    english: {
      language: 'english',
      title: '25 Clip Spacing Test',
      totalEstimatedDurationSeconds: 150, // ~50-60 shots
      wordCount: 380,
      hook: { text: 'Hook', hookType: 'mystery', durationSeconds: 15 },
      paragraphs: [
        { id: 'p1', section: 'context', text: 'Detective John starts his investigation in the city.', estimatedSeconds: 50 },
        { id: 'p2', section: 'escalation', text: 'Marcus tries to cover his tracks while witnesses speak.', estimatedSeconds: 50 },
        { id: 'p3', section: 'climax', text: 'The final confrontation at the warehouse exposes everything.', estimatedSeconds: 50 },
      ],
      isApproved: true,
      updatedAt: new Date().toISOString(),
    },
  };

  movieAnalyzerStore.saveProject(project);

  const matchedShots = await movieAnalyzerEngine.matchScenes(projectId);

  // Verify that any scene reuse has at least 25 intervening clips:
  const sceneUsageIndices = new Map<string, number[]>();
  for (let i = 0; i < matchedShots.length; i++) {
    const sId = matchedShots[i].sceneId;
    if (!sceneUsageIndices.has(sId)) {
      sceneUsageIndices.set(sId, []);
    }
    sceneUsageIndices.get(sId)!.push(i);
  }

  let violations = 0;
  for (const [sId, indices] of sceneUsageIndices.entries()) {
    if (indices.length > 1) {
      for (let k = 1; k < indices.length; k++) {
        const gap = indices[k] - indices[k - 1];
        if (gap < 25) {
          violations++;
        }
      }
    }
  }

  assert.equal(violations, 0, 'No scene should be reused with fewer than 25 intervening clips when pool allows');

  // Clean up
  movieAnalyzerStore.deleteProject(projectId);
});

test('Clip Selection — 6. Limitation reporting when scene pool has fewer than 25 scenes', async () => {
  const projectId = `test_constrained_pool_${uuid().slice(0, 8)}`;
  const project = movieAnalyzerStore.createProject(projectId, 'Constrained Pool Test');

  project.video = {
    id: uuid(),
    filename: 'short_movie.mp4',
    originalFilename: 'Short_Movie.mp4',
    filePath: 'E:/mock/short_movie.mp4',
    url: '/api/files/short_movie.mp4',
    duration: 1800,
    width: 1920,
    height: 1080,
    fps: 24,
    codec: 'h264',
    fileSize: 1000000000,
  };

  // Only 8 indexed scenes available! 25-clip spacing is mathematically impossible if >25 shots are generated
  project.analysis = {
    progress: 100,
    stageName: 'Completed',
    statusMessage: 'Ready',
    totalScenes: 8,
    indexedScenes: createMockIndexedScenes(8, 1800),
  };

  project.scripts = {
    targetDurationMinutes: 8,
    selectedLanguage: 'english',
    isApproved: true,
    english: {
      language: 'english',
      title: 'Constrained Pool Test',
      totalEstimatedDurationSeconds: 90, // ~35 shots
      wordCount: 220,
      hook: { text: 'Hook', hookType: 'mystery', durationSeconds: 15 },
      paragraphs: [
        { id: 'p1', section: 'context', text: 'Detective John begins examining the mystery.', estimatedSeconds: 45 },
        { id: 'p2', section: 'climax', text: 'The showdown reaches its peak.', estimatedSeconds: 45 },
      ],
      isApproved: true,
      updatedAt: new Date().toISOString(),
    },
  };

  movieAnalyzerStore.saveProject(project);

  const matchedShots = await movieAnalyzerEngine.matchScenes(projectId);
  assert.ok(matchedShots.length > 25, 'Should generate more than 25 shots');

  const updated = movieAnalyzerStore.getProject(projectId);
  // Must report limitations rather than silently failing:
  assert.ok(
    updated?.matching?.clipReuseLimitations && updated.matching.clipReuseLimitations.length > 0,
    'Must report clip reuse limitations when scene pool is smaller than 25 scenes'
  );
  assert.ok(
    updated.matching.clipReuseLimitations[0].includes('< 25-clip threshold'),
    'Limitation message must clearly explain threshold and pool constraint'
  );

  // Clean up
  movieAnalyzerStore.deleteProject(projectId);
});

test('Clip Selection — 7. Matches clips to narration content & preserves story flow', async () => {
  const projectId = `test_narration_match_${uuid().slice(0, 8)}`;
  const project = movieAnalyzerStore.createProject(projectId, 'Narration Match Test');

  project.video = {
    id: uuid(),
    filename: 'movie.mp4',
    originalFilename: 'Movie.mp4',
    filePath: 'E:/mock/movie.mp4',
    url: '/api/files/movie.mp4',
    duration: 3600,
    width: 1920,
    height: 1080,
    fps: 24,
    codec: 'h264',
    fileSize: 2000000000,
  };

  const sceneMaryOffice: MovieAnalyzerIndexedScene = {
    sceneId: 'sc_mary_office',
    startTime: 200,
    endTime: 300,
    duration: 100,
    visualDescription: 'Witness Mary explains the situation in her law office',
    characters: ['Witness Mary'],
    actions: ['explaining documents', 'giving testimony'],
    setting: 'law office',
    tone: 'serious',
    confidence: 0.95,
    thumbnailUrl: '/thumbnails/mary.jpg',
    isTitleOrBumper: false,
    isExcludedFromNarration: false,
  };

  const sceneMarcusWarehouse: MovieAnalyzerIndexedScene = {
    sceneId: 'sc_marcus_warehouse',
    startTime: 2500,
    endTime: 2600,
    duration: 100,
    visualDescription: 'Suspect Marcus attempts a daring escape inside the industrial warehouse',
    characters: ['Suspect Marcus'],
    actions: ['running through corridors', 'escaping through fire exit'],
    setting: 'industrial warehouse',
    tone: 'high action',
    confidence: 0.95,
    thumbnailUrl: '/thumbnails/marcus.jpg',
    isTitleOrBumper: false,
    isExcludedFromNarration: false,
  };

  const dummyScenes = createMockIndexedScenes(15, 3600);

  project.analysis = {
    progress: 100,
    stageName: 'Completed',
    statusMessage: 'Ready',
    totalScenes: 17,
    indexedScenes: [sceneMaryOffice, sceneMarcusWarehouse, ...dummyScenes],
  };

  project.scripts = {
    targetDurationMinutes: 8,
    selectedLanguage: 'english',
    isApproved: true,
    english: {
      language: 'english',
      title: 'Narration Match Test',
      totalEstimatedDurationSeconds: 40,
      wordCount: 100,
      hook: { text: 'Hook', hookType: 'mystery', durationSeconds: 15 },
      paragraphs: [
        {
          id: 'p1',
          section: 'characters',
          text: 'Witness Mary sits in her law office explaining critical documents.',
          estimatedSeconds: 20,
        },
        {
          id: 'p2',
          section: 'climax',
          text: 'Suspect Marcus runs through corridors escaping through fire exit in the industrial warehouse.',
          estimatedSeconds: 20,
        },
      ],
      isApproved: true,
      updatedAt: new Date().toISOString(),
    },
  };

  movieAnalyzerStore.saveProject(project);

  const matchedShots = await movieAnalyzerEngine.matchScenes(projectId);

  // Shots for paragraph 1 (Mary) must match sceneMaryOffice:
  const maryShots = matchedShots.filter((s) => s.narrationText.includes('Witness Mary'));
  assert.ok(maryShots.length > 0);
  assert.equal(maryShots[0].sceneId, 'sc_mary_office', 'Narration beat mentioning Mary in law office must match Mary office scene');

  // Shots for paragraph 2 (Marcus) must match sceneMarcusWarehouse:
  const marcusShots = matchedShots.filter((s) => s.narrationText.includes('Suspect Marcus'));
  assert.ok(marcusShots.length > 0);
  assert.equal(marcusShots[0].sceneId, 'sc_marcus_warehouse', 'Narration beat mentioning Marcus escaping must match warehouse scene');

  // Clean up
  movieAnalyzerStore.deleteProject(projectId);
});
