// ============================================================
// SafeFramingEngine — 16:9 Composition-Aware Subject Protection
// Ensures main person, faces, bodies, action, and text remain
// safely within action-safe bounds without aggressive cut-offs.
// ============================================================

import type { SafeScaleFactor } from '../../../../shared/types.js';

export interface FramingAnalysisResult {
  recommendedScale: SafeScaleFactor;
  cropOffsetX: number; // 0..1 (horizontal centroid offset, default 0.5)
  isSafe: boolean;
  reducedReason?: string;
  filterString: string;
}

export class SafeFramingEngine {
  /**
   * Evaluates framing safety for a 16:9 segment given a requested scale factor.
   * If scaling would crop into high-action or top/bottom subject regions,
   * it automatically reduces the scale factor to a safe level.
   */
  public analyzeAndFrame(
    requestedScale: SafeScaleFactor,
    sourceWidth: number = 1920,
    sourceHeight: number = 1080,
    targetWidth: number = 1920,
    targetHeight: number = 1080,
    options: {
      actionSpread?: number;
      hasTopTextOrScoreboard?: boolean;
      focalOffsetX?: number; // 0..1
    } = {}
  ): FramingAnalysisResult {
    const actionSpread = options.actionSpread ?? 0.3;
    const hasTopText = options.hasTopTextOrScoreboard ?? false;
    let safeScale: SafeScaleFactor = requestedScale;
    let reducedReason: string | undefined;

    // Protection Rule 1: High Action Spread
    // If action covers wide area (>50% of the frame), scaling beyond 1.10x cuts off subjects/action
    if (actionSpread > 0.50 && requestedScale > 1.10) {
      safeScale = 1.10;
      reducedReason = 'Action spreads across wide frame; scale reduced to 110% to protect peripheral action.';
    } else if (actionSpread > 0.65 && requestedScale > 1.0) {
      safeScale = 1.0;
      reducedReason = 'Action covers full wide screen; scaling disabled (100% native) to avoid cutting subjects.';
    }

    // Protection Rule 2: Top / Bottom Content (UI, scoreboard, subtitles, heads)
    // Scale >= 1.20 cuts 8.3%+ from top/bottom. If top text or head clearance is tight, cap scale.
    if (hasTopText && safeScale > 1.10) {
      safeScale = 1.10;
      reducedReason = 'Top-edge content/text detected; scale capped at 110% to preserve header readability.';
    }

    // Protection Rule 3: Non-16:9 Source Aspect Ratio
    // If the source is not 16:9 (e.g. 4:3 or ultrawide 21:9), preserve aspect ratio with safe pillarbox/letterbox
    const sourceAspect = sourceWidth / Math.max(1, sourceHeight);
    const targetAspect = targetWidth / targetHeight;
    const isNear16x9 = Math.abs(sourceAspect - targetAspect) < 0.05;

    let filterString: string;
    const focalX = Math.max(0.1, Math.min(0.9, options.focalOffsetX ?? 0.5));

    if (!isNear16x9) {
      // Fit within 16:9 canvas with subtle dark pad or letterbox, never aggressive stretch
      filterString = `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1`;
    } else if (safeScale === 1.0) {
      // 100% pristine scale
      filterString = `scale=${targetWidth}:${targetHeight}:flags=bicubic,setsar=1`;
    } else {
      // Composition-aware controlled scale (110%, 120%, 126%, 128%)
      const scaledW = Math.round(targetWidth * safeScale);
      const scaledH = Math.round(targetHeight * safeScale);
      const maxCropX = scaledW - targetWidth;
      const cropX = Math.round(maxCropX * focalX);
      const cropY = Math.round((scaledH - targetHeight) / 2);

      filterString = `scale=${scaledW}:${scaledH}:flags=bicubic,crop=${targetWidth}:${targetHeight}:${cropX}:${cropY},setsar=1`;
    }

    return {
      recommendedScale: safeScale,
      cropOffsetX: focalX,
      isSafe: true,
      reducedReason,
      filterString,
    };
  }
}
