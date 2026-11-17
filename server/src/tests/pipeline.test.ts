// ============================================================
// Unit Tests — Chunking, Scoring, Highlight Detection
// ============================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnalysisChunks, findSentenceBoundary, calculateOverlap } from '../services/chunkEngine.js';
import { detectHighlights } from '../services/highlightDetector.js';
import type { TranscriptSegment, AudioAnalysisResult, Scene } from '../../../shared/types.js';

test('Chunk Engine — splits 30-minute video into overlapping windows', () => {
  const duration = 1800; // 30 minutes (1800s)
  const segments: TranscriptSegment[] = [
    { id: '1', transcriptId: 't1', startTime: 10, endTime: 15, text: 'This was the moment everything changed.', confidence: 0.95 },
    { id: '2', transcriptId: 't1', startTime: 120, endTime: 130, text: 'The secret nobody told you about video editing.', confidence: 0.9 },
  ];
  const scenes: Scene[] = [
    { id: 's1', projectId: 'p1', sceneIndex: 0, startTime: 0, endTime: 60, duration: 60 },
    { id: 's2', projectId: 'p1', sceneIndex: 1, startTime: 60, endTime: 180, duration: 120 },
  ];

  const chunks = createAnalysisChunks(duration, segments, scenes, 120, 30);

  assert.ok(chunks.length > 10, 'Should create multiple chunks for a 30-min video');
  assert.equal(chunks[0].startTime, 0);
  assert.equal(chunks[0].endTime, 120);
  assert.equal(chunks[1].startTime, 90); // 120 - 30 overlap
});

test('Sentence Boundary Detection — snaps cleanly to sentence start/end', () => {
  const segments: TranscriptSegment[] = [
    { id: '1', transcriptId: 't1', startTime: 10.2, endTime: 14.5, text: 'Here is the hook.', confidence: 0.9 },
    { id: '2', transcriptId: 't1', startTime: 15.0, endTime: 28.3, text: 'And this is the punchline.', confidence: 0.9 },
  ];

  const snapStart = findSentenceBoundary(10.5, segments, 'before', 2);
  assert.equal(snapStart, 10.2, 'Should snap to segment start');

  const snapEnd = findSentenceBoundary(28.0, segments, 'after', 2);
  assert.equal(snapEnd, 28.3, 'Should snap to segment end');
});

test('Duplicate Suppression — calculates correct overlap ratio', () => {
  const rangeA = { start: 100, end: 130 }; // 30s
  const rangeB = { start: 110, end: 140 }; // 30s, 20s overlap
  const overlap = calculateOverlap(rangeA, rangeB);

  assert.ok(overlap > 0.6, 'Should detect >60% overlap');

  const rangeC = { start: 200, end: 230 };
  const noOverlap = calculateOverlap(rangeA, rangeC);
  assert.equal(noOverlap, 0, 'Disjoint ranges should have 0 overlap');
});

test('Highlight Detector — identifies strong hook statement with high score', () => {
  const chunks = [
    {
      index: 0,
      startTime: 0,
      endTime: 120,
      duration: 120,
      transcriptSegments: [
        { id: '1', transcriptId: 't1', startTime: 5, endTime: 12, text: 'Nobody ever told you the secret truth about this incredible game changer.', confidence: 0.95 },
        { id: '2', transcriptId: 't1', startTime: 13, endTime: 25, text: 'It completely changed everything and blew my mind because of this one mistake.', confidence: 0.95 },
        { id: '3', transcriptId: 't1', startTime: 26, endTime: 32, text: 'And that is the bottom line.', confidence: 0.95 },
      ],
      transcriptText: 'Nobody ever told you the secret truth about this incredible game changer. It completely changed everything and blew my mind because of this one mistake. And that is the bottom line.',
      sceneChanges: [10, 20],
      overlapPrev: false,
      overlapNext: false,
    },
  ];

  const audioAnalysis: AudioAnalysisResult = {
    volumeLevels: [{ time: 10, volume: -12 }],
    silenceRegions: [],
    energyPeaks: [{ time: 8, energy: -10, type: 'spike' }],
    averageVolume: -20,
  };

  const candidates = detectHighlights(chunks, audioAnalysis, 120);

  assert.ok(candidates.length > 0, 'Should detect at least 1 candidate');
  assert.ok(candidates[0].scores.hook >= 30, 'Hook score should be elevated');
  assert.ok(candidates[0].scores.total >= 40, 'Total score should reflect high engagement');
  assert.ok(candidates[0].endTime - candidates[0].startTime <= 35, 'Candidate duration should be within limits');
});
