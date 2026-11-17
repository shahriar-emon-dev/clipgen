// ============================================================
// SegmentSelector — Intelligent Target-Duration Timeline Selector
// Selects connected, high-value segments to assemble a coherent
// 3–5m, 5–7m, 7–10m, or custom duration narrative timeline.
// ============================================================

import type {
  TimelineSegment,
  LongFormTargetDuration,
  LongFormEditStyle,
  TransitionType,
  SafeScaleFactor,
} from '../../../../shared/types.js';
import { TARGET_DURATION_RANGES } from '../../../../shared/constants.js';
import type { StoryUnit } from './StoryAnalyzer.js';
import { v4 as uuid } from 'uuid';

export interface SelectionOptions {
  targetDuration: LongFormTargetDuration;
  customDurationSeconds?: number;
  editStyle?: LongFormEditStyle;
  defaultTransition?: TransitionType;
  defaultScaleFactor?: SafeScaleFactor;
}

export class SegmentSelector {
  /**
   * Intelligently selects and orders story units into a timeline close to target duration,
   * strictly adhering to chronological narrative continuity.
   */
  public selectTimelineSegments(
    storyUnits: StoryUnit[],
    options: SelectionOptions
  ): TimelineSegment[] {
    if (storyUnits.length === 0) return [];

    // Determine target duration bounds
    const bounds = TARGET_DURATION_RANGES[options.targetDuration] || TARGET_DURATION_RANGES['5-7'];
    let targetSeconds = bounds.targetSeconds;
    let minSeconds = bounds.minSeconds;
    let maxSeconds = bounds.maxSeconds;

    if (options.targetDuration === 'custom' && options.customDurationSeconds && options.customDurationSeconds > 0) {
      targetSeconds = options.customDurationSeconds;
      minSeconds = Math.max(30, Math.round(targetSeconds * 0.85));
      maxSeconds = Math.round(targetSeconds * 1.15);
    }

    // Filter out repetitive, broken units, and non-narrative title cards/bumpers
    const validUnits = storyUnits.filter(
      u => !u.isRepetitive && u.duration >= 2.0 && !(u as any).isBumper && !(u as any).isTitleOrBumper
    );
    if (validUnits.length === 0) {
      return this.toTimelineSegments(storyUnits.slice(0, 10), options);
    }

    // Total available duration
    const totalAvailable = validUnits.reduce((acc, u) => acc + u.duration, 0);

    // If total video is already shorter than target or within range, keep all in chronological order
    if (totalAvailable <= maxSeconds) {
      return this.toTimelineSegments(validUnits, options);
    }

    // Strategy: Knapsack-like narrative budget selection
    // 1. Mandatory Hook: Best scoring unit in first 25% of video
    // 2. Mandatory Resolution: Best scoring unit in final 20% of video
    // 3. Middle Core: Fill remaining duration budget with highest importance & climax moments
    const selected = this.optimizeNarrativeSelection(validUnits, minSeconds, maxSeconds, targetSeconds, options.editStyle);

    // Ensure strictly chronological ordering for natural storytelling
    selected.sort((a, b) => a.sourceStart - b.sourceStart);

    // Suppress any accidental overlapping units
    const deduplicated: StoryUnit[] = [];
    for (const unit of selected) {
      const overlaps = deduplicated.some(
        d => Math.max(d.sourceStart, unit.sourceStart) < Math.min(d.sourceEnd, unit.sourceEnd)
      );
      if (!overlaps) {
        deduplicated.push(unit);
      }
    }

    return this.toTimelineSegments(deduplicated, options);
  }

  /**
   * Balances story arc roles (Hook, Setup, Buildup, Climax, Resolution)
   * while filling the duration budget.
   */
  private optimizeNarrativeSelection(
    units: StoryUnit[],
    minSec: number,
    maxSec: number,
    targetSec: number,
    editStyle: LongFormEditStyle = 'narrative'
  ): StoryUnit[] {
    const selected: StoryUnit[] = [];
    let currentDuration = 0;

    // 1. Hook selection (first 25% of timeline)
    const earlyUnits = units.filter(u => u.sourceStart <= units[units.length - 1].sourceEnd * 0.25);
    const bestHook = earlyUnits.sort((a, b) => (b.storyRole === 'hook' ? 20 : 0) + b.importanceScore - ((a.storyRole === 'hook' ? 20 : 0) + a.importanceScore))[0];

    if (bestHook) {
      selected.push(bestHook);
      currentDuration += bestHook.duration;
    }

    // 2. Resolution selection (last 25% of timeline)
    const lateUnits = units.filter(u => u.sourceStart >= units[units.length - 1].sourceEnd * 0.75 && !selected.includes(u));
    const bestResolution = lateUnits.sort((a, b) => (b.storyRole === 'resolution' ? 20 : 0) + b.importanceScore - ((a.storyRole === 'resolution' ? 20 : 0) + a.importanceScore))[0];

    if (bestResolution) {
      selected.push(bestResolution);
      currentDuration += bestResolution.duration;
    }

    // 3. Score remaining candidate units
    const pool = units.filter(u => !selected.includes(u));
    pool.sort((a, b) => {
      // Prioritize climax and high importance
      let scoreA = a.importanceScore;
      let scoreB = b.importanceScore;
      if (a.storyRole === 'climax') scoreA += 25;
      if (b.storyRole === 'climax') scoreB += 25;
      if (a.storyRole === 'highlight') scoreA += 15;
      if (b.storyRole === 'highlight') scoreB += 15;
      if (editStyle === 'dynamic') {
        scoreA += a.energyScore * 0.3;
        scoreB += b.energyScore * 0.3;
      }
      return scoreB - scoreA;
    });

    for (const candidate of pool) {
      if (currentDuration + candidate.duration <= maxSec) {
        selected.push(candidate);
        currentDuration += candidate.duration;

        // Check if we hit ideal target threshold
        if (currentDuration >= targetSec && currentDuration >= minSec) {
          break;
        }
      }
    }

    return selected;
  }

  /**
   * Converts StoryUnits to final TimelineSegments with transition and framing defaults.
   */
  private toTimelineSegments(
    units: StoryUnit[],
    options: SelectionOptions
  ): TimelineSegment[] {
    const transition = options.defaultTransition || 'crossfade';
    const scale = options.defaultScaleFactor || 1.0;

    return units.map((u, index) => ({
      id: u.id || uuid(),
      sourceStart: u.sourceStart,
      sourceEnd: u.sourceEnd,
      duration: u.duration,
      title: u.title,
      summary: u.summary,
      importanceScore: u.importanceScore,
      energyScore: u.energyScore,
      storyRole: u.storyRole,
      cropOffsetX: 0.5,
      scaleFactor: scale,
      transitionIn: index === 0 ? 'cut' : transition,
      transitionOut: index === units.length - 1 ? 'cut' : transition,
      isEnabled: true,
      order: index + 1,
    }));
  }
}
