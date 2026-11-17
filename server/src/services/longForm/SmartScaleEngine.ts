// ============================================================
// SmartScaleEngine — Composition-Aware Controlled Scaling
// Handles Safe Edge Cleanup (100%–128%) for permitted edge removal
// while enforcing composition bounds and subject safety.
// ============================================================

import type { SafeScaleFactor, TimelineSegment, LongFormSettings } from '../../../../shared/types.js';
import { SafeFramingEngine, type FramingAnalysisResult } from './SafeFramingEngine.js';

export interface ScaledSegmentResult {
  segmentId: string;
  appliedScale: SafeScaleFactor;
  framingResult: FramingAnalysisResult;
}

export class SmartScaleEngine {
  private framingEngine: SafeFramingEngine;

  constructor() {
    this.framingEngine = new SafeFramingEngine();
  }

  /**
   * Evaluates and applies scaling for all timeline segments.
   * If safeEdgeCleanup is enabled, uses the user's maxScaleFactor (capped at safe limit).
   * Otherwise defaults to 1.0 (native) or smart scaling.
   */
  public processTimelineScaling(
    timeline: TimelineSegment[],
    settings: LongFormSettings,
    videoWidth: number = 1920,
    videoHeight: number = 1080
  ): ScaledSegmentResult[] {
    const targetScale: SafeScaleFactor = settings.safeEdgeCleanup
      ? settings.maxScaleFactor || 1.10
      : (settings.smartScaling ? 1.10 : 1.0);

    return timeline.map(segment => {
      const framingResult = this.framingEngine.analyzeAndFrame(
        targetScale,
        videoWidth,
        videoHeight,
        settings.outputWidth || 1920,
        settings.outputHeight || 1080,
        {
          actionSpread: segment.energyScore > 75 ? 0.45 : 0.25,
          focalOffsetX: segment.cropOffsetX ?? 0.5,
        }
      );

      return {
        segmentId: segment.id,
        appliedScale: framingResult.recommendedScale,
        framingResult,
      };
    });
  }

  /**
   * Generates FFmpeg video filter for a specific segment's scaling and framing.
   */
  public getSegmentFilter(
    segment: TimelineSegment,
    scaleFactor: SafeScaleFactor,
    targetWidth: number = 1920,
    targetHeight: number = 1080
  ): string {
    const analysis = this.framingEngine.analyzeAndFrame(
      scaleFactor,
      targetWidth,
      targetHeight,
      targetWidth,
      targetHeight,
      { focalOffsetX: segment.cropOffsetX ?? 0.5 }
    );
    return analysis.filterString;
  }
}
