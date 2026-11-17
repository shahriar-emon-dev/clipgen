// ============================================================
// Highlight Detector — Master 10-Dimension Multi-Signal Engine
// Intelligent Short-Form Video Selection, Hook Optimization,
// Natural Sentence Snapping, and Story Payoff Refinement
// ============================================================

import type {
  TranscriptSegment, AudioAnalysisResult, WordTimestamp, ReframeMode,
} from '../../../shared/types.js';
import type { AnalysisChunk } from './chunkEngine.js';
import { DEFAULT_SCORING_WEIGHTS } from '../../../shared/constants.js';
import {
  HOOK_KEYWORDS, EMOTION_KEYWORDS, SURPRISE_KEYWORDS,
  QUESTION_STARTERS, STRONG_OPENING_PATTERNS,
  CONCLUSION_PATTERNS, STORY_MARKERS,
} from '../../../shared/constants.js';
import { config } from '../config/index.js';

export interface RawCandidate {
  startTime: number;
  endTime: number;
  duration: number;
  transcriptText: string;
  scores: {
    hook: number;
    contentValue: number;
    curiosity: number;
    emotion: number;
    story: number;
    payoff: number;
    pacing: number;
    visual: number;
    audio: number;
    shortsP: number;
    total: number;
  };
  whySelected: string[];
  confidence: 'High' | 'Medium' | 'Low';
  chunkIndex: number;
  title?: string;
  framingMode?: ReframeMode;
  cropOffsetX?: number;
  visualComposition?: any;
}

