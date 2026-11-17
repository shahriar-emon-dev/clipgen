// ============================================================
// Title & Bumper Detector — Automated Non-Narrative Slate Elimination
// Automatically detects and eliminates title cards, definition slates,
// network bumpers, commercial blackouts, and end credits from narrative clipping.
// ============================================================

import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { v4 as uuid } from 'uuid';
import { ollamaVisionService } from './OllamaVisionService.js';
import { config } from '../../config/index.js';
import type { EpisodeScene } from '../../../../shared/types.js';

export interface FrameSignalStats {
  yAvg: number;
  yHigh: number;
  yLow: number;
  yMax: number;
  satAvg: number;
  satHigh: number;
  isMonochrome: boolean;
  isNearBlack: boolean;
}

export interface TitleBumperCheckResult {
  isTitleOrBumper: boolean;
  confidence: number;
  reason: string;
  stats?: FrameSignalStats;
  vlmDescription?: string;
}

export class TitleBumperDetector {
  /**
   * Probes a single frame image using FFmpeg signalstats to compute luminance, saturation, and contrast.
   */
  public getFrameSignalStats(imagePath: string): FrameSignalStats {
    try {
      const output = execSync(
        `"${config.ffmpegPath}" -v quiet -i "${imagePath}" -vf "signalstats,metadata=print:file=-" -f null -`,
        { encoding: 'utf8', maxBuffer: 1024 * 1024 }
      );

      const yAvg = parseFloat(output.match(/lavfi\.signalstats\.YAVG=([\d\.]+)/)?.[1] || '0');
      const yHigh = parseFloat(output.match(/lavfi\.signalstats\.YHIGH=([\d\.]+)/)?.[1] || '0');
      const yLow = parseFloat(output.match(/lavfi\.signalstats\.YLOW=([\d\.]+)/)?.[1] || '0');
      const yMax = parseFloat(output.match(/lavfi\.signalstats\.YMAX=([\d\.]+)/)?.[1] || '0');
      const satAvg = parseFloat(output.match(/lavfi\.signalstats\.SATAVG=([\d\.]+)/)?.[1] || '0');
      const satHigh = parseFloat(output.match(/lavfi\.signalstats\.SATHIGH=([\d\.]+)/)?.[1] || '0');

      return {
        yAvg,
        yHigh,
        yLow,
        yMax,
        satAvg,
        satHigh,
        isMonochrome: satAvg <= 3.0,
        isNearBlack: yAvg <= 22.0 && yHigh <= 15.0,
      };
    } catch {
      return {
        yAvg: 128,
        yHigh: 128,
        yLow: 0,
        yMax: 255,
        satAvg: 20,
        satHigh: 40,
        isMonochrome: false,
        isNearBlack: false,
      };
    }
  }

