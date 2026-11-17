// ============================================================
// Semantic Visual Matcher — Multi-Level Context-Aware Engine
// Evaluates footage against narration intent, context, and story
// ============================================================

import type {
  NarrationSegment,
  VisualFootageIndex,
  VisualMatchCandidate,
  FootageAsset,
  FootageVisualSegment,
  VoiceoverMatchingMode,
} from '../../../../shared/types.js';
import { DEFAULT_MATCHING_WEIGHTS } from '../../../../shared/constants.js';

export interface MatchingContext {
  mode: VoiceoverMatchingMode;
  clipUsageCount: Map<string, number>;
  lastUsedTimestamp: Map<string, number>;
  currentTimelineTime: number;
  previousCandidate?: VisualMatchCandidate | null;
  previousSegment?: NarrationSegment | null;
  nextSegment?: NarrationSegment | null;
}

export class SemanticVisualMatcher {
  /**
   * Evaluates all clips in the index against a narration segment, returning ranked candidates.
   */
  public findBestCandidates(
    segment: NarrationSegment,
    index: VisualFootageIndex,
    context: MatchingContext,
    maxCandidates: number = 8
  ): VisualMatchCandidate[] {
    const candidates: VisualMatchCandidate[] = [];

    for (const clip of index.clips) {
      if (clip.analysisStatus !== 'analyzed' || !clip.visualSegments || clip.visualSegments.length === 0 || clip.isBumper) {
        continue;
      }

      // Evaluate each sub-segment in the clip
      for (const subSeg of clip.visualSegments) {
        if (subSeg.isBumper) continue;
        const candidate = this.scoreCandidate(segment, clip, subSeg, context);
        candidates.push(candidate);
      }
    }

    // Sort descending by overallScore
    candidates.sort((a, b) => b.score.overallScore - a.score.overallScore);

    return candidates.slice(0, maxCandidates);
  }

