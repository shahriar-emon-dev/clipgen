// ============================================================
// Captions Service — Centralized SRT & Subtitle Generator
// Synchronized to voiceover master timeline with proper formatting
// ============================================================

import fs from 'fs';
import path from 'path';

export function formatSRTTime(seconds: number): string {
  const safeSeconds = Math.max(0, isNaN(seconds) ? 0 : seconds);
  const h = Math.floor(safeSeconds / 3600);
  const m = Math.floor((safeSeconds % 3600) / 60);
  const s = Math.floor(safeSeconds % 60);
  const ms = Math.min(999, Math.round((safeSeconds % 1) * 1000));
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

export interface CaptionEntry {
  start: number;
  end: number;
  text: string;
}

export function generateSRTContent(
  entries: CaptionEntry[],
  options: { maxWordsPerLine?: number } = {}
): string {
  const maxWords = options.maxWordsPerLine || 5;
  const srtLines: string[] = [];
  let entryIdx = 1;

  for (const entry of entries) {
    const text = (entry.text || '').trim();
    if (!text || entry.end <= entry.start) continue;

    const words = text.split(/\s+/).filter(Boolean);
    if (words.length <= maxWords) {
      srtLines.push(`${entryIdx++}`);
      srtLines.push(`${formatSRTTime(entry.start)} --> ${formatSRTTime(entry.end)}`);
      srtLines.push(words.join(' '));
      srtLines.push('');
    } else {
      // Chunk words into natural segments
      const chunkCount = Math.ceil(words.length / maxWords);
      const segDuration = (entry.end - entry.start) / chunkCount;

      for (let c = 0; c < chunkCount; c++) {
        const subWords = words.slice(c * maxWords, (c + 1) * maxWords);
        const subStart = entry.start + c * segDuration;
        const subEnd = c === chunkCount - 1 ? entry.end : entry.start + (c + 1) * segDuration;

        srtLines.push(`${entryIdx++}`);
        srtLines.push(`${formatSRTTime(subStart)} --> ${formatSRTTime(subEnd)}`);
        srtLines.push(subWords.join(' '));
        srtLines.push('');
      }
    }
  }

  return srtLines.join('\n');
}

export function writeSRTFile(filePath: string, content: string): string {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}