const WEAK_OPENING_PATTERNS = [
  /^(hey|hi|hello|what's up|welcome back)\b/i,
  /^(today we're going to|today i want to|in this video)\b/i,
  /^(so basically|basically what happened|let me explain)\b/i,
  /^(okay guys|alright guys|so yeah)\b/i,
];

/**
 * Main highlight detection: Multi-stage, two-pass candidate generation.
 * Handles both dialogue-rich speech videos and action/sports videos.
 */
export function detectHighlights(
  chunks: AnalysisChunk[],
  audioAnalysis: AudioAnalysisResult,
  videoDuration: number,
  onProgress?: (percent: number, detail: string) => void
): RawCandidate[] {
  const allCandidates: RawCandidate[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const candidates = analyzeChunk(chunk, audioAnalysis, videoDuration);
    allCandidates.push(...candidates);

    if (onProgress && (i % 2 === 0 || i === chunks.length - 1)) {
      const pct = Math.round(((i + 1) / chunks.length) * 100);
      onProgress(pct, `Scanning chunk ${i + 1} of ${chunks.length} (${pct}%) • ${allCandidates.length} candidate moments found`);
    }
  }

  // Non-maximum suppression (NMS) to eliminate overlapping candidates (>40% overlap)
  const merged = suppressOverlappingCandidates(allCandidates);

  // Sort by total score descending
  merged.sort((a, b) => b.scores.total - a.scores.total);

  if (onProgress) {
    onProgress(100, `Evaluated ${chunks.length} chunks. Selected Top ${merged.length} distinct highlight moments`);
  }

  return merged;
}

function analyzeChunk(
  chunk: AnalysisChunk,
  audioAnalysis: AudioAnalysisResult,
  videoDuration: number
): RawCandidate[] {
  const candidates: RawCandidate[] = [];
  const segments = chunk.transcriptSegments || [];
  const hasSpeech = segments.length > 0;

  // Window durations: prefer tight 18-26s mini-stories over bloated 30s
  const windowDurations = [20, 25, 30, 18];

  for (const targetDur of windowDurations) {
    let windowStart = chunk.startTime;

    while (windowStart + config.minShortDuration <= chunk.endTime) {
      let windowEnd = Math.min(windowStart + targetDur, chunk.endTime);

      let refinedStart = windowStart;
      let refinedEnd = windowEnd;
      let windowText = '';

      if (hasSpeech) {
        // Find segments overlapping this window
        const windowSegments = segments.filter(
          s => s.startTime < windowEnd && s.endTime > windowStart
        );

        if (windowSegments.length > 0) {
          // Hook-First Optimization: Check first 3 seconds for weak intro/filler
          const firstSeg = windowSegments[0];
          const firstText = firstSeg.text.trim();
          let isWeakStart = false;
          for (const weakPattern of WEAK_OPENING_PATTERNS) {
            if (weakPattern.test(firstText)) {
              isWeakStart = true;
              break;
            }
          }

          // If weak start and another segment begins nearby within 1-4s, reposition start
          if (isWeakStart && windowSegments.length > 1 && windowSegments[1].startTime - windowStart <= 5) {
            refinedStart = windowSegments[1].startTime;
          } else {
            // Snap cleanly to first segment start timestamp
            refinedStart = firstSeg.startTime;
          }

          // Ending Optimization: Snap to clean sentence or segment end
          const lastSeg = windowSegments[windowSegments.length - 1];
          refinedEnd = lastSeg.endTime;

          // Ensure duration stays within [15, 30] bounds
          if (refinedEnd - refinedStart > config.maxShortDuration) {
            refinedEnd = refinedStart + config.maxShortDuration;
          }
          if (refinedEnd - refinedStart < config.minShortDuration) {
            refinedEnd = Math.min(chunk.endTime, refinedStart + config.minShortDuration);
          }

          windowText = windowSegments.map(s => s.text).join(' ');
        }
      } else {
        // Non-Speech / Sports Mode: Snap boundaries to nearby audio energy peaks or scene changes
        const nearbyPeaks = audioAnalysis.energyPeaks.filter(
          p => p.time >= windowStart - 2 && p.time <= windowEnd + 2
        );
        if (nearbyPeaks.length > 0) {
          // Align window so peak is at the payoff (middle-to-end of the clip)
          const peak = nearbyPeaks[0];
          refinedStart = Math.max(0, peak.time - (targetDur * 0.65));
          refinedEnd = Math.min(videoDuration, refinedStart + targetDur);
        }
        windowText = `High-Energy Action Sequence (${Math.round(refinedStart)}s - ${Math.round(refinedEnd)}s)`;
      }

      const duration = refinedEnd - refinedStart;
      if (duration >= config.minShortDuration && duration <= config.maxShortDuration + 1) {
        const scores = scoreCandidate(
          windowText,
          refinedStart,
          refinedEnd,
          chunk.sceneChanges,
          audioAnalysis,
          videoDuration,
          hasSpeech
        );

        if (scores.total >= 28) {
          const whySelected = generateWhySelected(scores, hasSpeech);
          const confidence: 'High' | 'Medium' | 'Low' =
            scores.total >= 80 ? 'High' : scores.total >= 60 ? 'Medium' : 'Low';

          candidates.push({
            startTime: Math.round(refinedStart * 10) / 10,
            endTime: Math.round(refinedEnd * 10) / 10,
            duration: Math.round(duration * 10) / 10,
            transcriptText: windowText.substring(0, 400),
            scores,
            whySelected,
            confidence,
            chunkIndex: chunk.index,
          });
        }
      }

      windowStart += 10; // Sliding window step
    }
  }

  return candidates;
}

// ── 10-Dimension Multi-Signal Scoring Function ──

function scoreCandidate(
  text: string,
  start: number,
  end: number,
  sceneChanges: number[],
  audio: AudioAnalysisResult,
  videoDuration: number,
  hasSpeech: boolean
) {
  const duration = end - start;
  const lower = text.toLowerCase();

  // 1. Hook Score (20% weight): Immediate 1-3s attention grabber
  let hook = 40;
  if (hasSpeech) {
    for (const kw of HOOK_KEYWORDS) {
      if (lower.includes(kw)) hook += 18;
    }
    for (const starter of QUESTION_STARTERS) {
      if (lower.startsWith(starter) || lower.includes(`. ${starter}`)) hook += 15;
    }
    for (const pat of STRONG_OPENING_PATTERNS) {
      if (pat.test(text.substring(0, 80))) { hook += 22; break; }
    }
    if (/\b(you|your|watch|look|listen)\b/i.test(text.substring(0, 50))) hook += 8;
  } else {
    // Sports/Action Hook: Immediate sudden volume or motion peak in first 3s
    const first3sPeaks = audio.energyPeaks.filter(p => p.time >= start && p.time <= start + 3);
    if (first3sPeaks.length > 0) hook += 35;
    else hook += 15;
  }
  hook = Math.min(100, Math.max(10, hook));

  // 2. Content Value (15% weight): Action/information density
  let contentValue = 45;
  if (hasSpeech) {
    const numbers = (text.match(/\b\d+/g) || []).length;
    contentValue += Math.min(numbers * 6, 20);
    if (/\b(because|therefore|how to|secret|lesson|method)\b/i.test(text)) contentValue += 15;
    const words = text.split(/\s+/).length;
    if (words >= 35 && words <= 90) contentValue += 15;
  } else {
    // Action density: energy peaks across the clip
    const peaksCount = audio.energyPeaks.filter(p => p.time >= start && p.time <= end).length;
    contentValue += Math.min(peaksCount * 12, 35);
  }
  contentValue = Math.min(100, Math.max(10, contentValue));

  // 3. Curiosity Score (10% weight)
  let curiosity = 40;
  for (const kw of SURPRISE_KEYWORDS) {
    if (lower.includes(kw)) curiosity += 18;
  }
  if (/\b(never|secret|nobody|hidden|actually|truth|mistake)\b/i.test(lower)) curiosity += 20;
  curiosity = Math.min(100, Math.max(10, curiosity));

  // 4. Emotional Impact (10% weight)
  let emotion = 45;
  for (const kw of EMOTION_KEYWORDS) {
    if (lower.includes(kw)) emotion += 16;
  }
  const audioSpikes = audio.energyPeaks.filter(p => p.time >= start && p.time <= end && p.type === 'spike').length;
  emotion += Math.min(audioSpikes * 14, 30);
  emotion = Math.min(100, Math.max(10, emotion));

  // 5. Story Completeness (10% weight)
  let story = 45;
  if (hasSpeech) {
    for (const pat of STORY_MARKERS) {
      if (pat.test(text)) story += 18;
    }
    const sentenceCount = text.split(/[.!?]+/).filter(s => s.trim().length > 8).length;
    if (sentenceCount >= 2 && sentenceCount <= 5) story += 15;
  } else {
    // Arc: low energy buildup -> high energy peak -> resolution
    story += 25;
  }
  story = Math.min(100, Math.max(10, story));

  // 6. Payoff Strength (10% weight)
  let payoff = 45;
  if (hasSpeech) {
    for (const pat of CONCLUSION_PATTERNS) {
      if (pat.test(text.slice(-100))) { payoff += 25; break; }
    }
    if (/[.!?]$/.test(text.trim())) payoff += 15;
  }
  // Audio peak near end (last 35% of clip)
  const endPeaks = audio.energyPeaks.filter(p => p.time >= start + (duration * 0.6) && p.time <= end);
  if (endPeaks.length > 0) payoff += 22;
  payoff = Math.min(100, Math.max(10, payoff));

  // 7. Pacing (10% weight): Absence of dead air
  let pacing = 75;
  const silences = audio.silenceRegions.filter(r => r.start < end && r.end > start);
  const totalSilence = silences.reduce((sum, r) => sum + (Math.min(end, r.end) - Math.max(start, r.start)), 0);
  const silenceRatio = totalSilence / duration;
  if (silenceRatio > 0.25) pacing -= 30;
  else if (silenceRatio > 0.1) pacing -= 15;
  else pacing += 15;
  pacing = Math.min(100, Math.max(10, pacing));

  // 8. Visual Quality (5% weight)
  const cuts = sceneChanges.filter(t => t >= start && t <= end).length;
  let visual = 60;
  if (cuts >= 1 && cuts <= 3) visual = 85; // Good cadence
  else if (cuts >= 4 && cuts <= 6) visual = 70;
  else if (cuts > 6) visual = 45; // Overly rapid
  visual = Math.min(100, Math.max(10, visual));

  // 9. Audio Quality (5% weight)
  let audioQ = 80;
  const avgVol = audio.averageVolume ?? -20;
  if (avgVol > -10) audioQ -= 15; // Potential clipping
  if (avgVol < -35) audioQ -= 20; // Too quiet
  audioQ = Math.min(100, Math.max(10, audioQ));

  // 10. Shorts Suitability (5% weight): Pacing & duration fit (18-26s sweet spot)
  let shortsP = 70;
  if (duration >= 18 && duration <= 26) shortsP = 95;
  else if (duration >= 15 && duration <= 30) shortsP = 85;
  else shortsP = 60;

  const w = DEFAULT_SCORING_WEIGHTS;
  const total = Math.round(
    hook * w.hook +
    contentValue * w.contentValue +
    curiosity * w.curiosity +
    emotion * w.emotion +
    story * w.story +
    payoff * w.payoff +
    pacing * w.pacing +
    visual * w.visual +
    audioQ * w.audio +
    shortsP * w.shortsP
  );

  return {
    hook: Math.round(hook),
    contentValue: Math.round(contentValue),
    curiosity: Math.round(curiosity),
    emotion: Math.round(emotion),
    story: Math.round(story),
    payoff: Math.round(payoff),
    pacing: Math.round(pacing),
    visual: Math.round(visual),
    audio: Math.round(audioQ),
    shortsP: Math.round(shortsP),
    total: Math.round(total),
  };
}

function generateWhySelected(scores: RawCandidate['scores'], hasSpeech: boolean): string[] {
  const points: string[] = [];
  if (scores.hook >= 75) points.push(`✓ High Hook Score (${scores.hook}%) — Immediate strong opening`);
  if (scores.payoff >= 75) points.push(`✓ Strong Payoff (${scores.payoff}%) — Clear climax or reaction ending`);
  if (scores.pacing >= 75) points.push(`✓ Excellent Pacing (${scores.pacing}%) — High density, zero dead air`);
  if (scores.emotion >= 75) points.push(`✓ High Emotional Impact (${scores.emotion}%) — Peak energy & crowd dynamics`);
  if (hasSpeech && scores.story >= 70) points.push(`✓ Complete Thought Arc — Structured narrative progression`);
  if (points.length < 2) {
    points.push(`✓ Optimal Duration (${scores.shortsP}%) — Clean 9:16 vertical shorts pacing`);
  }
  return points.slice(0, 3);
}

// ── Non-Maximum Suppression (NMS) to eliminate overlapping moments ──

function suppressOverlappingCandidates(candidates: RawCandidate[]): RawCandidate[] {
  if (candidates.length === 0) return [];

  // Sort primarily by score descending
  const sorted = [...candidates].sort((a, b) => b.scores.total - a.scores.total);
  const selected: RawCandidate[] = [];

  for (const candidate of sorted) {
    const overlaps = selected.some(existing => {
      const overlapStart = Math.max(existing.startTime, candidate.startTime);
      const overlapEnd = Math.min(existing.endTime, candidate.endTime);
      if (overlapStart >= overlapEnd) return false;

      const overlapDur = overlapEnd - overlapStart;
      const minDur = Math.min(existing.duration, candidate.duration);
      return (overlapDur / minDur) > 0.40; // 40% overlap threshold
    });

    if (!overlaps) {
      selected.push(candidate);
    }
  }

  return selected;
}