  /**
   * Analyzes an image frame and determines if it is a title card, definition slate, or black bumper.
   */
  public async evaluateImage(
    imagePath: string,
    dialogueSnippet?: string,
    existingVlmResult?: { hasTextOrSigns?: boolean; description?: string }
  ): Promise<TitleBumperCheckResult> {
    const stats = this.getFrameSignalStats(imagePath);

    // If already known from SmolVLM
    let vlm = existingVlmResult;
    if (!vlm && fs.existsSync(imagePath)) {
      try {
        vlm = await ollamaVisionService.analyzeFrame(imagePath, dialogueSnippet);
      } catch {}
    }

    const desc = (vlm?.description || '').toLowerCase();
    const hasText = !!vlm?.hasTextOrSigns;

    // Check textual markers from VLM description
    const textOnBlackPattern = /\b(black screen|white text|title|definition|slate|reads|word|letters|logo|font)\b/i;
    const isVlmTextOnBlack = textOnBlackPattern.test(desc) && (desc.includes('black') || desc.includes('dark'));

    // Check 0: Studio Logos & Production Bumpers (e.g., "Warner Bros. Television", "Universal", "Paramount", "Columbia", "20th Century", "HBO", "Netflix")
    const studioLogoPattern = /\b(warner bros|warner|wb|paramount|universal|columbia pictures|20th century|metro goldwyn|mgm|lionsgate|disney|marvel|hbo|netflix|bbc|television distribution|production company|studio logo|opening logo|presents|fanfare)\b/i;
    if (studioLogoPattern.test(desc)) {
      return {
        isTitleOrBumper: true,
        confidence: 0.99,
        reason: `Studio Logo / Production Slate detected: "${desc.slice(0, 80)}"`,
        stats,
        vlmDescription: vlm?.description,
      };
    }

    // Check 0b: Interval Screens, Intermissions, Chapter Cards & Credits
    const intervalPattern = /\b(intermission|interval|part \d+|chapter \d+|the end|end credits|opening credits|cast credits|directed by|written by|produced by|copyright|all rights reserved|commercial break|stay tuned)\b/i;
    if (intervalPattern.test(desc)) {
      return {
        isTitleOrBumper: true,
        confidence: 0.99,
        reason: `Interval Screen / Intermission / Credit Slate detected: "${desc.slice(0, 80)}"`,
        stats,
        vlmDescription: vlm?.description,
      };
    }

    // Check 1: Classic pure black definition slate or title card (e.g. "MENTALIST / noun...")
    // Pure monochrome (satAvg < 3.0) + mostly black (yAvg < 22) + white text (yMax > 180)
    if (stats.satAvg <= 3.5 && stats.yAvg <= 25.0 && stats.yMax >= 150) {
      return {
        isTitleOrBumper: true,
        confidence: 0.98,
        reason: `Title/Definition Slate: Monochrome black screen with high-contrast text (YAVG: ${stats.yAvg.toFixed(1)}, SAT: ${stats.satAvg.toFixed(1)})`,
        stats,
        vlmDescription: vlm?.description,
      };
    }

    // Check 2: Pure black frame or blackout transition
    if (stats.yAvg <= 14.0 && stats.yMax <= 40.0) {
      return {
        isTitleOrBumper: true,
        confidence: 0.99,
        reason: `Blackout frame / blank transition (YAVG: ${stats.yAvg.toFixed(1)})`,
        stats,
        vlmDescription: vlm?.description,
      };
    }

    // Check 3: SmolVLM explicitly identifies black screen displaying title or words
    if (isVlmTextOnBlack && stats.satAvg <= 8.0) {
      return {
        isTitleOrBumper: true,
        confidence: 0.95,
        reason: `VLM confirmed title card: "${desc.slice(0, 80)}"`,
        stats,
        vlmDescription: vlm?.description,
      };
    }

    // Check 4: Low saturation + text detected + virtually no dialogue
    if (hasText && stats.satAvg <= 4.0 && (!dialogueSnippet || dialogueSnippet.length < 15)) {
      return {
        isTitleOrBumper: true,
        confidence: 0.90,
        reason: `Monochrome title graphic with no dialogue (SAT: ${stats.satAvg.toFixed(1)})`,
        stats,
        vlmDescription: vlm?.description,
      };
    }

    return {
      isTitleOrBumper: false,
      confidence: 0.95,
      reason: `Natural episodic footage (YAVG: ${stats.yAvg.toFixed(1)}, SAT: ${stats.satAvg.toFixed(1)})`,
      stats,
      vlmDescription: vlm?.description,
    };
  }

