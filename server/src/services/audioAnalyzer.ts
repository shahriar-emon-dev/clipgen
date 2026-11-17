// ============================================================
// Audio Analyzer — Volume, Energy, Silence Detection
// ============================================================

import { spawn } from 'child_process';
import { config } from '../config/index.js';
import type { AudioAnalysisResult, AudioLevel, AudioPeak, TimeRange } from '../../../shared/types.js';

export async function analyzeAudio(
  audioPath: string,
  onProgress?: (percent: number, detail: string) => void
): Promise<AudioAnalysisResult> {
  if (onProgress) onProgress(20, 'Measuring volume dynamics & silence concurrently...');

  const [volumeLevels, silenceRegions] = await Promise.all([
    detectVolumeLevels(audioPath),
    detectSilence(audioPath),
  ]);

  if (onProgress) onProgress(80, `Measured ${volumeLevels.length} volume checkpoints & ${silenceRegions.length} silence intervals...`);

  const averageVolume = volumeLevels.length > 0
    ? volumeLevels.reduce((sum, l) => sum + l.volume, 0) / volumeLevels.length
    : -30;

  const energyPeaks = findEnergyPeaks(volumeLevels, averageVolume, silenceRegions);

  if (onProgress) {
    onProgress(100, `Audio analysis complete: ${energyPeaks.length} audio energy peaks identified`);
  }

  return {
    volumeLevels,
    silenceRegions,
    energyPeaks,
    averageVolume,
  };
}

// ── Volume Level Detection ──

async function detectVolumeLevels(audioPath: string): Promise<AudioLevel[]> {
  return new Promise((resolve) => {
    // Use astats filter to get per-second RMS levels
    const args = [
      '-threads', '0',
      '-i', audioPath,
      '-af', 'astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level',
      '-f', 'null',
      '-',
    ];

    const proc = spawn(config.ffmpegPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });

    proc.on('close', () => {
      const levels: AudioLevel[] = [];
      const lines = stderr.split('\n');
      let currentTime = 0;

      for (const line of lines) {
        // Parse pts_time from frame metadata
        const timeMatch = line.match(/pts_time:(\d+\.?\d*)/);
        if (timeMatch) {
          currentTime = parseFloat(timeMatch[1]);
        }

        // Parse RMS level
        const rmsMatch = line.match(/lavfi\.astats\.Overall\.RMS_level=(-?\d+\.?\d*)/);
        if (rmsMatch) {
          const volume = parseFloat(rmsMatch[1]);
          if (!isNaN(volume) && isFinite(volume)) {
            levels.push({ time: currentTime, volume });
          }
        }
      }

      // If detailed analysis failed, create basic levels from silence detection
      if (levels.length === 0) {
        // Fallback: generate approximate levels every second
        resolve([]);
        return;
      }

      resolve(levels);
    });

    proc.on('error', () => resolve([]));
  });
}

// ── Silence Detection ──

async function detectSilence(audioPath: string): Promise<TimeRange[]> {
  return new Promise((resolve) => {
    const args = [
      '-threads', '0',
      '-i', audioPath,
      '-af', 'silencedetect=noise=-35dB:d=0.5',
      '-f', 'null',
      '-',
    ];

    const proc = spawn(config.ffmpegPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });

    proc.on('close', () => {
      const regions: TimeRange[] = [];
      const lines = stderr.split('\n');
      let silenceStart: number | null = null;

      for (const line of lines) {
        const startMatch = line.match(/silence_start:\s*(-?\d+\.?\d*)/);
        if (startMatch) {
          silenceStart = parseFloat(startMatch[1]);
        }

        const endMatch = line.match(/silence_end:\s*(-?\d+\.?\d*)/);
        if (endMatch && silenceStart !== null) {
          regions.push({
            start: Math.max(0, silenceStart),
            end: parseFloat(endMatch[1]),
          });
          silenceStart = null;
        }
      }

      resolve(regions);
    });

    proc.on('error', () => resolve([]));
  });
}

// ── Energy Peak Detection ──

