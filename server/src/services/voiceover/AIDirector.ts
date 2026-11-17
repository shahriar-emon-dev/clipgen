// ============================================================
// AI Visual Director — Master Editorial Orchestrator
// Synthesizes Narration Intelligence + Footage Index into a
// coherent, synchronized, quality-preserving video timeline.
// ============================================================

import { v4 as uuid } from 'uuid';
import type {
  NarrationSegment,
  VisualFootageIndex,
  VoiceoverTimeline,
  VoiceoverTimelineSegment,
  VoiceoverTimelineShot,
  VoiceoverMatchingMode,
  VoiceoverOutputAspectRatio,
  FootageAsset,
} from '../../../../shared/types.js';
import { semanticVisualMatcher, type MatchingContext } from './SemanticVisualMatcher.js';
import { pacingEngine } from './PacingEngine.js';
import { timelineRepairEngine } from './TimelineRepairEngine.js';

export interface DirectorOptions {
  matchingMode?: VoiceoverMatchingMode;
  outputAspectRatio?: VoiceoverOutputAspectRatio;
  existingTimeline?: VoiceoverTimeline | null;
  captionsEnabled?: boolean;
}

export class AIDirector {
  /**
   * Generates or regenerates an automatic video timeline synchronized to voiceover narration.
   * Strictly respects locked segments (🔒) and manual overrides!
   */
  public generateTimeline(
    projectId: string,
    voiceoverId: string,
    segments: NarrationSegment[],
    index: VisualFootageIndex,
    totalVoiceoverDuration: number,
    options: DirectorOptions = {}
  ): VoiceoverTimeline {
    const matchingMode: VoiceoverMatchingMode = options.matchingMode || 'balanced';
    const outputAspectRatio: VoiceoverOutputAspectRatio = options.outputAspectRatio || '16:9';
    const existingTimeline = options.existingTimeline;

    // Fast lookup for locked shots by segmentId or timestamp
    const lockedShotsBySegment = new Map<string, VoiceoverTimelineShot[]>();
    if (existingTimeline) {
      for (const seg of existingTimeline.segments) {
        const hasLockedOrManual = seg.shots.some(s => s.isLocked || s.isManualOverride);
        if (hasLockedOrManual) {
          lockedShotsBySegment.set(seg.segmentId, seg.shots);
        }
      }
    }

    const clipsMap = new Map<string, FootageAsset>(index.clips.map((c: FootageAsset) => [c.clipId, c]));
    const clipUsageCount = new Map<string, number>();
    const lastUsedTimestamp = new Map<string, number>();

    const timelineSegments: VoiceoverTimelineSegment[] = [];
    let previousCandidate: any = null;

    // Process each narration segment along the master voiceover timeline
    for (let sIdx = 0; sIdx < segments.length; sIdx++) {
      const seg = segments[sIdx];
      const prevSeg = sIdx > 0 ? segments[sIdx - 1] : null;
      const nextSeg = sIdx < segments.length - 1 ? segments[sIdx + 1] : null;

      // Check if user locked or manually customized this segment (Section 30, 31, 32)
      if (lockedShotsBySegment.has(seg.segmentId)) {
        const preservedShots = lockedShotsBySegment.get(seg.segmentId)!;
        // Update usage counts for preserved clips
        for (const sh of preservedShots) {
          const u = clipUsageCount.get(sh.clipId) || 0;
          clipUsageCount.set(sh.clipId, u + 1);
          lastUsedTimestamp.set(sh.clipId, sh.timelineEnd);
        }
        timelineSegments.push({
          segmentId: seg.segmentId,
          voiceStart: seg.start,
          voiceEnd: seg.end,
          duration: seg.duration,
          text: seg.text,
          narrativePurpose: seg.narrativePurpose,
          shots: preservedShots,
        });
        continue;
      }

      // Step 1: Pacing Engine determines shot plan (single shot vs multi-shot sentence)
      const previousClipId = previousCandidate ? previousCandidate.clipId : null;
      const shotPlan = pacingEngine.planSegmentShots(seg, previousClipId, matchingMode);
      const generatedShots: VoiceoverTimelineShot[] = [];

      for (const plan of shotPlan) {
        const matchingCtx: MatchingContext = {
          mode: matchingMode,
          clipUsageCount,
          lastUsedTimestamp,
          currentTimelineTime: plan.timelineStart,
          previousCandidate,
          previousSegment: prevSeg,
          nextSegment: nextSeg,
        };

        // Step 2: Semantic Visual Matcher retrieves ranked candidates
        const candidates = semanticVisualMatcher.findBestCandidates(seg, index, matchingCtx, 5);

        // Step 3: Candidate Selection & Visual Hold logic (Section 24)
        let chosenCandidate = candidates[0];

        // Check if previous shot should continue (Visual Hold across sentences)
        if (
          plan.isVisualHoldAllowed &&
          previousCandidate &&
          chosenCandidate &&
          chosenCandidate.score.continuityScore >= 88 &&
          !seg.hasContrast &&
          seg.narrativePurpose !== 'contrast'
        ) {
          const prevClip = clipsMap.get(previousCandidate.clipId);
          if (prevClip && (previousCandidate.sourceEnd + plan.duration) <= prevClip.duration) {
            // Extend or continue current shot
            chosenCandidate = {
              ...previousCandidate,
              sourceStart: previousCandidate.sourceEnd,
              sourceEnd: Number((previousCandidate.sourceEnd + plan.duration).toFixed(2)),
              duration: plan.duration,
              score: {
                ...previousCandidate.score,
                overallScore: 92,
              },
              reasons: [
                '✓ Shot Hold: Maintains visual continuity across sentences',
                `✓ Same subject and location in "${prevClip.originalFilename}"`,
              ],
            };
          }
        }

        if (!chosenCandidate) {
          // Absolute fallback if index is empty or corrupted
          const anyClip = index.clips[0];
          chosenCandidate = {
            clipId: anyClip ? anyClip.clipId : 'clip_fallback',
            subSegmentId: 'sub_01',
            sourceStart: 0,
            sourceEnd: plan.duration,
            duration: plan.duration,
            thumbnailUrl: anyClip?.thumbnailUrl || '',
            clipFilename: anyClip?.originalFilename || 'fallback.mp4',
            score: {
              semanticScore: 40,
              actionScore: 40,
              entityScore: 40,
              environmentScore: 40,
              narrativeScore: 40,
              continuityScore: 50,
              durationScore: 50,
              qualityScore: 70,
              varietyScore: 50,
              reusePenalty: 0,
              overallScore: 45,
            },
            isLowConfidence: true,
            reasons: ['⚠ General visual coverage'],
          };
        }

        // Determine framing mode for output ratio (Section 42, 43, 44)
        let framingMode: any = 'action';
        if (outputAspectRatio === '9:16') {
          // If source is 16:9, evaluate whether to smart crop or lossless blur
          const clipObj = clipsMap.get(chosenCandidate.clipId);
          if (clipObj && (clipObj.width / Math.max(1, clipObj.height)) > 1.3) {
            framingMode = chosenCandidate.isLowConfidence ? 'blur_fill' : 'action';
          }
        }

        // Determine transition (Section 55)
        let transition: any = 'cut';
        let transitionDuration = 0;
        if (matchingMode === 'cinematic' && seg.narrativePurpose === 'establishing_shot' && sIdx > 0) {
          transition = 'dissolve';
          transitionDuration = 0.5;
        }

        // Record chosen shot
        const shotId = `shot_${uuid().slice(0, 8)}`;
        const shot: VoiceoverTimelineShot = {
          shotId,
          clipId: chosenCandidate.clipId,
          clipFilename: chosenCandidate.clipFilename || 'clip.mp4',
          sourceFile: clipsMap.get(chosenCandidate.clipId)?.sourceFile || '',
          sourceStart: chosenCandidate.sourceStart,
          sourceEnd: chosenCandidate.sourceEnd,
          timelineStart: plan.timelineStart,
          timelineEnd: plan.timelineEnd,
          duration: plan.duration,
          matchScore: chosenCandidate.score.overallScore,
          confidence: Number((chosenCandidate.score.overallScore / 100).toFixed(2)),
          isLowConfidence: chosenCandidate.isLowConfidence,
          reasons: chosenCandidate.reasons,
          transition,
          transitionDuration,
          isLocked: false,
          isManualOverride: false,
          framingMode,
          cropOffsetX: 0.5,
          scaleFactor: 1.0,
          thumbnailUrl: chosenCandidate.thumbnailUrl,
        };

        generatedShots.push(shot);

        // Update usage statistics
        const count = clipUsageCount.get(chosenCandidate.clipId) || 0;
        clipUsageCount.set(chosenCandidate.clipId, count + 1);
        lastUsedTimestamp.set(chosenCandidate.clipId, plan.timelineEnd);

        previousCandidate = chosenCandidate;
      }

      timelineSegments.push({
        segmentId: seg.segmentId,
        voiceStart: seg.start,
        voiceEnd: seg.end,
        duration: seg.duration,
        text: seg.text,
        narrativePurpose: seg.narrativePurpose,
        shots: generatedShots,
      });
    }

    // Determine native source resolution and frame rate to strictly preserve original footage quality
    let maxClipW = 0;
    let maxClipH = 0;
    let maxClipFps = 30;
    for (const clip of index.clips) {
      if (clip.width && clip.width > maxClipW) maxClipW = clip.width;
      if (clip.height && clip.height > maxClipH) maxClipH = clip.height;
      if (clip.fps && clip.fps > maxClipFps) maxClipFps = Math.min(60, Math.round(clip.fps));
    }

    let outW = 1920;
    let outH = 1080;
    if (outputAspectRatio === '16:9') {
      if (maxClipW >= 3840 || maxClipH >= 2160) {
        outW = 3840;
        outH = 2160;
      } else if (maxClipW >= 2560 || maxClipH >= 1440) {
        outW = 2560;
        outH = 1440;
      } else {
        outW = 1920;
        outH = 1080;
      }
    } else if (outputAspectRatio === '9:16') {
      if (maxClipH >= 3840 || maxClipW >= 2160) {
        outW = 2160;
        outH = 3840;
      } else if (maxClipH >= 2560 || maxClipW >= 1440) {
        outW = 1440;
        outH = 2560;
      } else {
        outW = 1080;
        outH = 1920;
      }
    } else if (outputAspectRatio === '1:1') {
      if (maxClipW >= 2160 || maxClipH >= 2160) {
        outW = 2160;
        outH = 2160;
      } else {
        outW = 1080;
        outH = 1080;
      }
    }

    const rawTimeline: VoiceoverTimeline = {
      timelineId: existingTimeline?.timelineId || `timeline_${uuid().slice(0, 8)}`,
      projectId,
      voiceoverId,
      duration: totalVoiceoverDuration,
      segments: timelineSegments,
      matchingMode,
      outputAspectRatio,
      outputWidth: outW,
      outputHeight: outH,
      outputFps: maxClipFps,
      captionsEnabled: options.captionsEnabled ?? true,
      musicVolume: 0.25,
      duckMusicUnderNarration: true,
      createdAt: existingTimeline?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Step 4: Run Timeline Repair Engine to guarantee zero gaps & full coverage (Section 25 & 56)
    timelineRepairEngine.repairAndValidateTimeline(rawTimeline, clipsMap, totalVoiceoverDuration);

    return rawTimeline;
  }
}

export const aiDirector = new AIDirector();
