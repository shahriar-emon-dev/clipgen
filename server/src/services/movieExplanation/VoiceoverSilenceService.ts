// ============================================================
// Voiceover Silence Service — Intelligent Leading Silence & Pause Management
// Detects leading silence separately from meaningful narrative pauses.
// When enabled, trims leading silence cleanly and updates dependent timestamps.
// Preserves untouched master voiceover track by default.
// ============================================================

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { config } from '../../config/index.js';
import type { ExplanationScript, SilenceHandlingSettings } from '../../../../shared/types.js';

export interface SilenceDetectionResult {
  hasLeadingSilence: boolean;
  leadingSilenceDuration: number; // in seconds
  firstSpokenTimestamp: number;   // in seconds
  totalSilenceSegments: Array<{ start: number; end: number; duration: number }>;
}

export class VoiceoverSilenceService {
  /**
   * Detects leading silence in a voiceover audio file using FFmpeg silencedetect.
   * Finds the exact timestamp of the first spoken syllable.
   */
  public async detectSilence(
    audioPath: string,
    thresholdDb: number = -40,
    minDuration: number = 0.3
  ): Promise<SilenceDetectionResult> {
    return new Promise((resolve) => {
      if (!fs.existsSync(audioPath)) {
        return resolve({
          hasLeadingSilence: false,
          leadingSilenceDuration: 0,
          firstSpokenTimestamp: 0,
          totalSilenceSegments: [],
        });
      }

      const args = [
        '-i', audioPath,
        '-af', `silencedetect=noise=${thresholdDb}dB:d=${minDuration}`,
        '-f', 'null', '-',
      ];

      const proc = spawn(config.ffmpegPath, args);
      let stderr = '';

      proc.stderr.on('data', (d) => { stderr += d.toString(); });
      proc.on('close', () => {
        // Parse silencedetect lines from stderr:
        // [silencedetect @ ...] silence_start: 0
        // [silencedetect @ ...] silence_end: 2.451 | silence_duration: 2.451
        const silenceStarts: number[] = [];
        const silenceEnds: number[] = [];
        const silenceSegments: Array<{ start: number; end: number; duration: number }> = [];

        const startMatches = stderr.matchAll(/silence_start:\s*([\d\.]+)/g);
        for (const m of startMatches) {
          silenceStarts.push(parseFloat(m[1]));
        }

        const endMatches = stderr.matchAll(/silence_end:\s*([\d\.]+)\s*\|\s*silence_duration:\s*([\d\.]+)/g);
        for (const m of endMatches) {
          const end = parseFloat(m[1]);
          const dur = parseFloat(m[2]);
          silenceEnds.push(end);
          const start = Math.max(0, end - dur);
          silenceSegments.push({ start, end, duration: dur });
        }

        // Check if silence starts at or near 0.0s (within first 0.15s)
        let leadingSilenceDuration = 0;
        let firstSpokenTimestamp = 0;

        if (silenceSegments.length > 0 && silenceSegments[0].start <= 0.15) {
          leadingSilenceDuration = Number(silenceSegments[0].end.toFixed(3));
          firstSpokenTimestamp = leadingSilenceDuration;
        }

        const hasLeadingSilence = leadingSilenceDuration >= minDuration;

        resolve({
          hasLeadingSilence,
          leadingSilenceDuration,
          firstSpokenTimestamp,
          totalSilenceSegments: silenceSegments,
        });
      });

      proc.on('error', () => {
        resolve({
          hasLeadingSilence: false,
          leadingSilenceDuration: 0,
          firstSpokenTimestamp: 0,
          totalSilenceSegments: [],
        });
      });
    });
  }

  /**
   * Trims leading silence from the voiceover file, preserving an untouched copy.
   * Returns path to the trimmed audio file and the exact offset removed.
   */
  public async trimLeadingSilence(
    sourceAudioPath: string,
    outputAudioPath: string,
    leadingSilenceDuration: number
  ): Promise<{ outputPath: string; offsetApplied: number }> {
    if (leadingSilenceDuration <= 0.05) {
      return { outputPath: sourceAudioPath, offsetApplied: 0 };
    }

    return new Promise((resolve, reject) => {
      // Seek past leading silence with high precision audio filter
      const args = [
        '-y',
        '-ss', leadingSilenceDuration.toFixed(3),
        '-i', sourceAudioPath,
        '-c:a', 'copy', // Stream copy for zero loss
        outputAudioPath,
      ];

      const proc = spawn(config.ffmpegPath, args);
      let stderr = '';

      proc.stderr.on('data', (d) => { stderr += d.toString(); });
      proc.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputAudioPath)) {
          resolve({ outputPath: outputAudioPath, offsetApplied: leadingSilenceDuration });
        } else {
          // Fallback with re-encode if stream copy fails
          const fallbackArgs = [
            '-y',
            '-i', sourceAudioPath,
            '-af', `atrim=start=${leadingSilenceDuration.toFixed(3)},asetpts=PTS-STARTPTS`,
            '-c:a', 'aac',
            '-b:a', '320k',
            outputAudioPath,
          ];
          const fbProc = spawn(config.ffmpegPath, fallbackArgs);
          fbProc.on('close', (fbCode) => {
            if (fbCode === 0 && fs.existsSync(outputAudioPath)) {
              resolve({ outputPath: outputAudioPath, offsetApplied: leadingSilenceDuration });
            } else {
              reject(new Error(`Failed trimming leading silence: ${stderr}`));
            }
          });
          fbProc.on('error', reject);
        }
      });
      proc.on('error', reject);
    });
  }

  /**
   * Adjusts all segment timestamps by offset when leading silence is removed.
   * Guarantees that segment 0 starts at 0.000s without losing duration or order.
   */
  public adjustScriptTimestamps(
    script: ExplanationScript,
    offsetSeconds: number
  ): ExplanationScript {
    if (offsetSeconds <= 0.001) return script;

    const adjustedSegments = script.segments.map((seg, idx) => {
      const newStart = Math.max(0, Number((seg.voiceoverStart - offsetSeconds).toFixed(3)));
      const newEnd = Math.max(newStart + 0.1, Number((seg.voiceoverEnd - offsetSeconds).toFixed(3)));
      const newDur = Number((newEnd - newStart).toFixed(3));

      let adjustedWordTimestamps = seg.wordTimestamps;
      if (seg.wordTimestamps && seg.wordTimestamps.length > 0) {
        adjustedWordTimestamps = seg.wordTimestamps.map((wt) => ({
          ...wt,
          start: Math.max(0, Number((wt.start - offsetSeconds).toFixed(3))),
          end: Math.max(0, Number((wt.end - offsetSeconds).toFixed(3))),
        }));
      }

      return {
        ...seg,
        voiceoverStart: idx === 0 ? 0.000 : newStart,
        voiceoverEnd: newEnd,
        duration: newDur,
        wordTimestamps: adjustedWordTimestamps,
      };
    });

    return {
      ...script,
      segments: adjustedSegments,
    };
  }
}

export const voiceoverSilenceService = new VoiceoverSilenceService();
