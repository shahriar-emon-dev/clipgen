// ============================================================
// MultimodalCandidateVerifier
// Two-stage candidate retrieval and visual verification service.
// Stage A: Multi-factor candidate retrieval (5-10 candidates).
// Stage B: Vision verification using Model B to inspect frames,
// verify characters/actions, and reject contradictory candidates.
// ============================================================

import type {
  EpisodeScene,
  EpisodeIntelligenceIndex,
  ExplanationScriptSegment,
  VisionStageBVerification,
} from '../../../../shared/types.js';
import { modelOrchestrationService } from './ModelOrchestrationService.js';
import { storySceneMatcher, type SceneMatchCandidate } from './StorySceneMatcher.js';

export interface TwoStageMatchResult {
  segmentId: string;
  selectedCandidate: SceneMatchCandidate;
  allCandidates: SceneMatchCandidate[];
  stageBVerifiedCount: number;
  rejectedCandidateIds: string[];
}

export class MultimodalCandidateVerifier {
  private verificationCache: Map<string, VisionStageBVerification> = new Map();

  /**
   * Performs Two-Stage Retrieval and Verification for a narration segment
   */
  public async verifyAndSelectCandidate(
    segment: ExplanationScriptSegment,
    episodeIndex: EpisodeIntelligenceIndex,
    allSegments: ExplanationScriptSegment[],
    segmentIndex: number,
    usedSceneIds: Set<string>,
    options: {
      enableStageB?: boolean;
      maxStageBCandidates?: number;
    } = {}
  ): Promise<TwoStageMatchResult> {
    // ── STAGE A: Candidate Retrieval (Top 5-10 candidates) ──
    const stageACandidates = storySceneMatcher.matchCandidatesForSegment(
      segment,
      episodeIndex,
      allSegments,
      segmentIndex,
      usedSceneIds
    );

    if (stageACandidates.length === 0) {
      throw new Error(`Stage A retrieval returned 0 candidates for segment ${segment.segmentId}`);
    }

    const rejectedCandidateIds: string[] = [];
    let stageBVerifiedCount = 0;

    // If Stage B is disabled or no candidates need verification, return top candidate
    if (options.enableStageB === false) {
      return {
        segmentId: segment.segmentId,
        selectedCandidate: stageACandidates[0],
        allCandidates: stageACandidates,
        stageBVerifiedCount: 0,
        rejectedCandidateIds: [],
      };
    }

    // ── STAGE B: Visual Verification (Shortlist top 3-5) ──
    const shortlistLimit = options.maxStageBCandidates || 3;
    const candidatesToVerify = stageACandidates.slice(0, shortlistLimit);

    for (const cand of candidatesToVerify) {
      const scene = cand.scene;
      const cacheKey = `${segment.segmentId}_${scene.sceneId}`;

      let verification = this.verificationCache.get(cacheKey);
      if (!verification) {
        // Inspect candidate representative frames
        const framePaths = scene.representativeFramePaths || (scene.thumbnailUrl ? [scene.thumbnailUrl] : []);
        if (framePaths.length > 0) {
          const reqs = {
            segmentId: segment.segmentId,
            narrationText: segment.text,
            targetCharacters: segment.referencedCharacters || [],
            requiredAction: segment.visualIntent || segment.storyEventOrAction || '',
            expectedLocation: scene.location,
            sceneType: 'action_beat' as const,
            searchKeywords: [segment.text.slice(0, 30)],
          };
          verification = await modelOrchestrationService.verifySceneVisualEvidenceModelB(
            scene,
            reqs,
            framePaths
          );
          stageBVerifiedCount++;
          this.verificationCache.set(cacheKey, verification);
        }
      }

      if (verification) {
        cand.stageBVerification = verification;

        // Apply Model B rating adjustment
        if (verification.visualConfidence === 'REJECT') {
          cand.matchScore = Math.max(0, cand.matchScore - 40);
          cand.confidence = Number((cand.matchScore / 100).toFixed(2));
          cand.reasons.unshift(`[STAGE B REJECTED] ${verification.reason}`);
          rejectedCandidateIds.push(scene.sceneId);
        } else if (verification.visualConfidence === 'HIGH') {
          cand.matchScore = Math.min(100, cand.matchScore + 15);
          cand.confidence = Number((cand.matchScore / 100).toFixed(2));
          cand.reasons.unshift(`[STAGE B VERIFIED HIGH] ${verification.reason}`);
        } else if (verification.visualConfidence === 'MEDIUM') {
          cand.matchScore = Math.min(100, cand.matchScore + 5);
          cand.confidence = Number((cand.matchScore / 100).toFixed(2));
          cand.reasons.push(`[STAGE B VERIFIED MEDIUM] ${verification.reason}`);
        }
      }
    }

    // Re-sort candidates after Stage B visual verification
    stageACandidates.sort((a, b) => b.matchScore - a.matchScore);

    return {
      segmentId: segment.segmentId,
      selectedCandidate: stageACandidates[0],
      allCandidates: stageACandidates,
      stageBVerifiedCount,
      rejectedCandidateIds,
    };
  }

  /**
   * Clear cache for fresh project runs
   */
  public clearCache(): void {
    this.verificationCache.clear();
  }
}

export const multimodalCandidateVerifier = new MultimodalCandidateVerifier();