  /**
   * Scores a single clip sub-segment against narration segment with detailed breakdown.
   */
  public scoreCandidate(
    seg: NarrationSegment,
    clip: FootageAsset,
    subSeg: FootageVisualSegment,
    context: MatchingContext
  ): VisualMatchCandidate {
    const reasons: string[] = [];
    const weights = this.resolveWeightsForMode(context.mode);

    // 1. Semantic Score (0-100) — Overlap of visual concepts & tags
    const narrationConcepts = new Set([
      ...(seg.visualConcepts || []).map(c => c.toLowerCase()),
      ...(seg.location ? [seg.location.toLowerCase()] : []),
      ...(seg.time ? [seg.time.toLowerCase()] : []),
      ...(seg.action ? [seg.action.toLowerCase()] : []),
      ...(seg.entities || []).map(e => e.toLowerCase()),
    ]);

    const footageConcepts = new Set([
      ...(subSeg.semanticConcepts || []).map(c => c.toLowerCase()),
      ...(subSeg.subjects || []).map(s => s.toLowerCase()),
      ...(subSeg.actions || []).map(a => a.toLowerCase()),
      ...(subSeg.environment || []).map(e => e.toLowerCase()),
      ...(subSeg.shotCharacteristics || []).map(sc => sc.toLowerCase()),
      ...(clip.visualTags || []).map(vt => vt.toLowerCase()),
      ...(subSeg.timeOfDay ? [subSeg.timeOfDay.toLowerCase()] : []),
    ]);

    let overlapCount = 0;
    const matchedTokens: string[] = [];
    for (const nc of narrationConcepts) {
      if (footageConcepts.has(nc)) {
        overlapCount++;
        matchedTokens.push(nc);
      } else {
        // Partial substring match (e.g. "skyline" in "city skyline")
        for (const fc of footageConcepts) {
          if (fc.includes(nc) || nc.includes(fc)) {
            overlapCount += 0.7;
            matchedTokens.push(fc);
            break;
          }
        }
      }
    }

    const semanticScore = Math.min(100, Math.round((overlapCount / Math.max(1, narrationConcepts.size)) * 100));
    if (matchedTokens.length > 0) {
      reasons.push(`✓ Matches visual concepts: ${Array.from(new Set(matchedTokens)).slice(0, 3).join(', ')}`);
    }

    // 2. Action Score (0-100)
    let actionScore = 40; // baseline
    if (seg.action) {
      const segAction = seg.action.toLowerCase();
      const hasDirectAction = (subSeg.actions || []).some(a => a.toLowerCase().includes(segAction) || segAction.includes(a.toLowerCase()));
      if (hasDirectAction) {
        actionScore = 95;
        reasons.push(`✓ Matches described action: "${seg.action}"`);
      } else if (subSeg.motionIntensity > 60 && ['running', 'climbing', 'fast', 'sprinted'].some(a => segAction.includes(a))) {
        actionScore = 80;
        reasons.push('✓ Dynamic high-motion visual aligns with active narration');
      } else if (subSeg.motionIntensity < 25 && ['quiet', 'calm', 'rest', 'still', 'valley'].some(a => segAction.includes(a))) {
        actionScore = 80;
      }
    } else {
      actionScore = 70; // no specific action required
    }

    // 3. Entity & Subject Match (0-100)
    let entityScore = 50;
    if (seg.entities && seg.entities.length > 0) {
      const entityMatches = seg.entities.filter(e => {
        const lower = e.toLowerCase();
        return (subSeg.subjects || []).some(s => s.toLowerCase().includes(lower)) ||
          clip.originalFilename.toLowerCase().includes(lower);
      });
      if (entityMatches.length > 0) {
        entityScore = 95;
        reasons.push(`✓ Identifies entity: ${entityMatches.join(', ')}`);
      } else {
        entityScore = 45;
      }
    }

    // 4. Environment & Location Match (0-100)
    let envScore = 50;
    if (seg.location) {
      const loc = seg.location.toLowerCase();
      const hasEnv = (subSeg.environment || []).some(e => e.toLowerCase().includes(loc) || loc.includes(e.toLowerCase())) ||
        clip.originalFilename.toLowerCase().includes(loc);
      if (hasEnv) {
        envScore = 95;
        reasons.push(`✓ Aligns with setting/location: "${seg.location}"`);
      } else {
        envScore = 40;
      }
    } else {
      envScore = 70;
    }

    // 5. Narrative Role & Shot Fit (0-100)
    let narrativeScore = 60;
    if (seg.narrativePurpose === 'establishing_shot') {
      const isWide = (subSeg.shotCharacteristics || []).some(s => s.includes('wide') || s.includes('aerial') || s.includes('landscape'));
      if (isWide) {
        narrativeScore = 95;
        reasons.push('✓ Wide establishing composition fits narrative opening');
      }
    } else if (seg.narrativePurpose === 'contrast') {
      // Contrast handling (Section 36)
      if (context.previousCandidate) {
        const prevWasWide = context.previousCandidate.score.narrativeScore > 75;
        if (prevWasWide && (subSeg.shotCharacteristics || []).some(s => s.includes('close') || s.includes('ground') || subSeg.motionIntensity > 50)) {
          narrativeScore = 95;
          reasons.push('✓ Visual contrast aligns with narrative turning point ("but/however")');
        }
      }
    } else if (seg.narrativePurpose === 'hook' || seg.narrativePurpose === 'climax') {
      if (subSeg.motionIntensity > 55 || (subSeg.subjects || []).includes('person')) {
        narrativeScore = 90;
        reasons.push('✓ High engagement visual suitable for climax/hook');
      }
    }

    // 6. Continuity Score (0-100) (Section 20)
    let continuityScore = 75;
    if (context.previousCandidate) {
      const prevClipId = context.previousCandidate.clipId;
      if (prevClipId === clip.clipId) {
        // Shot Hold opportunity (Section 24)
        if (seg.narrativePurpose !== 'contrast' && !seg.hasContrast) {
          continuityScore = 92;
          reasons.push('✓ Visual Hold maintains shot continuity across thoughts');
        } else {
          continuityScore = 40; // contrast should trigger visual change!
        }
      }
    }

    // 7. Duration Suitability (0-100)
    const subDuration = subSeg.duration;
    let durationScore = 70;
    if (subDuration >= seg.duration) {
      durationScore = 95;
      reasons.push(`✓ Sub-scene duration (${subDuration.toFixed(1)}s) covers narration (${seg.duration.toFixed(1)}s)`);
    } else if (subDuration >= seg.duration * 0.7) {
      durationScore = 75;
    } else {
      durationScore = 40;
    }

    // 8. Quality Score (0-100)
    const qualityScore = clip.qualityScore || 80;
    if (qualityScore >= 85) {
      reasons.push('✓ High technical fidelity (pristine source resolution & bitrate)');
    }

    // 9. Variety & Reuse Penalty (Section 19 & 38)
    const usage = context.clipUsageCount ? (context.clipUsageCount.get(clip.clipId) || 0) : 0;
    let varietyScore = Math.max(10, 100 - usage * 25);
    let reusePenalty = 0;

    if (usage > 0) {
      const lastPos = context.lastUsedTimestamp ? (context.lastUsedTimestamp.get(clip.clipId) || 0) : 0;
      const timeSinceUse = (context.currentTimelineTime || 0) - lastPos;
      if (timeSinceUse < 60) {
        reusePenalty = Math.min(35, (60 - timeSinceUse) * 0.7 + usage * 5);
        reasons.push(`⚠ Clip previously used (${usage}x in last ${Math.round(timeSinceUse)}s)`);
      } else {
        reusePenalty = usage * 4;
      }
    } else {
      varietyScore = 100;
      reasons.push('✓ Fresh unused footage from library');
    }

    // Compute Overall Weighted Score
    const rawWeighted =
      semanticScore * weights.semanticScore +
      actionScore * weights.actionScore +
      entityScore * weights.entityScore +
      envScore * weights.environmentScore +
      narrativeScore * weights.narrativeScore +
      continuityScore * weights.continuityScore +
      durationScore * weights.durationScore +
      qualityScore * weights.qualityScore +
      varietyScore * weights.varietyScore -
      reusePenalty;

    const overallScore = Math.max(5, Math.min(100, Math.round(rawWeighted)));
    const isLowConfidence = overallScore < 64;

    if (isLowConfidence) {
      reasons.unshift('⚠ Moderate semantic alignment (review alternative footage)');
    }

    // Calculate source sub-range
    const sourceStart = subSeg.start;
    const sourceEnd = Number(Math.min(clip.duration, subSeg.start + seg.duration).toFixed(2));

    return {
      clipId: clip.clipId,
      subSegmentId: subSeg.subSegmentId,
      sourceStart,
      sourceEnd,
      duration: Number((sourceEnd - sourceStart).toFixed(2)),
      thumbnailUrl: subSeg.keyframeUrl || clip.thumbnailUrl,
      clipFilename: clip.originalFilename,
      score: {
        semanticScore,
        actionScore,
        entityScore,
        environmentScore: envScore,
        narrativeScore,
        continuityScore,
        durationScore,
        qualityScore,
        varietyScore,
        reusePenalty: Math.round(reusePenalty),
        overallScore,
      },
      isLowConfidence,
      reasons,
    };
  }

  /**
   * Mode-specific weight adaptations (Section 33).
   */
  private resolveWeightsForMode(mode: VoiceoverMatchingMode) {
    const base = { ...DEFAULT_MATCHING_WEIGHTS };
    switch (mode) {
      case 'maximum_semantic':
        base.semanticScore = 0.40;
        base.actionScore = 0.20;
        base.continuityScore = 0.05;
        base.varietyScore = 0.02;
        break;
      case 'cinematic':
        base.continuityScore = 0.22;
        base.narrativeScore = 0.18;
        base.qualityScore = 0.10;
        base.varietyScore = 0.05;
        break;
      case 'fast_pacing':
        base.actionScore = 0.25;
        base.varietyScore = 0.15;
        base.continuityScore = 0.05;
        break;
      case 'minimal_cuts':
        base.continuityScore = 0.30;
        base.durationScore = 0.15;
        base.varietyScore = 0.02;
        break;
      case 'maximum_variety':
        base.varietyScore = 0.25;
        break;
      case 'balanced':
      default:
        // Use default weights
        break;
    }
    return base;
  }
}

export const semanticVisualMatcher = new SemanticVisualMatcher();
