// ============================================================
// Server Configuration — Centralized from Environment
// ============================================================

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import dotenv from 'dotenv';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Robust server root resolution (finds the server/ folder containing package.json)
function getServerRootDir(): string {
  let current = __dirname;
  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(path.join(current, 'package.json')) && (fs.existsSync(path.join(current, 'src')) || fs.existsSync(path.join(current, 'data')))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return path.resolve(__dirname, '../..');
}
const serverRootDir = getServerRootDir();

// Load .env from project root or server dir
const rootEnv = path.resolve(serverRootDir, '../.env');
const localEnv = path.resolve(serverRootDir, '.env');
dotenv.config({ path: fs.existsSync(rootEnv) ? rootEnv : localEnv });

// Detect ffmpeg and ffprobe paths
const localFfmpeg = path.resolve(serverRootDir, 'bin/ffmpeg.exe');
const localFfprobe = path.resolve(serverRootDir, 'bin/ffprobe.exe');

let ffmpegPath = (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH))
  ? process.env.FFMPEG_PATH
  : (fs.existsSync(localFfmpeg) ? localFfmpeg : 'ffmpeg');

let ffprobePath = (process.env.FFPROBE_PATH && fs.existsSync(process.env.FFPROBE_PATH))
  ? process.env.FFPROBE_PATH
  : (fs.existsSync(localFfprobe) ? localFfprobe : 'ffprobe');

try {
  const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
  if (ffmpegInstaller?.path && fs.existsSync(ffmpegInstaller.path)) {
    ffmpegPath = ffmpegInstaller.path;
  }
} catch { /* use system ffmpeg */ }

try {
  const ffprobeInstaller = require('@ffprobe-installer/ffprobe');
  if (ffprobeInstaller?.path && fs.existsSync(ffprobeInstaller.path)) {
    ffprobePath = ffprobeInstaller.path;
  }
} catch { /* use system ffprobe */ }

// Ensure directory containing ffmpeg and ffprobe is prepended to process.env.PATH
if (ffmpegPath && fs.existsSync(ffmpegPath)) {
  const binDir = path.dirname(path.resolve(ffmpegPath));
  const currentPath = process.env.PATH || '';
  if (!currentPath.split(path.delimiter).includes(binDir)) {
    process.env.PATH = `${binDir}${path.delimiter}${currentPath}`;
  }
}

function envInt(key: string, fallback: number): number {
  const val = process.env[key];
  return val ? parseInt(val, 10) : fallback;
}

export const config = {
  // Server
  port: envInt('PORT', 3001),
  host: process.env.HOST || '0.0.0.0',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',

  // Auth
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',

  // Paths
  dataDir: path.resolve(serverRootDir, 'data'),
  uploadsDir: path.resolve(serverRootDir, 'data/uploads'),
  rendersDir: path.resolve(serverRootDir, 'data/renders'),
  thumbsDir: path.resolve(serverRootDir, 'data/thumbnails'),
  audioDir: path.resolve(serverRootDir, 'data/audio'),
  clipsDir: path.resolve(serverRootDir, 'data/clips'),
  captionsDir: path.resolve(serverRootDir, 'data/captions'),
  voiceoverDir: path.resolve(serverRootDir, 'data/voiceover'),
  movieExplanationDir: path.resolve(serverRootDir, 'data/movie_explanation'),
  movieAnalyzerDir: path.resolve(serverRootDir, 'data/movie_analyzer'),
  dbPath: path.resolve(serverRootDir, 'data/clipgen.db'),

  // FFmpeg
  ffmpegPath,
  ffprobePath,

  // AI & Local LLM
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiBaseUrl: process.env.OPENAI_BASE_URL || '',
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434',
  ollamaModel: process.env.OLLAMA_MODEL || 'ahmadwaqar/smolvlm2-256m-video:q8_0',
  ollamaVisionModel: process.env.OLLAMA_VISION_MODEL || 'ahmadwaqar/smolvlm2-256m-video:q8_0',
  ollamaScriptModel: process.env.OLLAMA_SCRIPT_MODEL || 'qwen3:4b',
  aiProvider: (process.env.AI_PROVIDER || 'openai') as 'openai' | 'anthropic' | 'google' | 'ollama' | 'local',
  aiModel: process.env.AI_MODEL || 'gpt-4o-mini',
  aiMaxTokens: envInt('AI_MAX_TOKENS', 2000),

  // Transcription
  transcriptionProvider: (process.env.TRANSCRIPTION_PROVIDER || 'openai') as 'openai' | 'local',
  fasterWhisperModel: process.env.FASTER_WHISPER_MODEL || 'base',

  // Pipeline
  maxVideoDuration: envInt('MAX_VIDEO_DURATION', 3600),
  maxUploadSize: envInt('MAX_UPLOAD_SIZE', 5 * 1024 * 1024 * 1024),
  maxShortsCount: envInt('MAX_SHORTS_COUNT', 10),
  maxShortDuration: envInt('MAX_SHORT_DURATION', 30),
  minShortDuration: envInt('MIN_SHORT_DURATION', 15),
  analysisChunkSize: envInt('ANALYSIS_CHUNK_SIZE', 120),
  chunkOverlap: envInt('CHUNK_OVERLAP', 30),

  // Output
  outputWidth: envInt('OUTPUT_WIDTH', 1080),
  outputHeight: envInt('OUTPUT_HEIGHT', 1920),
  outputFps: envInt('OUTPUT_FPS', 30),
  outputFormat: process.env.OUTPUT_FORMAT || 'mp4',
};
