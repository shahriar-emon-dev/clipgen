// ============================================================
// Pacing Engine & Visual Shot Planner
// Calculates editing rhythm, multi-shot sentence splitting,
// and natural visual holds based on narration speed & story.
// ============================================================

import type {
  NarrationSegment,
  VoiceoverMatchingMode,
} from '../../../../shared/types.js';

export interface ShotPlanInstruction {
  subShotIndex: number;
  timelineStart: number;
  timelineEnd: number;
  duration: number;
  actionFocus?: string;
  locationFocus?: string;
  isVisualHoldAllowed: boolean;
}

export class PacingEngine {
  /**
   * Plans the visual shot breakdown for a narration segment.
   * Understands when a single sentence describes multiple actions/locations
   * (e.g. "He left the airport, crossed the city, and finally reached the hotel"),
   * vs when a single shot should hold across consecutive sentences.
   */
  public planSegmentShots(
    segment: NarrationSegment,
    previousShotClipId: string | null,
    mode: VoiceoverMatchingMode
  ): ShotPlanInstruction[] {
    const duration = segment.duration;
    const text = segment.text;
    const wordCount = (segment.wordTimestamps || []).length || text.split(/\s+/).length;
    const wordsPerSec = wordCount / Math.max(0.5, duration);

    // If matching mode is 'minimal_cuts', strongly favor a single visual hold
    if (mode === 'minimal_cuts') {
      return [{
        subShotIndex: 0,
        timelineStart: segment.start,
        timelineEnd: segment.end,
        duration,
        isVisualHoldAllowed: true,
      }];
    }

    // Multi-shot sentence detection (Section 16 & 17)
    // E.g.: "He left the airport, crossed the city, and finally reached the hotel."
    const hasMultipleActions = this.detectMultipleDistinctActions(segment);
    const shouldSubdivide = (duration >= 8.0) || (hasMultipleActions && duration >= 5.0) || (mode === 'fast_pacing' && duration >= 4.5);

    if (shouldSubdivide) {
      return this.subdivideMultiShotSentence(segment);
    }

    // Default: Single shot covering this narration segment with contextual hold allowance
    const isHoldAllowed = !segment.hasContrast && segment.narrativePurpose !== 'contrast';

    return [{
      subShotIndex: 0,
      timelineStart: segment.start,
      timelineEnd: segment.end,
      duration,
      isVisualHoldAllowed: isHoldAllowed,
    }];
  }

  /**
   * Detects whether a complex sentence contains multiple distinct visual action beats.
   */
  private detectMultipleDistinctActions(seg: NarrationSegment): boolean {
    const text = seg.text.toLowerCase();
    const actionVerbs = [
      'entered', 'left', 'walked', 'ran', 'reached', 'crossed', 'opened',
      'climbed', 'discovered', 'arrived', 'escaped', 'turned', 'jumped',
    ];

    let matchCount = 0;
    for (const v of actionVerbs) {
      if (new RegExp(`\\b${v}\\b`).test(text)) {
        matchCount++;
      }
    }

    // If 2 or more distinct action verbs connected by commas or "and"
    return matchCount >= 2 && (text.includes(',') || text.includes(' and '));
  }

  /**
   * Subdivides complex sentence into 2 or 3 distinct timed shots.
   */
  private subdivideMultiShotSentence(seg: NarrationSegment): ShotPlanInstruction[] {
    const words = seg.wordTimestamps || [];
    const instructions: ShotPlanInstruction[] = [];
    const duration = seg.duration;

    if (words.length === 0) {
      const numShots = duration >= 14 ? 3 : 2;
      const shotDur = Number((duration / numShots).toFixed(2));
      let curTime = seg.start;
      for (let i = 0; i < numShots; i++) {
        const endTime = i === numShots - 1 ? seg.end : Number((curTime + shotDur).toFixed(2));
        instructions.push({
          subShotIndex: i,
          timelineStart: curTime,
          timelineEnd: endTime,
          duration: Number((endTime - curTime).toFixed(2)),
          isVisualHoldAllowed: false,
        });
        curTime = endTime;
      }
      return instructions;
    }

    // Find natural comma or conjunction pivot points
    const pivotIndices: number[] = [];
    for (let i = 2; i < words.length - 2; i++) {
      const w = words[i];
      if (/[,;]/.test(w.word) || /\b(and|then)\b/i.test(w.word)) {
        pivotIndices.push(i);
      }
    }

    if (pivotIndices.length === 0) {
      // Split evenly into 2 halves
      const half = Math.floor(words.length / 2);
      const midTime = words[half].start;
      instructions.push({
        subShotIndex: 0,
        timelineStart: seg.start,
        timelineEnd: midTime,
        duration: Number((midTime - seg.start).toFixed(2)),
        isVisualHoldAllowed: false,
      });
      instructions.push({
        subShotIndex: 1,
        timelineStart: midTime,
        timelineEnd: seg.end,
        duration: Number((seg.end - midTime).toFixed(2)),
        isVisualHoldAllowed: false,
      });
      return instructions;
    }

    // Split at selected pivot points (max 3 shots)
    const selectedPivots = pivotIndices.slice(0, 2);
    let curStart = seg.start;

    for (let p = 0; p < selectedPivots.length; p++) {
      const pivotWord = words[selectedPivots[p]];
      const shotEnd = pivotWord.end;
      instructions.push({
        subShotIndex: p,
        timelineStart: Number(curStart.toFixed(2)),
        timelineEnd: Number(shotEnd.toFixed(2)),
        duration: Number((shotEnd - curStart).toFixed(2)),
        isVisualHoldAllowed: false,
      });
      curStart = shotEnd;
    }

    // Final trailing shot
    instructions.push({
      subShotIndex: instructions.length,
      timelineStart: Number(curStart.toFixed(2)),
      timelineEnd: Number(seg.end.toFixed(2)),
      duration: Number((seg.end - curStart).toFixed(2)),
      isVisualHoldAllowed: false,
    });

    return instructions;
  }
}

export const pacingEngine = new PacingEngine();
