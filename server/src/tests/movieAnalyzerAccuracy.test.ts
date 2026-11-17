// ============================================================
// Movie Analyzer — Script Accuracy, Source Fidelity & Validation Tests
// Verifies:
// 1. Generation of source-grounded story beats from visual scene tags & transcript
// 2. Automated audit detection of forbidden AI clichés ("delicate equilibrium", "intricate web", etc.)
// 3. Fidelity scoring and character grounding validation
// 4. Prevention of generic fallback boilerplate for arbitrary movies
// ============================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { v4 as uuid } from 'uuid';
import { movieAnalyzerEngine } from '../services/movieAnalyzer/MovieAnalyzerEngine.js';
import { movieAnalyzerStore } from '../services/movieAnalyzer/MovieAnalyzerStore.js';
import type {
  MultilingualExplanationScript,
  MovieAnalyzerIndexedScene,
} from '../../../shared/types.js';

test('Movie Analyzer Accuracy: Story outline dynamically extracts beats from scenes and transcript', async () => {
  const projectId = `test_acc_${uuid().slice(0, 8)}`;
  const project = movieAnalyzerStore.createProject(projectId, 'Cyber Conspiracy Thriller');

  const scenes: MovieAnalyzerIndexedScene[] = [
    {
      sceneId: 'sc_1',
      startTime: 0,
      endTime: 15,
      duration: 15,
      visualDescription: 'Elena is typing at a security terminal in a dark server room.',
      characters: ['Elena'],
      actions: ['typing at security terminal'],
      setting: 'dark server room',
      tone: 'suspenseful',
      confidence: 0.9,
    },
    {
      sceneId: 'sc_2',
      startTime: 15,
      endTime: 35,
      duration: 20,
      visualDescription: 'Commander Vance confronts Elena about an unauthorized data backup.',
      characters: ['Elena', 'Commander Vance'],
      actions: ['confrontation', 'interrogation'],
      setting: 'command office',
      tone: 'tense',
      confidence: 0.95,
    },
    {
      sceneId: 'sc_3',
      startTime: 35,
      endTime: 60,
      duration: 25,
      visualDescription: 'Elena uncovers the hidden cipher on the encrypted drive.',
      characters: ['Elena'],
      actions: ['deciphering hidden data'],
      setting: 'laboratory terminal',
      tone: 'revelatory',
      confidence: 0.9,
    },
    {
      sceneId: 'sc_4',
      startTime: 60,
      endTime: 90,
      duration: 30,
      visualDescription: 'Elena triggers the fire alarm and slips through the emergency staircase.',
      characters: ['Elena'],
      actions: ['triggering alarm', 'escaping'],
      setting: 'emergency staircase',
      tone: 'action',
      confidence: 0.9,
    },
  ];

  project.transcript = {
    filename: 'cyber_conspiracy.txt',
    rawText: `
ELENA: The system breach wasn't random. Someone inside the agency authorized the backdoor.
VANCE: Drop the drive now, Elena. You don't know what you're dealing with.
ELENA: I know you signed the execution protocol, Vance.
VANCE: Then you leave me no choice.
`,
    wordCount: 42,
    lineCount: 6,
    extractedCharacters: ['Elena', 'Vance'],
    keyEvents: [
      'The system breach was authorized from inside the agency.',
      'Elena discovers Vance signed the execution protocol.',
    ],
    turningPoints: ['Elena discovers Vance signed the execution protocol.'],
    warnings: [],
  };

  // Directly invoke the outline builder engine
  const outline = movieAnalyzerEngine.buildStoryOutline(project, scenes);

  assert.ok(outline, 'Story outline must be built');
  assert.ok(outline.beats.length >= 7, 'Outline should have comprehensive story beats');

  // Verify that the outline is grounded in actual characters from transcript/scenes
  const allBeatText = outline.beats.map((b) => `${b.title} ${b.narrativeEvent} ${b.significance}`).join(' ');
  assert.ok(
    allBeatText.toLowerCase().includes('elena') || allBeatText.toLowerCase().includes('vance'),
    'Story outline must be grounded in actual characters from transcript/scenes'
  );

  // Cleanup
  movieAnalyzerStore.deleteProject(projectId);
});

