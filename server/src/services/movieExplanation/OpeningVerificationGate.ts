// ============================================================
// Opening Verification Gate — 120-Second Precision Narration & Visual Audit
// Prioritizes the first two minutes of the explanation video.
// Verifies sentence-by-sentence match relevance, alternative candidates,
// source-to-output timestamp mappings, and guarantees zero initial black screen.
// ============================================================

import type {
  MovieExplanationTimeline,
  EpisodeIntelligenceIndex,
  ExplanationScript,
  OpeningVerificationReport,
} from '../../../../shared/types.js';
import { storySceneMatcher } from './StorySceneMatcher.js';
import { titleBumperDetector } from './TitleBumperDetector.js';

export class OpeningVerificationGate {
  /**
   * Generates a comprehensive verification report for the opening 120-second zone.
   * Audits each narration unit, compares alternative scene candidates, and verifies zero black screen.
   */
  public verifyOpening(
    timeline: MovieExplanationTimeline,
    episodeIndex?: EpisodeIntelligenceIndex,
    script?: ExplanationScript,
    openingMaxDuration: number = 120
  ): OpeningVerificationReport {
    const issues: string[] = [];
    const warnings: string[] = [];
    const shots = timeline.shots || [];

    if (shots.length === 0) {
      return {
        openingDuration: openingMaxDuration,
        hasInitialBlackGap: true,
        initialBlackDuration: openingMaxDuration,
        firstFrameTimestamp: 0,
        isReadyForFullExport: false,
        issues: ['Timeline contains no shots to verify.'],
        warnings: [],
        narrationUnits: [],
      };
    }

    // ── Check 1: Zero-Point Initial Frame Check ──
    const firstShot = shots[0];
    const firstFrameTimestamp = firstShot.timelineStart;
    let hasInitialBlackGap = false;
    let initialBlackDuration = 0;

    if (firstShot.timelineStart > 0.05) {
      hasInitialBlackGap = true;
      initialBlackDuration = firstShot.timelineStart;
      issues.push(`Opening timeline gap detected: First video shot starts at ${firstShot.timelineStart.toFixed(3)}s instead of 0.000s.`);
    }

    // Check if opening shot samples from non-narrative title card or black bumper
    if (episodeIndex) {
      const openingScene = episodeIndex.scenes.find((s) => s.sceneId === firstShot.sceneId);
      if (
        openingScene?.isTitleOrBumper ||
        openingScene?.isExcludedFromNarration ||
        openingScene?.narrativePurpose === 'title_or_bumper' ||
        titleBumperDetector.isSceneTitleOrBumper(openingScene || ({} as any))
      ) {
        hasInitialBlackGap = true;
        initialBlackDuration = Math.max(initialBlackDuration, firstShot.duration);
        issues.push(`Opening shot #${firstShot.shotId} samples from non-narrative title card, definition slate, or black bumper.`);
      }
    }

    // ── Check 2: Audit Narration Units in First 120s ──
    const openingShots = shots.filter((s) => s.timelineStart < openingMaxDuration);
    const narrationUnits: OpeningVerificationReport['narrationUnits'] = [];

    const scriptSegments = script?.segments || [];

    for (let i = 0; i < openingShots.length; i++) {
      const shot = openingShots[i];
      const matchingSeg = scriptSegments.find((seg) => seg.segmentId === shot.segmentId);
      const narrationText = matchingSeg?.text || shot.sceneDialogue || shot.sceneDescription || `Shot ${shot.shotId}`;
      const intendedConcept = matchingSeg?.visualIntent || shot.whyThisScene?.storyContextReason || 'Establish narrative premise';

      const unitIssues: string[] = [];

      // Check low confidence
      if (shot.isLowConfidence || shot.matchScore < 48) {
        unitIssues.push(`Low semantic confidence (${Math.round(shot.matchScore)}%). Visual evidence is weak.`);
        warnings.push(`Unit #${shot.segmentId || i + 1} has low semantic confidence (${Math.round(shot.matchScore)}%).`);
      }

      // Check candidate alternatives
      const candidateAlternatives: Array<{
        sceneId: string;
        startTime: number;
        endTime: number;
        thumbnailUrl?: string;
        matchScore: number;
        reason: string;
      }> = [];

      if (episodeIndex && matchingSeg) {
        const candidates = storySceneMatcher.matchCandidatesForSegment(
          matchingSeg,
          episodeIndex,
          scriptSegments,
          i,
          new Set([shot.sceneId])
        );

        const alternatives = candidates
          .filter((c) => c.scene.sceneId !== shot.sceneId && !c.scene.isTitleOrBumper && c.matchScore > 0)
          .slice(0, 3);

        for (const alt of alternatives) {
          candidateAlternatives.push({
            sceneId: alt.scene.sceneId,
            startTime: alt.scene.startTime,
            endTime: alt.scene.endTime,
            thumbnailUrl: alt.scene.thumbnailUrl,
            matchScore: alt.matchScore,
            reason: alt.reasons[0] || `Match score: ${alt.matchScore}%`,
          });
        }
      }

      narrationUnits.push({
        segmentId: shot.segmentId || `seg_${String(i + 1).padStart(3, '0')}`,
        text: narrationText,
        voiceoverStart: shot.timelineStart,
        voiceoverEnd: shot.timelineEnd,
        intendedVisualConcept: intendedConcept,
        selectedShot: {
          shotId: shot.shotId,
          sceneId: shot.sceneId,
          sourceStart: shot.sourceStart,
          sourceEnd: shot.sourceEnd,
          thumbnailUrl: shot.thumbnailUrl,
        },
        candidateAlternatives,
        matchConfidence: shot.confidence || Number((shot.matchScore / 100).toFixed(2)),
        evidenceSummary: shot.whyThisScene?.fullSummary || `Scene ${shot.sceneId} selected for narration beat.`,
        unresolvedIssues: unitIssues.length > 0 ? unitIssues : undefined,
      });
    }

    const isReadyForFullExport = issues.length === 0 && !hasInitialBlackGap;

    return {
      openingDuration: Math.min(openingMaxDuration, shots[shots.length - 1].timelineEnd),
      hasInitialBlackGap,
      initialBlackDuration,
      firstFrameTimestamp,
      isReadyForFullExport,
      issues,
      warnings,
      narrationUnits,
    };
  }
}

export const openingVerificationGate = new OpeningVerificationGate();
