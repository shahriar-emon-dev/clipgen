// ============================================================
// StoryAnalyzer — Contextual Narrative Flow & Continuity Engine
// Analyzes transcript, topic continuity, conversational dialogue,
// energy peaks, and scene boundaries to construct coherent story arcs.
// ============================================================

import type {
  TranscriptSegment,
  Scene,
  AudioAnalysisResult,
  HighlightCandidate,
  LongFormEditStyle,
} from '../../../../shared/types.js';
import {
  HOOK_KEYWORDS,
  EMOTION_KEYWORDS,
  STRONG_OPENING_PATTERNS,
  CONCLUSION_PATTERNS,
  STORY_MARKERS,
} from '../../../../shared/constants.js';
import { v4 as uuid } from 'uuid';

export interface StoryUnit {
  id: string;
  sourceStart: number;
  sourceEnd: number;
  duration: number;
  text: string;
  title: string;
  summary: string;
  importanceScore: number;
  energyScore: number;
  storyRole: 'hook' | 'setup' | 'buildup' | 'climax' | 'resolution' | 'highlight';
  hasDeadAir: boolean;
  isRepetitive: boolean;
  topicWords: Set<string>;
}

export class StoryAnalyzer {
  /**
   * Analyzes all available modalities to extract narrative story units
   * with complete sentences and conversational continuity.
   */
  public analyzeStoryUnits(
    transcriptSegments: TranscriptSegment[],
    scenes: Scene[],
    audioAnalysis: AudioAnalysisResult | null,
    highlights: HighlightCandidate[],
    videoDuration: number,
    editStyle: LongFormEditStyle = 'narrative'
  ): StoryUnit[] {
    if (transcriptSegments.length === 0) {
      return this.generateFallbackSceneUnits(scenes, audioAnalysis, videoDuration);
    }

    // Step 1: Clean segments and group into continuous thought sentences/paragraphs
    const rawBlocks = this.groupIntoSentenceBlocks(transcriptSegments, scenes);

    // Identify bumper ranges to screen out non-narrative slates & intros
    const bumperScenes = scenes.filter(s => s.isBumper);
    const isInsideBumper = (start: number, end: number) => {
      return bumperScenes.some(b => Math.max(start, b.startTime) < Math.min(end, b.endTime) - 0.2);
    };

    // Step 2: Extract topic words and detect repetition
    const units: StoryUnit[] = [];
    const seenPhrases: string[] = [];

    for (let i = 0; i < rawBlocks.length; i++) {
      const block = rawBlocks[i];
      if (isInsideBumper(block.sourceStart, block.sourceEnd)) {
        continue;
      }
      const text = block.text.trim();
      if (text.length < 8 || block.duration < 1.5) continue;

      const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 3);
      const topicWords = new Set(words);

      // Repetition detection (Jaccard similarity with previously selected blocks)
      let isRepetitive = false;
      for (const prevPhrase of seenPhrases) {
        const sim = this.calculateWordOverlap(text, prevPhrase);
        if (sim > 0.65) {
          isRepetitive = true;
          break;
        }
      }

      if (!isRepetitive) {
        seenPhrases.push(text);
      }

      // Calculate Energy Score from Audio
      const energyScore = this.computeEnergyScore(block.sourceStart, block.sourceEnd, audioAnalysis);

      // Calculate Importance & Story Role
      const { importanceScore, storyRole } = this.evaluateImportanceAndRole(
        text,
        block.sourceStart,
        block.sourceEnd,
        videoDuration,
        energyScore,
        highlights,
        editStyle
      );

      // Check for excessive silence / dead air (> 2.0 seconds without speech within bounds)
      const hasDeadAir = this.detectDeadAir(block.sourceStart, block.sourceEnd, audioAnalysis);

      // Synthesize clean title & summary
      const { title, summary } = this.synthesizeTitleAndSummary(text, storyRole, i + 1);

      units.push({
        id: uuid(),
        sourceStart: block.sourceStart,
        sourceEnd: block.sourceEnd,
        duration: Number((block.sourceEnd - block.sourceStart).toFixed(2)),
        text,
        title,
        summary,
        importanceScore,
        energyScore,
        storyRole,
        hasDeadAir,
        isRepetitive,
        topicWords,
      });
    }

