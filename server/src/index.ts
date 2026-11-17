// ============================================================
// AI Shorts Generator — Server Entry Point
// ============================================================

import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { fileURLToPath } from 'url';
import { config } from './config/index.js';
import { initializeDatabase } from './services/database.js';
import { initializeStorage } from './services/storage.js';
import { checkFFmpeg } from './services/ffmpeg.js';
import authRoutes from './routes/auth.js';
import projectRoutes from './routes/projects.js';
import uploadRoutes from './routes/upload.js';
import processingRoutes, { setWebSocketBroadcast } from './routes/processing.js';
import highlightRoutes from './routes/highlights.js';
import shortsRoutes, { setShortsWebSocketBroadcast, globalRenderQueue } from './routes/shorts.js';
import { longFormRouter, setLongFormWebSocketBroadcast } from './routes/longForm.js';
import { voiceoverRouter, setVoiceoverWebSocketBroadcast } from './routes/voiceover.js';
import { movieExplanationRouter, setMovieExplanationWebSocketBroadcast } from './routes/movieExplanation.js';
import { movieAnalyzerRouter, setMovieAnalyzerWebSocketBroadcast } from './routes/movieAnalyzer.js';
import { projectLibraryRouter } from './routes/projectLibrary.js';
import settingsRoutes from './routes/settings.js';
import { errorHandler } from './middleware/errorHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);

// ── WebSocket Setup ──

const wss = new WebSocketServer({ server, path: '/ws' });
const projectClients = new Map<string, Set<WebSocket>>();

wss.on('error', () => {});

wss.on('connection', (ws, req) => {
  ws.on('error', () => {});

  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const projectId = url.searchParams.get('projectId');

  if (projectId) {
    if (!projectClients.has(projectId)) {
      projectClients.set(projectId, new Set());
    }
    projectClients.get(projectId)!.add(ws);

    try {
      ws.send(JSON.stringify({ type: 'connected', payload: { projectId } }));
    } catch {}

    ws.on('close', () => {
      projectClients.get(projectId)?.delete(ws);
      if (projectClients.get(projectId)?.size === 0) {
        projectClients.delete(projectId);
      }
    });
  }
});

function broadcastToProject(projectId: string, data: any): void {
  const clients = projectClients.get(projectId);
  if (!clients) return;

  const message = JSON.stringify(data);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(message);
      } catch {}
    }
  }
}

// Wire up WebSocket broadcast to processing, shorts, longform, voiceover, movie explanation, and movie analyzer routes
setWebSocketBroadcast(broadcastToProject);
setShortsWebSocketBroadcast(broadcastToProject);
setLongFormWebSocketBroadcast(broadcastToProject);
setVoiceoverWebSocketBroadcast(broadcastToProject);
setMovieExplanationWebSocketBroadcast(broadcastToProject);
setMovieAnalyzerWebSocketBroadcast(broadcastToProject);

// ── Middleware ──

app.use(cors({ origin: config.clientUrl, credentials: true }));
app.use(express.json({ limit: '10mb' }));

// ── Static File Serving ──

// Serve uploaded videos
app.use('/api/files', (req, res, next) => {
  const sanitized = req.path.replace(/\.\./g, '');
  const filePath = path.join(config.uploadsDir, sanitized);
  if (!filePath.startsWith(config.uploadsDir)) {
    return res.status(403).json({ error: 'Access denied' });
  }
  next();
});
app.use('/api/files', express.static(config.uploadsDir, { maxAge: '1h' }));
app.use('/api/files/thumbs', express.static(config.thumbsDir, { maxAge: '1h' }));
app.use('/api/files/clips', express.static(config.clipsDir, { maxAge: '1h' }));
app.use('/api/files/renders', express.static(config.rendersDir, { maxAge: '1h' }));
app.use('/api/files/voiceover', express.static(config.voiceoverDir, { maxAge: '1h' }));
app.use('/api/files/movie_explanation', express.static(config.movieExplanationDir, { maxAge: '1h' }));
app.use('/api/files/movie_analyzer', express.static(config.movieAnalyzerDir, { maxAge: '1h' }));

// ── Health Check ──

app.get('/api/health', async (_req, res) => {
  const ffmpeg = await checkFFmpeg();
  res.json({
    status: 'ok',
    ffmpeg: ffmpeg.available,
    ffmpegVersion: ffmpeg.version,
    version: '1.0.0',
    aiConfigured: !!config.openaiApiKey,
    transcriptionProvider: config.transcriptionProvider,
  });
});

// ── API Routes ──

app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/projects', uploadRoutes);
app.use('/api/projects', processingRoutes);
app.use('/api/projects', highlightRoutes);
app.use('/api/highlights', highlightRoutes);
app.use('/api', shortsRoutes);
app.use('/api', longFormRouter);
app.use('/api/voiceover', voiceoverRouter);
app.use('/api/movie-explanation', movieExplanationRouter);
app.use('/api/movie-analyzer', movieAnalyzerRouter);
app.use('/api/project-library', projectLibraryRouter);
app.use('/api', settingsRoutes);

// ── Serve Frontend (Production) ──

const clientDistPath = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/ws')) return next();
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

// ── Error Handler ──

app.use(errorHandler);

// ── Start Server ──

async function start() {
  console.log('\n🎬 AI Shorts Generator — Server');
  console.log('─'.repeat(50));

  initializeStorage();
  initializeDatabase();

  const ffmpeg = await checkFFmpeg();
  if (ffmpeg.available) {
    console.log(`✓ FFmpeg: ${ffmpeg.version}`);
  } else {
    console.warn('⚠ FFmpeg not found. Video processing will not work.');
    console.warn('  Install: https://ffmpeg.org/download.html');
  }

  if (config.openaiApiKey) {
    console.log('✓ OpenAI API key configured');
  } else {
    console.warn('⚠ No OPENAI_API_KEY set. AI scoring and cloud transcription disabled.');
  }

  console.log(`✓ Transcription: ${config.transcriptionProvider}`);
  console.log(`✓ AI Model: ${config.aiModel}`);

  server.listen(config.port, config.host, () => {
    console.log(`✓ Server: http://localhost:${config.port}`);
    console.log(`✓ WebSocket: ws://localhost:${config.port}/ws`);
    console.log('─'.repeat(50));
  });
}

// ── Graceful Shutdown & Process Cleanup ──

const cleanupAndExit = () => {
  try {
    globalRenderQueue.killAll();
  } catch {}
  process.exit(0);
};

process.on('SIGINT', cleanupAndExit);
process.on('SIGTERM', cleanupAndExit);

// ── Process Startup Active ──
start().catch(console.error);
