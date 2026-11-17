// ============================================================
// Chunk Engine — Overlapping Window Analysis
// ============================================================

import type { TranscriptSegment, Scene, TimeRange } from '../../../shared/types.js';
import { config } from '../config/index.js';

export interface AnalysisChunk {
  index: number;
  startTime: number;
  endTime: number;
  duration: number;
  transcriptSegments: TranscriptSegment[];
  transcriptText: string;
  sceneChanges: number[]; // timestamps of scene changes within this chunk
  overlapPrev: boolean;
  overlapNext: boolean;
}

/**
 * Split the video timeline into overlapping analysis windows.
 * Works from timestamps — no physical file splitting.
 */
export function createAnalysisChunks(
  videoDuration: number,
  transcriptSegments: TranscriptSegment[],
  scenes: Scene[],
  chunkSize?: number,
  overlap?: number
): AnalysisChunk[] {
  const windowSize = chunkSize || config.analysisChunkSize; // default 120s
  const windowOverlap = overlap || config.chunkOverlap; // default 30s
  const step = windowSize - windowOverlap;

  const chunks: AnalysisChunk[] = [];
  let startTime = 0;
  let index = 0;

  while (startTime < videoDuration) {
    const endTime = Math.min(startTime + windowSize, videoDuration);

    // Find transcript segments that fall within this window
    const chunkSegments = transcriptSegments.filter(
      seg => seg.startTime < endTime && seg.endTime > startTime
    );

    // Build combined text for this chunk
    const chunkText = chunkSegments.map(s => s.text).join(' ');

    // Find scene change timestamps within this chunk
    const sceneChanges = scenes
      .filter(s => s.startTime > startTime && s.startTime < endTime)
      .map(s => s.startTime);

    chunks.push({
      index,
      startTime,
      endTime,
      duration: endTime - startTime,
      transcriptSegments: chunkSegments,
      transcriptText: chunkText,
      sceneChanges,
      overlapPrev: startTime > 0,
      overlapNext: endTime < videoDuration,
    });

    startTime += step;
    index++;

    // Safety: prevent infinite loop for very short videos
    if (step <= 0) break;
  }

  return chunks;
}

/**
 * Find natural sentence boundaries around a target timestamp.
 * Used for finding clean start/end points for clips.
 */
export function findSentenceBoundary(
  targetTime: number,
  segments: TranscriptSegment[],
  direction: 'before' | 'after',
  maxOffset: number = 3 // seconds
): number {
  if (segments.length === 0) return targetTime;

  if (direction === 'before') {
    // Find the closest segment start that's before or at targetTime
    const candidates = segments
      .filter(s => s.startTime <= targetTime && s.startTime >= targetTime - maxOffset)
      .sort((a, b) => b.startTime - a.startTime);

    return candidates.length > 0 ? candidates[0].startTime : targetTime;
  } else {
    // Find the closest segment end that's after or at targetTime
    const candidates = segments
      .filter(s => s.endTime >= targetTime && s.endTime <= targetTime + maxOffset)
      .sort((a, b) => a.endTime - b.endTime);

    return candidates.length > 0 ? candidates[0].endTime : targetTime;
  }
}

/**
 * Check if a time range overlaps significantly with another range.
 * Used for duplicate suppression.
 */
export function calculateOverlap(
  range1: TimeRange,
  range2: TimeRange
): number {
  const overlapStart = Math.max(range1.start, range2.start);
  const overlapEnd = Math.min(range1.end, range2.end);

  if (overlapStart >= overlapEnd) return 0;

  const overlapDuration = overlapEnd - overlapStart;
  const minDuration = Math.min(
    range1.end - range1.start,
    range2.end - range2.start
  );

  return minDuration > 0 ? overlapDuration / minDuration : 0;
}
