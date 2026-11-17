// ============================================================
// Timeline Repair Engine — Automated Timeline Integrity & Safety
// Audits and safely heals gaps, overlaps, and boundary errors
// ============================================================

import fs from 'fs';
import { v4 as uuid } from 'uuid';
import type {
  VoiceoverTimeline,
  VoiceoverTimelineSegment,
  VoiceoverTimelineShot,
  FootageAsset,
} from '../../../../shared/types.js';

export interface TimelineRepairReport {
  isValid: boolean;
  totalGapsFixed: number;
  totalOverlapsFixed: number;
  totalSourceRangesClamped: number;
  missingMediaWarnings: string[];
  issues: string[];
}

export class TimelineRepairEngine {
  /**
   * Scans a generated or edited timeline, heals boundary discrepancies,
   * clamps source ranges, and validates complete coverage against the voiceover.
   */
  public repairAndValidateTimeline(
    timeline: VoiceoverTimeline,
    clipsMap: Map<string, FootageAsset>,
    totalVoiceoverDuration: number
  ): TimelineRepairReport {
    let totalGapsFixed = 0;
    let totalOverlapsFixed = 0;
    let totalSourceRangesClamped = 0;
    const missingMediaWarnings: string[] = [];
    const issues: string[] = [];

    const seenShotIds = new Set<string>();
    let expectedTimelineTime = 0;

    for (let sIdx = 0; sIdx < timeline.segments.length; sIdx++) {
      const seg = timeline.segments[sIdx];

      for (let shIdx = 0; shIdx < seg.shots.length; shIdx++) {
        const shot = seg.shots[shIdx];

        // 1. Ensure Unique Shot ID
        if (!shot.shotId || seenShotIds.has(shot.shotId)) {
          shot.shotId = `shot_${uuid().slice(0, 8)}`;
        }
        seenShotIds.add(shot.shotId);

        // 2. Validate Source Media Existence
        const clip = clipsMap.get(shot.clipId);
        if (clip) {
          if (!fs.existsSync(clip.sourceFile)) {
            missingMediaWarnings.push(`Source media missing on disk for clip ${shot.clipId}: ${clip.sourceFile}`);
          }
          // Clamp source ranges
          const maxDur = clip.duration || 3600;
          if (shot.sourceStart < 0) {
            shot.sourceStart = 0;
            totalSourceRangesClamped++;
          }
          if (shot.sourceEnd > maxDur) {
            shot.sourceEnd = Number(maxDur.toFixed(2));
            totalSourceRangesClamped++;
          }
          if (shot.sourceEnd <= shot.sourceStart) {
            shot.sourceEnd = Number(Math.min(maxDur, shot.sourceStart + shot.duration).toFixed(2));
            totalSourceRangesClamped++;
          }
        }

        // 3. Heal Timeline Gaps / Overlaps with previous shot
        const startDiff = shot.timelineStart - expectedTimelineTime;
        if (Math.abs(startDiff) > 0.001) {
          if (startDiff > 0 && startDiff < 0.25) {
            // Tiny sub-frame gap -> snap seamlessly
            shot.timelineStart = expectedTimelineTime;
            shot.duration = Number((shot.timelineEnd - shot.timelineStart).toFixed(3));
            totalGapsFixed++;
          } else if (startDiff < 0 && Math.abs(startDiff) < 0.25) {
            // Tiny sub-frame overlap -> snap seamlessly
            shot.timelineStart = expectedTimelineTime;
            shot.duration = Number((shot.timelineEnd - shot.timelineStart).toFixed(3));
            totalOverlapsFixed++;
          }
        }

        expectedTimelineTime = shot.timelineEnd;
      }
    }

    // 4. Check End of Timeline vs Total Voiceover Duration (Coverage Check)
    const finalEnd = expectedTimelineTime;
    const durationShortfall = totalVoiceoverDuration - finalEnd;
    if (durationShortfall > 0.1 && timeline.segments.length > 0) {
      // Extend the final shot to cover any trailing voiceover gap
      const lastSeg = timeline.segments[timeline.segments.length - 1];
      if (lastSeg.shots.length > 0) {
        const lastShot = lastSeg.shots[lastSeg.shots.length - 1];
        lastShot.timelineEnd = Number(totalVoiceoverDuration.toFixed(2));
        lastShot.duration = Number((lastShot.timelineEnd - lastShot.timelineStart).toFixed(2));
        lastSeg.voiceEnd = Number(totalVoiceoverDuration.toFixed(2));
        lastSeg.duration = Number((lastSeg.voiceEnd - lastSeg.voiceStart).toFixed(2));
        totalGapsFixed++;
      }
    }

    timeline.duration = Number(totalVoiceoverDuration.toFixed(2));

    const isValid = missingMediaWarnings.length === 0;

    return {
      isValid,
      totalGapsFixed,
      totalOverlapsFixed,
      totalSourceRangesClamped,
      missingMediaWarnings,
      issues,
    };
  }
}

export const timelineRepairEngine = new TimelineRepairEngine();