    return units;
  }

  /**
   * Groups transcript segments into sentence and topic blocks
   * ensuring no dialogue is cut mid-sentence.
   */
  private groupIntoSentenceBlocks(
    segments: TranscriptSegment[],
    scenes: Scene[]
  ): { sourceStart: number; sourceEnd: number; duration: number; text: string }[] {
    const blocks: { sourceStart: number; sourceEnd: number; duration: number; text: string }[] = [];

    const getStart = (s: any) => Number(s.startTime ?? s.start_time ?? 0);
    const getEnd = (s: any) => Number(s.endTime ?? s.end_time ?? 0);

    let currentStart = getStart(segments[0]);
    let currentEnd = getEnd(segments[0]);
    let currentText = segments[0].text;

    for (let i = 1; i < segments.length; i++) {
      const seg = segments[i];
      const segStart = getStart(seg);
      const segEnd = getEnd(seg);
      const gap = segStart - currentEnd;
      const currentTrimmed = currentText.trim();
      const endsWithPunctuation = /[.!?]$/.test(currentTrimmed);

      // Check if a major scene change happens between the segments
      const hasSceneCut = scenes.some(s => {
        const scStart = Number(s.startTime ?? (s as any).start_time ?? 0);
        return scStart >= currentEnd - 0.2 && scStart <= segStart + 0.2;
      });

      const isRepeatedAhead = this.calculateWordOverlap(currentText, seg.text) > 0.65;
      const shouldSplit =
        (endsWithPunctuation && (gap >= 0.4 || currentEnd - currentStart >= 5 || isRepeatedAhead)) ||
        gap > 1.5 ||
        (hasSceneCut && endsWithPunctuation) ||
        currentEnd - currentStart >= 25; // Keep single story units under 25s for modular editing

      if (shouldSplit) {
        blocks.push({
          sourceStart: Number(currentStart.toFixed(2)),
          sourceEnd: Number(currentEnd.toFixed(2)),
          duration: Number((currentEnd - currentStart).toFixed(2)),
          text: currentText.trim(),
        });
        currentStart = segStart;
        currentEnd = segEnd;
        currentText = seg.text;
      } else {
        currentEnd = segEnd;
        currentText += ' ' + seg.text;
      }
    }

    if (currentText.trim().length > 0) {
      blocks.push({
        sourceStart: Number(currentStart.toFixed(2)),
        sourceEnd: Number(currentEnd.toFixed(2)),
        duration: Number((currentEnd - currentStart).toFixed(2)),
        text: currentText.trim(),
      });
    }

    return blocks;
  }

  /**
   * Computes acoustic energy score (0-100) using audio peaks.
   */
  private computeEnergyScore(
    start: number,
    end: number,
    audioAnalysis: AudioAnalysisResult | null
  ): number {
    if (!audioAnalysis) return 50;

    let peakCount = 0;
    let totalPeakEnergy = 0;

    for (const peak of audioAnalysis.energyPeaks) {
      if (peak.time >= start && peak.time <= end) {
        peakCount++;
        totalPeakEnergy += peak.energy;
      }
    }

    if (peakCount === 0) return 40;
    const avgEnergy = totalPeakEnergy / peakCount;
    const score = Math.min(100, Math.round(avgEnergy * 70 + Math.min(30, peakCount * 6)));
    return Math.max(30, score);
  }

  /**
   * Evaluates narrative importance and story role based on lexical markers,
   * placement in timeline, highlights overlap, and edit style.
   */
  private evaluateImportanceAndRole(
    text: string,
    start: number,
    end: number,
    duration: number,
    energyScore: number,
    highlights: HighlightCandidate[],
    editStyle: LongFormEditStyle
  ): { importanceScore: number; storyRole: StoryUnit['storyRole'] } {
    const lower = text.toLowerCase();
    let score = 50;
    let storyRole: StoryUnit['storyRole'] = 'buildup';

    // Hook keywords
    for (const kw of HOOK_KEYWORDS) {
      if (lower.includes(kw)) {
        score += 8;
        break;
      }
    }

    // Emotion keywords
    for (const kw of EMOTION_KEYWORDS) {
      if (lower.includes(kw)) {
        score += 7;
        break;
      }
    }

    // Story markers & openers
    for (const pattern of STRONG_OPENING_PATTERNS) {
      if (pattern.test(text)) {
        score += 10;
        storyRole = 'hook';
        break;
      }
    }

    for (const marker of STORY_MARKERS) {
      if (marker.test(text)) {
        score += 8;
        if (storyRole !== 'hook') storyRole = 'setup';
        break;
      }
    }

    // Conclusion markers
    for (const pattern of CONCLUSION_PATTERNS) {
      if (pattern.test(text)) {
        score += 9;
        storyRole = 'resolution';
        break;
      }
    }

    // Position in overall video
    const relPos = duration > 0 ? start / duration : 0.5;
    if (relPos < 0.15 && storyRole === 'buildup') {
      storyRole = 'setup';
      score += 5;
    } else if (relPos > 0.85 && storyRole === 'buildup') {
      storyRole = 'resolution';
      score += 5;
    }

    // Highlight candidate overlap bonus
    for (const h of highlights) {
      const overlapStart = Math.max(start, h.startTime);
      const overlapEnd = Math.min(end, h.endTime);
      if (overlapEnd > overlapStart) {
        const overlapRatio = (overlapEnd - overlapStart) / Math.max(0.1, end - start);
        if (overlapRatio > 0.4) {
          score += Math.round((h.scoreTotal || 50) * 0.3);
          if (storyRole === 'buildup' && energyScore >= 70) {
            storyRole = 'climax';
          } else if (storyRole === 'buildup') {
            storyRole = 'highlight';
          }
        }
      }
    }

    // Style-specific adjustments
    if (editStyle === 'dynamic') {
      score = Math.round(score * 0.4 + energyScore * 0.6);
    } else if (editStyle === 'best_moments') {
      score = Math.round(score * 0.5 + (energyScore > 65 ? 20 : 0));
    }

    return {
      importanceScore: Math.min(100, Math.max(20, Math.round(score))),
      storyRole,
    };
  }

  /**
   * Checks if region contains excessive silence (>1.8s).
   */
  private detectDeadAir(
    start: number,
    end: number,
    audioAnalysis: AudioAnalysisResult | null
  ): boolean {
    if (!audioAnalysis) return false;
    for (const sil of audioAnalysis.silenceRegions) {
      const silStart = Math.max(start, sil.start);
      const silEnd = Math.min(end, sil.end);
      if (silEnd - silStart >= 1.8) {
        return true;
      }
    }
    return false;
  }

  /**
   * Generates clean title & concise summary from transcript block.
   */
  private synthesizeTitleAndSummary(
    text: string,
    role: StoryUnit['storyRole'],
    index: number
  ): { title: string; summary: string } {
    const rolePrefixes: Record<string, string> = {
      hook: 'Key Hook',
      setup: 'Context & Setup',
      buildup: 'Story Progression',
      climax: 'Peak Moment',
      resolution: 'Key Takeaway',
      highlight: 'Core Highlight',
    };

    const firstSentence = text.split(/[.!?]/)[0].trim();
    let words = firstSentence.split(/\s+/);
    if (words.length > 7) {
      words = words.slice(0, 7);
    }
    const cleanTitle = words.join(' ').replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '');
    const title = cleanTitle.length > 4 ? cleanTitle : `${rolePrefixes[role] || 'Part'} #${index}`;

    const summary = text.length > 120 ? `${text.slice(0, 117)}...` : text;

    return { title, summary };
  }

  /**
   * Word overlap similarity for duplicate speech suppression.
   */
  private calculateWordOverlap(a: string, b: string): number {
    const setA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    const setB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    if (setA.size === 0 || setB.size === 0) return 0;

    let intersection = 0;
    for (const w of setA) {
      if (setB.has(w)) intersection++;
    }
    const union = new Set([...setA, ...setB]).size;
    return intersection / union;
  }

  /**
   * Fallback for videos without transcripts (e.g. music/b-roll/silent scenes).
   */
  private generateFallbackSceneUnits(
    scenes: Scene[],
    audioAnalysis: AudioAnalysisResult | null,
    videoDuration: number
  ): StoryUnit[] {
    const units: StoryUnit[] = [];
    const rawScenes = scenes.length > 0 ? scenes : [
      { id: '1', projectId: '', sceneIndex: 0, startTime: 0, endTime: videoDuration, duration: videoDuration }
    ];

    for (let i = 0; i < rawScenes.length; i++) {
      const s = rawScenes[i];
      if (s.isBumper) continue;
      const energy = this.computeEnergyScore(s.startTime, s.endTime, audioAnalysis);
      const isClimax = energy >= 75;
      const role: StoryUnit['storyRole'] = i === 0 ? 'hook' : isClimax ? 'climax' : 'highlight';

      units.push({
        id: uuid(),
        sourceStart: s.startTime,
        sourceEnd: s.endTime,
        duration: Number((s.endTime - s.startTime).toFixed(2)),
        text: `Scene ${i + 1} (${Math.round(s.startTime)}s - ${Math.round(s.endTime)}s)`,
        title: `Scene #${i + 1}`,
        summary: `Visual scene cut with ${energy}% acoustic energy`,
        importanceScore: Math.min(95, 50 + Math.round(energy * 0.4)),
        energyScore: energy,
        storyRole: role,
        hasDeadAir: false,
        isRepetitive: false,
        topicWords: new Set(),
      });
    }

    return units;
  }
}