test('Movie Analyzer Accuracy: Audit scorecard detects forbidden clichés and penalizes score', async () => {
  const projectId = `test_cliche_${uuid().slice(0, 8)}`;
  const project = movieAnalyzerStore.createProject(projectId, 'Cliche Detection Test');
  project.transcript = {
    filename: 'test.txt',
    rawText: 'ROSS: EVELYN, where did you hide the ledger?',
    wordCount: 7,
    lineCount: 1,
    extractedCharacters: ['Ross', 'Evelyn'],
    keyEvents: ['Ross questions Evelyn about the ledger'],
    turningPoints: [],
    warnings: [],
  };
  const storyIntel = movieAnalyzerEngine.extractStoryIntelligence(project);

  // Construct a script deliberately stuffed with banned AI clichés
  const scriptWithCliches: MultilingualExplanationScript = {
    language: 'english',
    title: 'A Delicate Equilibrium in Shadows',
    hook: {
      text: 'What happens when everything changes when a masterclass in deception begins?',
      durationSeconds: 15,
      hookType: 'mystery',
    },
    paragraphs: [
      {
        id: 'p1',
        section: 'context',
        text: 'The fragile status quo of the city was shattered. A delicate equilibrium existed between the factions.',
        estimatedSeconds: 40,
      },
      {
        id: 'p2',
        section: 'escalation',
        text: 'An intricate web of lies ensnared Ross. Little did he know what awaited him in the shadows.',
        estimatedSeconds: 45,
      },
      {
        id: 'p3',
        section: 'climax',
        text: 'This was a masterclass in strategy. What follows is a bizarre dynamic between hunter and hunted.',
        estimatedSeconds: 45,
      },
    ],
    totalEstimatedDurationSeconds: 145,
    wordCount: 55,
    isApproved: false,
    isEdited: false,
  };

  const audit = movieAnalyzerEngine.auditNarrativeAccuracyAndFidelity(
    scriptWithCliches,
    storyIntel,
    'english'
  );

  assert.ok(audit, 'Audit scorecard must be generated');
  assert.ok(audit.forbiddenPhrasesFound.length >= 3, 'Should detect multiple banned cliché phrases');
  assert.ok(audit.clichéFreeScore < 7, 'Cliché score must be heavily penalized');
  assert.equal(audit.passedValidation, false, 'Script with multiple clichés must fail validation');

  movieAnalyzerStore.deleteProject(projectId);
});

test('Movie Analyzer Accuracy: Clean, grounded narrative achieves high fidelity and passes validation', async () => {
  const projectId = `test_clean_${uuid().slice(0, 8)}`;
  const project = movieAnalyzerStore.createProject(projectId, 'Mentalist Investigation Test');
  project.transcript = {
    filename: 'mentalist.txt',
    rawText: `
JANE: Lisbon, take a look at this victim footprints.
LISBON: Patrick, Red John was here.
JANE: Red John draws the smiley face clockwise. This one was drawn counter-clockwise.
`,
    wordCount: 30,
    lineCount: 4,
    extractedCharacters: ['Jane', 'Lisbon', 'Red John'],
    keyEvents: ['Jane spots the counter-clockwise smiley face proving a copycat.'],
    turningPoints: ['Jane spots the copycat clue.'],
    warnings: [],
  };
  const storyIntel = movieAnalyzerEngine.extractStoryIntelligence(project);

  const cleanScript: MultilingualExplanationScript = {
    language: 'english',
    title: 'The Mentalist: Anatomy of a Copycat Killer',
    hook: {
      text: 'Why would a serial killer leave the bedroom window open when it was freezing outside? That single observation unravels an entire conspiracy.',
      durationSeconds: 16,
      hookType: 'mystery',
    },
    paragraphs: [
      {
        id: 'p1',
        section: 'hook',
        text: 'Patrick Jane arrives at the crime scene alongside Lisbon.',
        estimatedSeconds: 20,
      },
      {
        id: 'p2',
        section: 'climax',
        text: 'Jane spots the counter-clockwise smiley face proving a copycat. Jane forces a confession before Lisbon even draws her weapon.',
        estimatedSeconds: 50,
      },
      {
        id: 'p3',
        section: 'resolution',
        text: 'The case closes with Lisbon acknowledging Jane psychological method.',
        estimatedSeconds: 30,
      },
    ],
    totalEstimatedDurationSeconds: 116,
    wordCount: 48,
    isApproved: false,
    isEdited: false,
  };

  const audit = movieAnalyzerEngine.auditNarrativeAccuracyAndFidelity(
    cleanScript,
    storyIntel,
    'english'
  );

  assert.ok(audit, 'Audit scorecard must be generated');
  assert.equal(audit.forbiddenPhrasesFound.length, 0, 'Clean script must have 0 banned clichés');
  assert.equal(audit.clichéFreeScore, 10, 'Cliché-free score should be 10/10');
  assert.ok(audit.overallAccuracyScore >= 7, 'Overall accuracy score should be >= 7');
  assert.equal(audit.passedValidation, true, 'Clean, grounded script must pass validation');
  assert.ok(
    audit.verifiedClaims.some((c) => c.includes('Jane')),
    'Should verify character Jane'
  );

  movieAnalyzerStore.deleteProject(projectId);
});
