// ============================================================
// MatchConfidenceEngine
// Strict confidence attribution, breakdown normalization,
// and honest categorical classification without score inflation.
// ============================================================

import type { SceneMatchCandidate } from './StorySceneMatcher.js';

export type HonestMatchStatus = 'matched' | 'needs_review' | 'unmatched' | 'manually_approved';

export interface ScoreBreakdownAssessment {
  semanticScore: number;         // 0-22
  characterScore: number;        // 0-20
  actionEventScore: number;      // 0-15
  transcriptAnchorScore: number; // 0-35
  visualContinuityScore: number; // 0-15
  chronologyScore: number;       // 0-15
  stageBVerificationScore: number; // -40 to +15
  totalNormalizedScore: number;  // 0-100
  confidence: number;            // 0.00-1.00
  status: HonestMatchStatus;
  primaryReason: string;
  hasDirectSubstance: boolean;
}

export class MatchConfidenceEngine {
  /**
   * Assesses a candidate match strictly against evidence thresholds
   */
  public evaluateConfidence(candidate: SceneMatchCandidate, isUserApproved: boolean = false): ScoreBreakdownAssessment {
    if (isUserApproved) {
      return {
        semanticScore: candidate.scoreBreakdown?.semanticScore || 15,
        characterScore: candidate.scoreBreakdown?.characterScore || 15,
        actionEventScore: candidate.scoreBreakdown?.actionEventScore || 10,
        transcriptAnchorScore: candidate.scoreBreakdown?.transcriptAnchorScore || 20,
        visualContinuityScore: candidate.scoreBreakdown?.visualContinuityScore || 10,
        chronologyScore: candidate.scoreBreakdown?.chronologyScore || 10,
        stageBVerificationScore: 10,
        totalNormalizedScore: Math.max(85, candidate.matchScore),
        confidence: 0.95,
        status: 'manually_approved',
        primaryReason: 'User explicitly approved and verified this scene selection.',
        hasDirectSubstance: true,
      };
    }

    const sb = candidate.scoreBreakdown || {
      semanticScore: 0,
      characterScore: 0,
      visualContinuityScore: 0,
      actionEventScore: 0,
      narrativeRoleScore: 0,
      chronologyScore: 0,
    };

    const transcriptAnchor = sb.transcriptAnchorScore || 0;
    const semantic = sb.semanticScore || 0;
    const character = sb.characterScore || 0;
    const action = sb.actionEventScore || 0;
    const continuity = sb.visualContinuityScore || 0;
    const chronology = sb.chronologyScore || 0;

    let stageBBonus = 0;
    if (candidate.stageBVerification) {
      if (candidate.stageBVerification.visualConfidence === 'HIGH') stageBBonus = 15;
      else if (candidate.stageBVerification.visualConfidence === 'MEDIUM') stageBBonus = 5;
      else if (candidate.stageBVerification.visualConfidence === 'REJECT') stageBBonus = -40;
    }

    // Direct substance check: Did the scene match narration text, characters, actions, or original movie dialogue?
    const hasDirectSubstance = transcriptAnchor > 0 || semantic > 0 || character > 0 || action > 7;

    const rawTotal = Math.max(
      0,
      Math.min(
        100,
        transcriptAnchor + semantic + character + action + continuity + chronology + stageBBonus
      )
    );

    const normalizedScore = hasDirectSubstance ? rawTotal : Math.min(25, rawTotal);
    const confidence = Number((normalizedScore / 100).toFixed(2));

    let status: HonestMatchStatus = 'unmatched';
    let primaryReason = 'Unmatched: Insufficient direct correlation between narration beat and movie footage';

    if (!hasDirectSubstance || normalizedScore < 50) {
      status = 'unmatched';
      primaryReason = candidate.reasons[0] || 'Unmatched: No direct visual or dialogue evidence found';
    } else if (normalizedScore >= 70) {
      status = 'matched';
      primaryReason = candidate.reasons[0] || 'Strongly matched with corroborated visual and story evidence';
    } else {
      status = 'needs_review';
      primaryReason = candidate.reasons[0] || 'Needs Review: Candidate scene found but requires creator verification';
    }

    return {
      semanticScore: semantic,
      characterScore: character,
      actionEventScore: action,
      transcriptAnchorScore: transcriptAnchor,
      visualContinuityScore: continuity,
      chronologyScore: chronology,
      stageBVerificationScore: stageBBonus,
      totalNormalizedScore: normalizedScore,
      confidence,
      status,
      primaryReason,
      hasDirectSubstance,
    };
  }
}

export const matchConfidenceEngine = new MatchConfidenceEngine();
