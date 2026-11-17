// ============================================================
// Long-Form Compilation Test Suite
// Validates StoryAnalyzer, SegmentSelector, SafeFramingEngine,
// SmartScaleEngine, TransitionEngine, LongFormQualityGate, and DB persistence.
// ============================================================

import { test } from 'node:test';
import assert from 'node:assert';
import { v4 as uuid } from 'uuid';
import { StoryAnalyzer } from '../services/longForm/StoryAnalyzer.js';
import { SegmentSelector } from '../services/longForm/SegmentSelector.js';
import { SafeFramingEngine } from '../services/longForm/SafeFramingEngine.js';
import { SmartScaleEngine } from '../services/longForm/SmartScaleEngine.js';
import { TransitionEngine } from '../services/longForm/TransitionEngine.js';
import { LongFormQualityGate } from '../services/longForm/LongFormQualityGate.js';
import { getDb } from '../services/database.js';
import type {
  TranscriptSegment,
  Scene,
  TimelineSegment,
  LongFormSettings,
} from '../../../shared/types.js';
import { DEFAULT_LONG_FORM_SETTINGS } from '../../../shared/constants.js';

test('StoryAnalyzer — groups sentences cleanly without broken thoughts and detects narrative roles', () => {
  const analyzer = new StoryAnalyzer();

  const mockSegments: TranscriptSegment[] = [
    { id: '1', transcriptId: 't1', startTime: 0.0, endTime: 3.2, text: "Here's the thing nobody told you about video editing.", confidence: 0.95 },
    { id: '2', transcriptId: 't1', startTime: 3.5, endTime: 7.1, text: "It all started back in 2020 when everything changed.", confidence: 0.94 },
    { id: '3', transcriptId: 't1', startTime: 7.4, endTime: 12.0, text: "We spent countless hours cutting clips manually.", confidence: 0.92 },
    { id: '4', transcriptId: 't1', startTime: 12.5, endTime: 18.0, text: "Suddenly we realized an insane breakthrough occurred.", confidence: 0.96 },
    { id: '5', transcriptId: 't1', startTime: 18.2, endTime: 24.0, text: "And that is why automated compilation saves massive time.", confidence: 0.95 },
    // Repetitive segment that should be flagged/suppressed
    { id: '6', transcriptId: 't1', startTime: 24.5, endTime: 28.0, text: "And that is why automated compilation saves massive time.", confidence: 0.95 },
  ];

  const mockScenes: Scene[] = [
    { id: 's1', projectId: 'p1', sceneIndex: 0, startTime: 0.0, endTime: 12.0, duration: 12.0 },
    { id: 's2', projectId: 'p1', sceneIndex: 1, startTime: 12.0, endTime: 28.0, duration: 16.0 },
  ];

  const units = analyzer.analyzeStoryUnits(mockSegments, mockScenes, null, [], 28.0, 'narrative');

  assert.ok(units.length >= 2, 'Should create story units from sentences');
  assert.strictEqual(units[0].storyRole, 'hook', 'First unit with strong opening should be categorized as hook');
  
  // Verify repetition detection
  const hasRepetitive = units.some(u => u.isRepetitive);
  assert.ok(hasRepetitive, 'Identical repeated sentence should be flagged as repetitive');
});