function findEnergyPeaks(
  levels: AudioLevel[],
  avgVolume: number,
  silenceRegions: TimeRange[]
): AudioPeak[] {
  const peaks: AudioPeak[] = [];
  const spikeThreshold = avgVolume + 6; // 6dB above average

  for (let i = 1; i < levels.length; i++) {
    const prev = levels[i - 1];
    const curr = levels[i];

    // Volume spike (sudden increase)
    if (curr.volume > spikeThreshold && curr.volume - prev.volume > 3) {
      peaks.push({
        time: curr.time,
        energy: curr.volume,
        type: 'spike',
      });
    }

    // Silence break (transition from silence to speech)
    const inSilence = silenceRegions.some(r => prev.time >= r.start && prev.time <= r.end);
    const outOfSilence = !silenceRegions.some(r => curr.time >= r.start && curr.time <= r.end);

    if (inSilence && outOfSilence && curr.volume > avgVolume - 10) {
      peaks.push({
        time: curr.time,
        energy: curr.volume,
        type: 'silence_break',
      });
    }
  }

  // Also detect sustained high-energy regions
  const windowSize = 5; // 5-second windows
  for (let i = 0; i < levels.length - windowSize; i++) {
    const window = levels.slice(i, i + windowSize);
    const windowAvg = window.reduce((s, l) => s + l.volume, 0) / window.length;

    if (windowAvg > avgVolume + 3) {
      // Check not already covered by a nearby peak
      const nearbyPeak = peaks.find(p => Math.abs(p.time - window[0].time) < windowSize);
      if (!nearbyPeak) {
        peaks.push({
          time: window[Math.floor(windowSize / 2)].time,
          energy: windowAvg,
          type: 'sustained',
        });
      }
    }
  }

  return peaks.sort((a, b) => a.time - b.time);
}

// ── Dynamic Real Waveform Peak Extraction ──

const waveformCache = new Map<string, { duration: number; peaks: number[]; pointsPerSecond: number }>();

/**
 * Extracts real audio waveform peaks from an audio or video file.
 * Fast raw PCM streaming (8000Hz mono 16-bit) downsampled into exact peak buckets.
 */
export async function extractWaveformPeaks(
  filePath: string,
  targetPoints: number = 800
): Promise<{ duration: number; peaks: number[]; pointsPerSecond: number }> {
  if (waveformCache.has(filePath)) {
    return waveformCache.get(filePath)!;
  }

  return new Promise((resolve) => {
    const args = [
      '-i', filePath,
      '-vn',
      '-ac', '1',
      '-ar', '8000',
      '-f', 's16le',
      '-',
    ];

    const proc = spawn(config.ffmpegPath, args, { stdio: ['pipe', 'pipe', 'ignore'] });
    const chunks: Buffer[] = [];

    proc.stdout?.on('data', (d: Buffer) => {
      chunks.push(d);
    });

    proc.on('close', (code) => {
      try {
        const fullBuffer = Buffer.concat(chunks);
        const sampleCount = Math.floor(fullBuffer.length / 2); // 16-bit = 2 bytes per sample

        if (sampleCount === 0) {
          // Fallback if audio track is silent or couldn't decode
          const fallbackPeaks = new Array(targetPoints).fill(0.1);
          const result = { duration: 0, peaks: fallbackPeaks, pointsPerSecond: 1 };
          resolve(result);
          return;
        }

        const duration = sampleCount / 8000;
        const bucketSize = Math.max(1, Math.floor(sampleCount / targetPoints));
        const actualPoints = Math.min(targetPoints, Math.ceil(sampleCount / bucketSize));
        const rawPeaks: number[] = new Array(actualPoints).fill(0);

        // Read 16-bit signed integers and find max absolute amplitude per bucket
        for (let i = 0; i < actualPoints; i++) {
          const startSample = i * bucketSize;
          const endSample = Math.min(startSample + bucketSize, sampleCount);
          let maxVal = 0;

          for (let s = startSample; s < endSample; s += 2) { // Step by 2 for speed
            const val = Math.abs(fullBuffer.readInt16LE(s * 2));
            if (val > maxVal) maxVal = val;
          }

          rawPeaks[i] = maxVal;
        }

        // Normalize peaks 0.02 - 1.0
        const maxGlobal = Math.max(...rawPeaks, 1);
        const normalized = rawPeaks.map(p => {
          const norm = p / maxGlobal;
          return Math.max(0.04, Math.round(norm * 1000) / 1000);
        });

        const pointsPerSecond = duration > 0 ? normalized.length / duration : 1;
        const result = {
          duration,
          peaks: normalized,
          pointsPerSecond,
        };

        waveformCache.set(filePath, result);
        resolve(result);
      } catch (err) {
        console.error('Error processing audio waveform:', err);
        const fallbackPeaks = new Array(targetPoints).fill(0.1);
        resolve({ duration: 0, peaks: fallbackPeaks, pointsPerSecond: 1 });
      }
    });

    proc.on('error', (err) => {
      console.warn('FFmpeg waveform spawn error:', err);
      const fallbackPeaks = new Array(targetPoints).fill(0.1);
      resolve({ duration: 0, peaks: fallbackPeaks, pointsPerSecond: 1 });
    });
  });
}