  /**
   * Fast rule-based check on a scene metadata object to detect title cards,
   * interval/intermission screens, black frames, and logo slates without running FFmpeg.
   */
  public isSceneTitleOrIntervalScreen(scene: {
    tags?: string[];
    description?: string;
    visualDescription?: string;
    dialogueText?: string;
    isTitleOrBumper?: boolean;
    isExcludedFromNarration?: boolean;
    narrativePurpose?: string;
  }): boolean {
    if (scene.isTitleOrBumper || scene.isExcludedFromNarration) return true;
    if (scene.narrativePurpose === 'title_or_bumper') return true;

    const desc = scene.visualDescription || scene.description || '';
    const textToScan = `${desc} ${(scene.tags || []).join(' ')} ${scene.dialogueText || ''}`.toLowerCase();

    const forbiddenPatterns = [
      /\b(title card|title screen|opening title|definition slate)\b/i,
      /\b(interval|intermission|recap|previously on|stay tuned)\b/i,
      /\b(black screen|blank frame|blackout|static screen|test pattern)\b/i,
      /\b(end credits|opening credits|cast credits|directed by|written by)\b/i,
      /\b(warner bros|paramount|universal pictures|columbia pictures|20th century|mgm|lionsgate|disney|marvel studios|hbo|netflix|studio logo|production logo)\b/i,
    ];

    return forbiddenPatterns.some((p) => p.test(textToScan));
  }

  /**
   * Tests whether the opening of a video starts with a title card, definition slate, or bumper.
   * If detected, returns the end timestamp of the title slate (the first real narrative cut point).
   */
  public async detectOpeningTitleSlate(
    videoPath: string,
    cutPoints: number[] = [10.0]
  ): Promise<{ hasTitleSlate: boolean; slateEndCut: number; openingSlateEnd: number; reason: string }> {
    // Only inspect if there is an opening cut within the first 35 seconds
    const cuts = Array.isArray(cutPoints) && cutPoints.length > 0 ? cutPoints : [10.0];
    const firstCut = cuts.find((c) => c >= 2.0 && c <= 35.0) || 10.0;

    // Sample a frame halfway through the first segment
    const sampleTime = Number((firstCut * 0.5).toFixed(2));
    const tempThumb = path.join(os.tmpdir(), `title_check_${uuid().slice(0, 8)}.jpg`);

    try {
      execSync(`"${config.ffmpegPath}" -y -ss ${sampleTime} -i "${videoPath}" -vframes 1 -q:v 2 "${tempThumb}"`, {
        stdio: 'pipe',
      });

      const evaluation = await this.evaluateImage(tempThumb);
      if (fs.existsSync(tempThumb)) {
        try { fs.unlinkSync(tempThumb); } catch {}
      }

      if (evaluation.isTitleOrBumper) {
        return {
          hasTitleSlate: true,
          slateEndCut: firstCut,
          openingSlateEnd: firstCut,
          reason: `Opening title card detected (0.0s - ${firstCut.toFixed(1)}s): ${evaluation.reason}`,
        };
      }
    } catch (err: any) {
      if (fs.existsSync(tempThumb)) {
        try { fs.unlinkSync(tempThumb); } catch {}
      }
    }

    return { hasTitleSlate: false, slateEndCut: 0, openingSlateEnd: 0, reason: 'Opening footage is genuine narrative scene.' };
  }

  /**
   * Checks if an EpisodeScene should be classified as a title card or bumper.
   */
  public isSceneTitleOrBumper(scene: EpisodeScene): boolean {
    if (scene.isTitleOrBumper || scene.isExcludedFromNarration || scene.narrativePurpose === 'title_or_bumper') {
      return true;
    }

    const desc = (scene.description || (scene as any).visualSummary || '').toLowerCase();
    const hasTextSign = (scene.objectsAndEvidence || []).some((o) => o.toLowerCase().includes('text') || o.toLowerCase().includes('sign'));

    // Check for studio logos (e.g. Warner Bros Television, Paramount, etc.)
    const isStudioLogo = /\b(warner bros|warner|wb|paramount|universal|columbia pictures|20th century|metro goldwyn|mgm|lionsgate|disney|marvel|hbo|netflix|bbc|television distribution|production company|studio logo|opening logo|title card|definition slate)\b/i.test(desc);
    if (isStudioLogo) {
      return true;
    }

    // Check description tags
    if (
      (desc.includes('black screen') && (desc.includes('white text') || desc.includes('word') || desc.includes('title'))) ||
      (desc.includes('title card') || desc.includes('definition') || desc.includes('mentalist') || desc.includes('[bumper]'))
    ) {
      // If no characters and no real dialogue, it's definitely a title slate
      if ((scene.characters || []).length <= 1 && (!scene.dialogueSnippet || scene.dialogueSnippet.length < 20)) {
        return true;
      }
    }

    // Opening scene starting at 0s with text or logo and no real dialogue
    if (scene.startTime < 25.0 && (hasTextSign || isStudioLogo) && (!scene.dialogueSnippet || scene.dialogueSnippet.length < 20)) {
      return true;
    }

    return false;
  }