test('SegmentSelector — fits narrative selection within target duration without repetition', () => {
  const selector = new SegmentSelector();

  // Create 20 units spanning 15 minutes (~900s)
  const units = Array.from({ length: 20 }, (_, i) => ({
    id: `unit_${i}`,
    sourceStart: i * 45,
    sourceEnd: (i + 1) * 45,
    duration: 45,
    text: `Segment ${i + 1} narrative discussion`,
    title: `Part ${i + 1}`,
    summary: `Summary of part ${i + 1}`,
    importanceScore: i === 0 ? 95 : i === 19 ? 90 : 50 + (i % 5) * 8,
    energyScore: 60 + (i % 4) * 10,
    storyRole: (i === 0 ? 'hook' : i === 19 ? 'resolution' : i % 4 === 0 ? 'climax' : 'buildup') as any,
    hasDeadAir: false,
    isRepetitive: false,
    topicWords: new Set([`topic_${i}`]),
  }));

  // Target: 5–7 minutes (nominal 360s, max 420s)
  const timeline = selector.selectTimelineSegments(units, {
    targetDuration: '5-7',
    editStyle: 'narrative',
    defaultTransition: 'crossfade',
  });

  const totalDuration = timeline.reduce((acc, s) => acc + s.duration, 0);

  assert.ok(totalDuration >= 300, `Duration (${totalDuration}s) should meet or exceed 300s (5 min)`);
  assert.ok(totalDuration <= 420, `Duration (${totalDuration}s) should not exceed 420s (7 min)`);

  // Strictly chronological verification
  for (let i = 1; i < timeline.length; i++) {
    assert.ok(
      timeline[i].sourceStart >= timeline[i - 1].sourceEnd,
      `Timeline must be strictly chronological: item ${i} (${timeline[i].sourceStart}s) vs item ${i-1} (${timeline[i-1].sourceEnd}s)`
    );
  }
});

test('SafeFramingEngine & SmartScaleEngine — enforces composition safety and limits scale to 128%', () => {
  const framing = new SafeFramingEngine();

  // Scenario 1: Standard action (30% spread), 120% scale requested
  const res1 = framing.analyzeAndFrame(1.20, 1920, 1080, 1920, 1080, { actionSpread: 0.25 });
  assert.strictEqual(res1.recommendedScale, 1.20);
  assert.ok(res1.filterString.includes('scale=2304:1296'));

  // Scenario 2: High action spread (wide coverage >55%), 126% scale requested
  // Safe framing engine MUST automatically reduce scale to 1.10x to protect peripheral action
  const res2 = framing.analyzeAndFrame(1.26, 1920, 1080, 1920, 1080, { actionSpread: 0.58 });
  assert.strictEqual(res2.recommendedScale, 1.10, 'Scale should auto-reduce to 1.10 for wide action');
  assert.ok(res2.reducedReason?.includes('Action spreads across wide frame'));

  // SmartScaleEngine test
  const scaleEngine = new SmartScaleEngine();
  const mockSegments: TimelineSegment[] = [
    {
      id: 'seg_1',
      sourceStart: 10,
      sourceEnd: 30,
      duration: 20,
      title: 'Clip 1',
      summary: 'Summary',
      importanceScore: 80,
      energyScore: 70,
      storyRole: 'hook',
      scaleFactor: 1.20,
      transitionIn: 'cut',
      transitionOut: 'crossfade',
      isEnabled: true,
      order: 1,
    }
  ];

  const results = scaleEngine.processTimelineScaling(
    mockSegments,
    { ...DEFAULT_LONG_FORM_SETTINGS, safeEdgeCleanup: true, maxScaleFactor: 1.20 }
  );

  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].appliedScale, 1.20);
});

test('TransitionEngine — builds valid filtergraph with xfade and acrossfade', () => {
  const engine = new TransitionEngine();

  const segments: TimelineSegment[] = [
    { id: '1', sourceStart: 0, sourceEnd: 10, duration: 10, title: 'C1', summary: '', importanceScore: 80, energyScore: 70, storyRole: 'hook', scaleFactor: 1, transitionIn: 'cut', transitionOut: 'crossfade', isEnabled: true, order: 1 },
    { id: '2', sourceStart: 20, sourceEnd: 35, duration: 15, title: 'C2', summary: '', importanceScore: 75, energyScore: 65, storyRole: 'buildup', scaleFactor: 1, transitionIn: 'crossfade', transitionOut: 'crossfade', isEnabled: true, order: 2 },
    { id: '3', sourceStart: 50, sourceEnd: 62, duration: 12, title: 'C3', summary: '', importanceScore: 90, energyScore: 85, storyRole: 'climax', scaleFactor: 1, transitionIn: 'crossfade', transitionOut: 'cut', isEnabled: true, order: 3 },
  ];

  const graph = engine.buildFilterGraph(segments, {
    ...DEFAULT_LONG_FORM_SETTINGS,
    transitionType: 'crossfade',
    transitionDuration: 0.6,
  });

  assert.ok(graph.filterComplex.includes('xfade=transition=fade'));
  assert.ok(graph.filterComplex.includes('acrossfade=d=0.6'));
  // Total duration with two 0.6s crossfades: 10 + 15 + 12 - 2*(0.6) = 35.8s
  assert.strictEqual(graph.totalDuration, 35.8);
});

