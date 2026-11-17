// ============================================================
// TranscriptAlignmentEngine
// Isolated module to import, parse, and synchronize original
// movie subtitles/transcripts (SRT, VTT, TXT, JSON) with movie
// timestamps and anchor localized voiceover beats.
// ============================================================

import type {
  TranscriptSegment,
  EpisodeScene,
  ExplanationScriptSegment,
} from '../../../../shared/types.js';
import {
  OriginalTranscriptAlignmentService,
  AlignmentIndexEntry,
  TranscriptAlignmentAnchor,
} from './OriginalTranscriptAlignmentService.js';

export interface ParsedSubtitleItem {
  id: string;
  startTime: number;
  endTime: number;
  speaker?: string;
  text: string;
}

export class TranscriptAlignmentEngine {
  private service: OriginalTranscriptAlignmentService;

  constructor() {
    this.service = new OriginalTranscriptAlignmentService();
  }

  /**
   * Parse SRT subtitle format into timestamped segments
   */
  public parseSrt(raw: string): TranscriptSegment[] {
    if (!raw || typeof raw !== 'string') return [];
    const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const blocks = normalized.split(/\n\s*\n/).filter((b) => b.trim().length > 0);
    const segments: TranscriptSegment[] = [];

    for (let i = 0; i < blocks.length; i++) {
      const lines = blocks[i].split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
      if (lines.length < 2) continue;

      // Find timing line (e.g. 00:01:23,456 --> 00:01:26,789)
      const timeLineIdx = lines.findIndex((l) => l.includes('-->'));
      if (timeLineIdx === -1) continue;

      const timeParts = lines[timeLineIdx].split('-->').map((p) => p.trim());
      const startTime = this.parseTimestampToSeconds(timeParts[0]);
      const endTime = this.parseTimestampToSeconds(timeParts[1]);
      const textLines = lines.slice(timeLineIdx + 1).join(' ').replace(/<[^>]+>/g, '').trim();

      if (textLines.length > 0 && !isNaN(startTime) && !isNaN(endTime)) {
        segments.push({
          id: `srt_${i + 1}`,
          transcriptId: 'subtitles',
          startTime,
          endTime,
          text: textLines,
          confidence: 0.95,
        });
      }
    }
    return segments;
  }

  /**
   * Parse WebVTT format into timestamped segments
   */
  public parseVtt(raw: string): TranscriptSegment[] {
    if (!raw || typeof raw !== 'string') return [];
    const cleaned = raw.replace(/^WEBVTT[^\n]*\n+/i, '');
    return this.parseSrt(cleaned);
  }

  /**
   * Parse TurboScribe or plain text transcripts with timestamps if present,
   * or distribute evenly across duration if plain dialogue paragraphs.
   */
  public parseTranscriptText(raw: string, mediaDuration: number): TranscriptSegment[] {
    if (!raw || typeof raw !== 'string') return [];

    // Check if it contains SRT timestamps
    if (raw.includes('-->')) {
      return this.parseSrt(raw);
    }

    // Check for inline timecodes: [00:01:23] or (01:23)
    const segments: TranscriptSegment[] = [];
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);

    let matchCount = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = /^\[?(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?)\]?\s*(.+)$/.exec(line);
      if (match) {
        matchCount++;
        const startTime = this.parseTimestampToSeconds(match[1]);
        const text = match[2].trim();
        segments.push({
          id: `seg_${segments.length + 1}`,
          transcriptId: 'subtitles',
          startTime,
          endTime: startTime + 3.0, // Temporary until next segment
          text,
          confidence: 0.9,
        });
      }
    }

    if (matchCount >= 3) {
      // Fix end times
      for (let i = 0; i < segments.length; i++) {
        if (i < segments.length - 1) {
          segments[i].endTime = segments[i + 1].startTime;
        } else {
          segments[i].endTime = Math.max(segments[i].startTime + 3.0, mediaDuration);
        }
      }
      return segments;
    }

    // Plain text dialogue: split by paragraphs and spread across duration
    const paragraphs = raw
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0 && !p.includes('TurboScribe') && !p.includes('transcribe files up to'));

    if (paragraphs.length === 0) return [];
    const step = mediaDuration / Math.max(1, paragraphs.length);
    return paragraphs.map((p, idx) => ({
      id: `diag_${idx + 1}`,
      transcriptId: 'subtitles',
      startTime: Number((idx * step).toFixed(2)),
      endTime: Number(((idx + 1) * step).toFixed(2)),
      text: p.replace(/\s+/g, ' '),
      confidence: 0.8,
    }));
  }

  /**
   * Helper to parse time string (HH:MM:SS,mmm or MM:SS) to floating seconds
   */
  public parseTimestampToSeconds(ts: string): number {
    if (!ts) return 0;
    const cleaned = ts.trim().replace(',', '.');
    const parts = cleaned.split(':').map((p) => parseFloat(p));
    if (parts.length === 3) {
      return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
    }
    if (parts.length === 2) {
      return (parts[0] || 0) * 60 + (parts[1] || 0);
    }
    const val = parseFloat(cleaned);
    return isNaN(val) ? 0 : val;
  }

  /**
   * Build index linking original transcript segments to movie scenes
   */
  public buildTranscriptSceneIndex(
    transcriptSegments: TranscriptSegment[],
    scenes: EpisodeScene[]
  ): AlignmentIndexEntry[] {
    return this.service.buildTranscriptSceneIndex(transcriptSegments, scenes);
  }

  /**
   * Find strongest movie scene anchor for a narration segment
   */
  public findAnchorForNarrationBeat(
    narrationSegment: ExplanationScriptSegment,
    transcriptIndex: AlignmentIndexEntry[],
    totalVoDuration: number,
    movieDuration?: number
  ): TranscriptAlignmentAnchor | null {
    return this.service.findAnchorForSegment(
      narrationSegment,
      transcriptIndex,
      totalVoDuration,
      movieDuration || 2700
    );
  }
}

export const transcriptAlignmentEngine = new TranscriptAlignmentEngine();
