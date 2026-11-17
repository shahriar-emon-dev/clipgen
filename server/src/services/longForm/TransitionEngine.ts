import { spawnSync } from 'child_process';
import { config } from '../../config/index.js';
import type { TransitionType, TimelineSegment, LongFormSettings } from '../../../../shared/types.js';

export interface TransitionFilterGraph {
  filterComplex: string;
  outputVideoLabel: string;
  outputAudioLabel: string;
  totalDuration: number;
}

export class TransitionEngine {
  private hasXfade: boolean | null = null;

  /**
   * Detects whether the active FFmpeg binary has the xfade filter compiled in.
   */
  public isXfadeSupported(): boolean {
    if (this.hasXfade !== null) return this.hasXfade;
    try {
      const res = spawnSync(config.ffmpegPath, ['-filters'], { encoding: 'utf-8' });
      this.hasXfade = (res.stdout || '').includes('xfade');
    } catch {
      this.hasXfade = false;
    }
    return this.hasXfade;
  }

  /**
   * Generates the complete FFmpeg filter_complex script for stitching N pre-cut segment inputs
   * with transitions, optional intro title fade, and outro fade to black.
   */
  public buildFilterGraph(
    segments: TimelineSegment[],
    settings: LongFormSettings,
    options: { fallbackIfUnsupported?: boolean } = {}
  ): TransitionFilterGraph {
    if (segments.length === 0) {
      throw new Error('Cannot build transition filtergraph for empty timeline');
    }

    const n = segments.length;
    const transType = settings.transitionType || 'crossfade';
    const transDuration = transType === 'cut' ? 0 : Math.min(1.2, Math.max(0.3, settings.transitionDuration || 0.6));

    // If only 1 segment, pure cut, or FFmpeg runtime doesn't have xfade filter:
    if (n === 1 || transType === 'cut' || (options.fallbackIfUnsupported && !this.isXfadeSupported())) {
      return this.buildConcatGraph(segments, settings);
    }

    // Chained xfade + acrossfade filtergraph
    const filterParts: string[] = [];
    let currentV = '0:v';
    let currentA = '0:a';
    let cumulativeDuration = segments[0].duration;

    const xfadeMap: Record<TransitionType, string> = {
      cut: 'fade',
      crossfade: 'fade',
      dissolve: 'dissolve',
      fade_black: 'fadeblack',
      fade_white: 'fadewhite',
      wipe: 'wipeleft',
    };
    const xfadeName = xfadeMap[transType] || 'fade';

    for (let i = 1; i < n; i++) {
      const nextV = `${i}:v`;
      const nextA = `${i}:a`;
      const nextDuration = segments[i].duration;

      // Transition offset is the end of the previous compound stream minus transition duration
      const offset = Math.max(0.1, cumulativeDuration - transDuration);
      const outV = `v${i}`;
      const outA = `a${i}`;

      filterParts.push(
        `[${currentV}][${nextV}]xfade=transition=${xfadeName}:duration=${transDuration}:offset=${offset.toFixed(3)}[${outV}]`
      );
      filterParts.push(
        `[${currentA}][${nextA}]acrossfade=d=${transDuration}:c1=tri:c2=tri[${outA}]`
      );

      currentV = outV;
      currentA = outA;
      cumulativeDuration = offset + nextDuration;
    }

    // Optional Intro Fade-in
    let finalV = currentV;
    if (settings.includeIntro) {
      filterParts.push(`[${finalV}]fade=t=in:st=0:d=0.8[v_intro]`);
      finalV = 'v_intro';
    }

    // Optional Outro Fade-out
    if (settings.includeOutro && cumulativeDuration > 2.0) {
      const fadeStart = Math.max(0, cumulativeDuration - 1.2);
      filterParts.push(`[${finalV}]fade=t=out:st=${fadeStart.toFixed(3)}:d=1.2[v_outro]`);
      finalV = 'v_outro';
    }

    return {
      filterComplex: filterParts.join(';'),
      outputVideoLabel: finalV,
      outputAudioLabel: currentA,
      totalDuration: Number(cumulativeDuration.toFixed(2)),
    };
  }

  /**
   * Fast concat filtergraph for direct cuts with audio click-suppression.
   */
  private buildConcatGraph(
    segments: TimelineSegment[],
    settings: LongFormSettings
  ): TransitionFilterGraph {
    const n = segments.length;
    const filterParts: string[] = [];

    let totalDuration = 0;
    const inputLabels: string[] = [];

    for (let i = 0; i < n; i++) {
      totalDuration += segments[i].duration;
      inputLabels.push(`[${i}:v][${i}:a]`);
    }

    filterParts.push(`${inputLabels.join('')}concat=n=${n}:v=1:a=1[v_cat][a_cat]`);
    let finalV = 'v_cat';

    if (settings.includeIntro) {
      filterParts.push(`[${finalV}]fade=t=in:st=0:d=0.8[v_intro]`);
      finalV = 'v_intro';
    }

    if (settings.includeOutro && totalDuration > 2.0) {
      const fadeStart = Math.max(0, totalDuration - 1.2);
      filterParts.push(`[${finalV}]fade=t=out:st=${fadeStart.toFixed(3)}:d=1.2[v_outro]`);
      finalV = 'v_outro';
    }

    return {
      filterComplex: filterParts.join(';'),
      outputVideoLabel: finalV,
      outputAudioLabel: 'a_cat',
      totalDuration: Number(totalDuration.toFixed(2)),
    };
  }
}