test('LongFormQualityGate — automatically detects and remediates duplicate/overlapping clips', () => {
  const qualityGate = new LongFormQualityGate();

  const mockTimeline: TimelineSegment[] = [
    { id: '1', sourceStart: 10, sourceEnd: 30, duration: 20, title: 'Scene 1', summary: '', importanceScore: 80, energyScore: 70, storyRole: 'hook', scaleFactor: 1, transitionIn: 'cut', transitionOut: 'crossfade', isEnabled: true, order: 1 },
    // Duplicate overlapping clip:
    { id: '2', sourceStart: 12, sourceEnd: 28, duration: 16, title: 'Duplicate Scene 1', summary: '', importanceScore: 75, energyScore: 65, storyRole: 'buildup', scaleFactor: 1, transitionIn: 'crossfade', transitionOut: 'crossfade', isEnabled: true, order: 2 },
    { id: '3', sourceStart: 40, sourceEnd: 60, duration: 20, title: 'Scene 2', summary: '', importanceScore: 90, energyScore: 80, storyRole: 'climax', scaleFactor: 1.40, transitionIn: 'crossfade', transitionOut: 'cut', isEnabled: true, order: 3 },
  ];

  const preCheck = qualityGate.preCheckTimeline(mockTimeline, DEFAULT_LONG_FORM_SETTINGS);

  assert.strictEqual(preCheck.sanitizedTimeline.length, 2, 'Duplicate overlapping segment must be auto-removed');
  assert.ok(preCheck.autoFixes.some(f => f.includes('Removed duplicate/overlapping segment')));
  assert.strictEqual(preCheck.sanitizedTimeline[1].scaleFactor, 1.28, 'Excessive scale (1.40) must be auto-capped at 1.28');
});

test('Database Service — Long-Form Compilations CRUD & Project Cascade Delete', () => {
  const db = getDb();
  const projectId = uuid();
  const compilationId = uuid();

  // 1. Create dummy project
  db.prepare('INSERT INTO projects (id, user_id, name, status) VALUES (?, ?, ?, ?)').run(
    projectId, 'user_1', 'Test Long-Form Project', 'created'
  );

  // 2. Insert Long-Form Compilation
  const insertComp = db.prepare(`
    INSERT INTO long_form_compilations (
      id, project_id, title, status, progress, stage, settings, timeline,
      estimated_duration, actual_duration, file_path, file_size, quality_report, error
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertComp.run(
    compilationId,
    projectId,
    'My 16:9 Masterpiece',
    'draft',
    0,
    'timeline_ready',
    JSON.stringify(DEFAULT_LONG_FORM_SETTINGS),
    JSON.stringify([]),
    360,
    null,
    null,
    null,
    null,
    null
  );

  // 3. Query Compilation by ID
  const comp = db.prepare('SELECT * FROM long_form_compilations WHERE id = ?').get(compilationId);
  assert.ok(comp, 'Compilation should exist in database');
  assert.strictEqual(comp.title, 'My 16:9 Masterpiece');
  assert.strictEqual(comp.project_id, projectId);

  // 4. Update Compilation
  db.prepare(`
    UPDATE long_form_compilations
    SET status = 'completed', progress = 100, actual_duration = 358.5
    WHERE id = ?
  `).run(compilationId);

  const updatedComp = db.prepare('SELECT * FROM long_form_compilations WHERE id = ?').get(compilationId);
  assert.strictEqual(updatedComp.status, 'completed');
  assert.strictEqual(updatedComp.actual_duration, 358.5);

  // 5. Cascade Delete Project
  db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);

  const deletedComp = db.prepare('SELECT * FROM long_form_compilations WHERE id = ?').get(compilationId);
  assert.strictEqual(deletedComp, null, 'Long-form compilation should be cascade deleted with project');
});