  /**
   * Scans a video across opening, closing, and candidate cut points to detect all bumper/slate ranges.
   * Works for any project video across all pipelines (Shorts, Compilations, Movie Explanations).
   */
  public async detectAllBumperRanges(
    videoPath: string,
    cutPoints: number[],
    totalDuration: number
  ): Promise<Array<{ startTime: number; endTime: number; type: 'intro_title' | 'outro_credits' | 'bumper' }>> {
    const bumperRanges: Array<{ startTime: number; endTime: number; type: 'intro_title' | 'outro_credits' | 'bumper' }> = [];

    // 1. Detect opening title slate
    const opening = await this.detectOpeningTitleSlate(videoPath, cutPoints);
    if (opening.hasTitleSlate && opening.slateEndCut > 0) {
      bumperRanges.push({
        startTime: 0,
        endTime: opening.slateEndCut,
        type: 'intro_title',
      });
    }

    // 2. Detect outro credits (in the last 45s of video)
    if (totalDuration > 60) {
      const closingCuts = cutPoints.filter((c) => c >= totalDuration - 45);
      const creditStart = closingCuts.length > 0 ? closingCuts[0] : totalDuration - 20;
      if (creditStart < totalDuration - 5) {
        const sampleTime = (creditStart + totalDuration) * 0.5;
        const tempThumb = path.join(os.tmpdir(), `outro_check_${uuid().slice(0, 8)}.jpg`);
        try {
          execSync(`"${config.ffmpegPath}" -y -ss ${sampleTime} -i "${videoPath}" -vframes 1 -q:v 2 "${tempThumb}"`, { stdio: 'pipe' });
          const evaluation = await this.evaluateImage(tempThumb);
          if (fs.existsSync(tempThumb)) try { fs.unlinkSync(tempThumb); } catch {}
          if (evaluation.isTitleOrBumper) {
            bumperRanges.push({
              startTime: creditStart,
              endTime: totalDuration,
              type: 'outro_credits',
            });
          }
        } catch {
          if (fs.existsSync(tempThumb)) try { fs.unlinkSync(tempThumb); } catch {}
        }
      }
    }

    return bumperRanges;
  }

  /**
   * Checks whether a given [startTime, endTime] timecode interval overlaps with any non-narrative bumper range.
   */
  public isRangeInsideBumper(
    startTime: number,
    endTime: number,
    bumperRanges: Array<{ startTime: number; endTime: number }>
  ): boolean {
    if (!bumperRanges || bumperRanges.length === 0) return false;
    for (const b of bumperRanges) {
      const overlapStart = Math.max(startTime, b.startTime);
      const overlapEnd = Math.min(endTime, b.endTime);
      const overlap = Math.max(0, overlapEnd - overlapStart);
      const duration = Math.max(0.1, endTime - startTime);
      if (overlap / duration > 0.3 || (startTime >= b.startTime && endTime <= b.endTime)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Universal sanitizer: filters out any raw candidate or highlight moment that samples from bumper ranges.
   */
  public filterCandidatesFromBumpers<T extends { startTime: number; endTime: number }>(
    candidates: T[],
    bumperRanges: Array<{ startTime: number; endTime: number }>
  ): T[] {
    if (!bumperRanges || bumperRanges.length === 0) return candidates;
    return candidates.filter((c) => !this.isRangeInsideBumper(c.startTime, c.endTime, bumperRanges));
  }
}

export const titleBumperDetector = new TitleBumperDetector();
