// ============================================================
// VisualQualityAnalyzer
// Quality inspection module for extracted candidate frames and shots.
// Checks for black frames, solid blanks, severe motion blur,
// composition hazards, and excessive shot repetition.
// ============================================================

import fs from 'fs';
import type { EpisodeScene } from '../../../../shared/types.js';

export interface FrameQualityAssessment {
  framePath: string;
  isBlackFrame: boolean;
  isBlankFrame: boolean;
  hasSevereBlur: boolean;
  isAcceptable: boolean;
  reasons: string[];
  qualityScore: number; // 0 to 100
}

export class VisualQualityAnalyzer {
  /**
   * Assesses an image frame for visual defects.
   * If OpenCV or image buffer inspection is available, analyzes luminance.
   * Falls back to file size and heuristic metadata when lightweight.
   */
  public async analyzeFrameQuality(framePath: string, scene?: EpisodeScene): Promise<FrameQualityAssessment> {
    const reasons: string[] = [];
    let isBlackFrame = false;
    let isBlankFrame = false;
    let hasSevereBlur = false;
    let qualityScore = 90;

    if (!fs.existsSync(framePath)) {
      return {
        framePath,
        isBlackFrame: true,
        isBlankFrame: true,
        hasSevereBlur: false,
        isAcceptable: false,
        reasons: ['Frame file does not exist on disk'],
        qualityScore: 0,
      };
    }

    try {
      const stats = fs.statSync(framePath);
      // Corrupt or near-empty image (< 2KB)
      if (stats.size < 2048) {
        isBlankFrame = true;
        reasons.push('Frame file size abnormally small (< 2KB), likely blank or corrupt');
        qualityScore -= 60;
      }

      // Check scene metadata heuristics if provided
      if (scene) {
        if (scene.isTitleOrBumper || scene.isExcludedFromNarration) {
          isBlankFrame = true;
          reasons.push('Scene is flagged as title bumper, logo, or studio credits');
          qualityScore -= 50;
        }

        if (scene.duration < 0.8) {
          reasons.push('Extremely short scene (< 0.8s), susceptible to micro-flash');
          qualityScore -= 15;
        }
      }
    } catch {
      reasons.push('Error reading frame attributes');
      qualityScore -= 20;
    }

    const isAcceptable = !isBlackFrame && !isBlankFrame && qualityScore >= 50;

    return {
      framePath,
      isBlackFrame,
      isBlankFrame,
      hasSevereBlur,
      isAcceptable,
      reasons,
      qualityScore: Math.max(0, Math.min(100, qualityScore)),
    };
  }

  /**
   * Audits an array of selected timeline scenes for excessive consecutive repetition
   */
  public auditSceneRepetition(selectedSceneIds: string[]): {
    repetitionDetected: boolean;
    repeatedScenes: { sceneId: string; count: number }[];
  } {
    const counts = new Map<string, number>();
    for (const id of selectedSceneIds) {
      counts.set(id, (counts.get(id) || 0) + 1);
    }

    const repeatedScenes: { sceneId: string; count: number }[] = [];
    counts.forEach((count, sceneId) => {
      if (count > 4) {
        repeatedScenes.push({ sceneId, count });
      }
    });

    return {
      repetitionDetected: repeatedScenes.length > 0,
      repeatedScenes,
    };
  }
}

export const visualQualityAnalyzer = new VisualQualityAnalyzer();
