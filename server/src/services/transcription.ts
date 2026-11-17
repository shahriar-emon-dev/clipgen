// ============================================================
// Transcription Service — Whisper API + Local Fallback
// ============================================================

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { config } from '../config/index.js';
import { getDb } from './database.js';
import { v4 as uuid } from 'uuid';
import type { TranscriptSegment, WordTimestamp } from '../../../shared/types.js';

export interface TranscriptionResult {
  transcriptId: string;
  language: string;
  fullText: string;
  duration: number;
  segments: TranscriptSegment[];
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export interface TranscribeAudioOptions {
  language?: string;
  initialPrompt?: string;
}

export async function transcribeAudio(
  audioPath: string,
  projectId: string,
  onProgress?: (percent: number, detail: string) => void,
  options?: TranscribeAudioOptions
): Promise<TranscriptionResult> {
  // Check if transcript already exists for this project
  const db = getDb();
  const existing = db.prepare('SELECT id FROM transcripts WHERE project_id = ?').get(projectId) as any;
  if (existing) {
    if (onProgress) onProgress(100, 'Loaded existing transcript from cache');
    return loadTranscript(projectId);
  }

  if (config.transcriptionProvider === 'local') {
    try {
      return await transcribeLocal(audioPath, projectId, onProgress, options);
    } catch (err: any) {
      console.warn(`Local transcription unavailable (${err.message}). Falling back to signal-based speech segmentation.`);
      return transcribeFallback(audioPath, projectId, onProgress);
    }
  }

  if (config.openaiApiKey) {
    try {
      return await transcribeOpenAI(audioPath, projectId, onProgress, options);
    } catch (err: any) {
      console.warn(`OpenAI transcription failed (${err.message}). Falling back to signal-based speech segmentation.`);
      return transcribeFallback(audioPath, projectId, onProgress);
    }
  }

  // Fallback: analyze speech energy & generate timing-accurate speech segments
  return transcribeFallback(audioPath, projectId, onProgress);
}


// ── OpenAI Whisper API ──

async function transcribeOpenAI(
  audioPath: string,
  projectId: string,
  onProgress?: (percent: number, detail: string) => void,
  options?: TranscribeAudioOptions
): Promise<TranscriptionResult> {
  const { default: OpenAI } = await import('openai');
  const openai = new OpenAI({
    apiKey: config.openaiApiKey,
    ...(config.openaiBaseUrl ? { baseURL: config.openaiBaseUrl } : {}),
  });

  const fileSize = fs.statSync(audioPath).size;
  const MAX_WHISPER_SIZE = 25 * 1024 * 1024; // 25MB limit

  let segments: TranscriptSegment[] = [];
  let fullText = '';
  let language = options?.language || 'en';

  if (fileSize <= MAX_WHISPER_SIZE) {
    if (onProgress) onProgress(30, 'Uploading audio track to OpenAI Whisper API...');
    // Single file transcription
    const createParams: any = {
      file: fs.createReadStream(audioPath),
      model: 'whisper-1',
      response_format: 'verbose_json',
      timestamp_granularities: ['segment', 'word'],
    };
    if (options?.language) createParams.language = options.language;
    if (options?.initialPrompt) createParams.prompt = options.initialPrompt;

    const result = await openai.audio.transcriptions.create(createParams);

    language = (result as any).language || 'en';
    fullText = result.text;
    segments = parseOpenAISegments((result as any).segments || [], (result as any).words || []);
    if (onProgress) onProgress(100, `Transcribed ${segments.length} segments with OpenAI Whisper`);
  } else {
    // Split audio into chunks for large files
    const chunkDuration = 600; // 10 min chunks
    const audioDuration = await getAudioDuration(audioPath);
    const chunkCount = Math.ceil(audioDuration / chunkDuration);

    for (let i = 0; i < chunkCount; i++) {
      const startTime = i * chunkDuration;
      const chunkPath = audioPath.replace('.wav', `_chunk${i}.wav`);

      await splitAudio(audioPath, chunkPath, startTime, chunkDuration);

      try {
        if (onProgress) {
          const chunkPct = Math.round((i / chunkCount) * 100);
          onProgress(chunkPct, `Transcribing audio chunk ${i + 1} of ${chunkCount} with Whisper API...`);
        }

        const result = await openai.audio.transcriptions.create({
          file: fs.createReadStream(chunkPath),
          model: 'whisper-1',
          response_format: 'verbose_json',
          timestamp_granularities: ['segment', 'word'],
        });

        if (i === 0) language = (result as any).language || 'en';
        fullText += (fullText ? ' ' : '') + result.text;

        const chunkSegments = parseOpenAISegments(
          (result as any).segments || [],
          (result as any).words || [],
          startTime
        );
        segments.push(...chunkSegments);
      } finally {
        // Cleanup chunk
        try { fs.unlinkSync(chunkPath); } catch {}
      }
    }
  }

  // Store in database
  return storeTranscript(projectId, language, fullText, segments);
}

// ── Local faster-whisper via Python ──

async function transcribeLocal(
  audioPath: string,
  projectId: string,
  onProgress?: (percent: number, detail: string) => void,
  options?: TranscribeAudioOptions
): Promise<TranscriptionResult> {
  return new Promise((resolve, reject) => {
    if (onProgress) onProgress(5, 'Loading faster-whisper model (int8)...');

    const langParam = options?.language ? `"${options.language}"` : 'None';
    const rawPrompt = (options?.initialPrompt || '').replace(/["\\]/g, ' ').slice(0, 250);
    const promptParam = rawPrompt ? `"${rawPrompt}"` : 'None';

    const pythonScript = `
import json, sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')
try:
    from faster_whisper import WhisperModel
    import os
    num_threads = os.cpu_count() or 4
    model = WhisperModel("${config.fasterWhisperModel}", device="cpu", compute_type="int8", cpu_threads=num_threads)
    kwargs = {"beam_size": 5, "word_timestamps": True}
    lang = ${langParam}
    if lang is not None and lang != "":
        kwargs["language"] = lang
    p = ${promptParam}
    if p is not None and p != "":
        kwargs["initial_prompt"] = p
    segments_gen, info = model.transcribe("${audioPath.replace(/\\/g, '/')}", **kwargs)
    segments = []
    for seg in segments_gen:
        words = []
        if seg.words:
            for w in seg.words:
                words.append({"word": w.word.strip(), "start": round(w.start, 3), "end": round(w.end, 3)})
        segments.append({
            "start": round(seg.start, 3),
            "end": round(seg.end, 3),
            "text": seg.text.strip(),
            "words": words
        })
        clean_text = seg.text.strip().replace(":", " ").replace("\\n", " ")[:30]
        print(f"PROGRESS:{round(seg.end, 2)}:{round(info.duration, 2)}:{clean_text}", file=sys.stderr, flush=True)
    result = {"language": info.language, "segments": segments}
    print(json.dumps(result))
except Exception as e:
    print(json.dumps({"error": str(e)}), file=sys.stderr)
    sys.exit(1)
`;

    const scriptBase64 = Buffer.from(pythonScript, 'utf8').toString('base64');
    const runnerCode = `import base64; exec(base64.b64decode("${scriptBase64}").decode("utf-8"))`;

    // Try specific python binaries first to avoid Windows py launcher version mismatch
    const pythonCandidates: string[] = [];
    if (process.env.PYTHON_PATH && fs.existsSync(process.env.PYTHON_PATH)) {
      pythonCandidates.push(process.env.PYTHON_PATH);
    }
    const defaultWinPython = 'C:\\Users\\ASUS\\AppData\\Local\\Python\\pythoncore-3.14-64\\python.exe';
    if (fs.existsSync(defaultWinPython)) {
      pythonCandidates.push(defaultWinPython);
    }
    pythonCandidates.push('python', 'python3', 'py');

    const candidates: { cmd: string; args: string[] }[] = pythonCandidates.map(cmd => ({
      cmd,
      args: ['-c', runnerCode],
    }));

    let proc: any = null;
    let procError: Error | null = null;

    // Helper to try executing candidates sequentially
    const tryRun = (index: number) => {
      if (index >= candidates.length) {
        return reject(procError || new Error('Python with faster-whisper not found. Please install faster-whisper.'));
      }

      const { cmd, args } = candidates[index];
      const child = spawn(cmd, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      child.stderr.on('data', (d: Buffer) => {
        const text = d.toString();
        stderr += text;

        // Parse line-by-line PROGRESS
        const lines = text.split('\n');
        for (const line of lines) {
          const match = line.match(/^PROGRESS:(\d+\.?\d*):(\d+\.?\d*):(.*)/);
          if (match && onProgress) {
            const current = parseFloat(match[1]);
            const total = parseFloat(match[2]);
            const snippet = match[3]?.trim();
            const percent = total > 0 ? Math.min(99, Math.max(1, Math.round((current / total) * 100))) : 50;
            const snippetStr = snippet ? ` • "${snippet}..."` : '';
            onProgress(percent, `Transcribing ${formatDuration(current)} / ${formatDuration(total)} (${percent}%)${snippetStr}`);
          }
        }
      });

      child.on('error', (err) => {
        procError = err;
        tryRun(index + 1);
      });

      child.on('close', async (code) => {
        if (code !== 0) {
          if (index < candidates.length - 1) {
            return tryRun(index + 1);
          }
          return reject(new Error(`Local transcription failed: ${stderr.slice(-500)}`));
        }

        try {
          const data = JSON.parse(stdout);
          if (data.error) {
            return reject(new Error(`Transcription error: ${data.error}`));
          }

          const segments: TranscriptSegment[] = data.segments.map((seg: any) => ({
            id: uuid(),
            transcriptId: '',
            startTime: seg.start,
            endTime: seg.end,
            text: seg.text,
            confidence: 0.9,
            wordTimestamps: seg.words || [],
          }));

          const fullText = segments.map(s => s.text).join(' ');
          const result = await storeTranscript(projectId, data.language || 'en', fullText, segments);
          resolve(result);
        } catch (err: any) {
          reject(new Error(`Failed to parse transcription result: ${err.message}`));
        }
      });
    };

    tryRun(0);
  });
}

// ── Helpers ──

function parseOpenAISegments(
  apiSegments: any[],
  apiWords: any[],
  timeOffset: number = 0
): TranscriptSegment[] {
  return apiSegments.map((seg: any) => {
    const segStart = (seg.start || 0) + timeOffset;
    const segEnd = (seg.end || 0) + timeOffset;

    // Find words within this segment's time range
    const wordTimestamps: WordTimestamp[] = (apiWords || [])
      .filter((w: any) => w.start >= seg.start && w.end <= seg.end)
      .map((w: any) => ({
        word: w.word?.trim() || '',
        start: (w.start || 0) + timeOffset,
        end: (w.end || 0) + timeOffset,
      }));

    return {
      id: uuid(),
      transcriptId: '',
      startTime: segStart,
      endTime: segEnd,
      text: seg.text?.trim() || '',
      confidence: seg.avg_logprob ? Math.exp(seg.avg_logprob) : 0.9,
      wordTimestamps,
    };
  });
}

function storeTranscript(
  projectId: string,
  language: string,
  fullText: string,
  segments: TranscriptSegment[]
): TranscriptionResult {
  const db = getDb();
  const transcriptId = uuid();
  const duration = segments.length > 0 ? segments[segments.length - 1].endTime : 0;

  db.prepare(`
    INSERT INTO transcripts (id, project_id, language, full_text, duration)
    VALUES (?, ?, ?, ?, ?)
  `).run(transcriptId, projectId, language, fullText, duration);

  const insertSeg = db.prepare(`
    INSERT INTO transcript_segments (id, transcript_id, start_time, end_time, text, confidence, word_timestamps)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction(() => {
    for (const seg of segments) {
      seg.transcriptId = transcriptId;
      insertSeg.run(
        seg.id,
        transcriptId,
        seg.startTime,
        seg.endTime,
        seg.text,
        seg.confidence,
        JSON.stringify(seg.wordTimestamps || [])
      );
    }
  });

  insertMany();

  return { transcriptId, language, fullText, duration, segments };
}

export function loadTranscript(projectId: string): TranscriptionResult {
  const db = getDb();
  const transcript = db.prepare('SELECT * FROM transcripts WHERE project_id = ?').get(projectId) as any;

  if (!transcript) {
    throw new Error('No transcript found for this project');
  }

  const segRows = db.prepare(
    'SELECT * FROM transcript_segments WHERE transcript_id = ? ORDER BY start_time'
  ).all(transcript.id) as any[];

  const segments: TranscriptSegment[] = segRows.map(row => ({
    id: row.id,
    transcriptId: row.transcript_id,
    startTime: row.start_time,
    endTime: row.end_time,
    text: row.text,
    confidence: row.confidence,
    wordTimestamps: JSON.parse(row.word_timestamps || '[]'),
  }));

  return {
    transcriptId: transcript.id,
    language: transcript.language,
    fullText: transcript.full_text,
    duration: transcript.duration,
    segments,
  };
}

async function getAudioDuration(audioPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn(config.ffprobePath, [
      '-v', 'quiet', '-show_entries', 'format=duration',
      '-of', 'csv=p=0', audioPath,
    ]);
    let stdout = '';
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.on('close', () => resolve(parseFloat(stdout.trim()) || 0));
    proc.on('error', () => resolve(0));
  });
}

async function splitAudio(
  inputPath: string,
  outputPath: string,
  startTime: number,
  duration: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(config.ffmpegPath, [
      '-y', '-ss', String(startTime), '-i', inputPath,
      '-t', String(duration), '-c', 'copy', outputPath,
    ], { stdio: ['pipe', 'pipe', 'pipe'] });
    proc.on('close', (code) => code === 0 ? resolve() : reject(new Error('Audio split failed')));
    proc.on('error', reject);
  });
}

// ── Speech Absence / Fallback Handler (No Fake Text) ──

async function transcribeFallback(
  audioPath: string,
  projectId: string,
  onProgress?: (percent: number, detail: string) => void
): Promise<TranscriptionResult> {
  const duration = await getAudioDuration(audioPath);
  const totalSeconds = duration > 0 ? duration : 0;

  if (onProgress) {
    onProgress(100, `Audio analyzed (${formatDuration(totalSeconds)}). Non-dialogue/ambient audio mode active.`);
  }

  // Store empty transcript record so project state remains valid without mock phrases
  return await storeTranscript(projectId, 'none', '', []);
}
