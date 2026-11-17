// ============================================================
// Storage Service — File Management
// ============================================================

import fs from 'fs';
import path from 'path';
import { config } from '../config/index.js';
import { v4 as uuid } from 'uuid';

export function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function getProjectDir(projectId: string): string {
  const dir = path.join(config.uploadsDir, projectId);
  ensureDir(dir);
  return dir;
}

export function getProjectAudioDir(projectId: string): string {
  const dir = path.join(config.audioDir, projectId);
  ensureDir(dir);
  return dir;
}

export function getProjectClipsDir(projectId: string): string {
  const dir = path.join(config.clipsDir, projectId);
  ensureDir(dir);
  return dir;
}

export function getProjectCaptionsDir(projectId: string): string {
  const dir = path.join(config.captionsDir, projectId);
  ensureDir(dir);
  return dir;
}

export function getThumbDir(projectId: string): string {
  const dir = path.join(config.thumbsDir, projectId);
  ensureDir(dir);
  return dir;
}

export function getRenderDir(projectId: string): string {
  const dir = path.join(config.rendersDir, projectId);
  ensureDir(dir);
  return dir;
}

export function getLongFormDir(projectId: string): string {
  const dir = path.join(config.rendersDir, projectId, 'longform');
  ensureDir(dir);
  return dir;
}

export function saveUploadedFile(
  buffer: Buffer,
  projectId: string,
  originalFilename: string
): { filename: string; filepath: string; url: string } {
  const ext = path.extname(originalFilename).toLowerCase();
  const filename = `${uuid()}${ext}`;
  const dir = getProjectDir(projectId);
  const filepath = path.join(dir, filename);

  fs.writeFileSync(filepath, buffer);

  return {
    filename,
    filepath,
    url: `/api/files/${projectId}/${filename}`,
  };
}

export function deleteFile(filepath: string): void {
  if (fs.existsSync(filepath)) {
    try {
      fs.unlinkSync(filepath);
    } catch (err) {
      console.error('Failed to delete file:', filepath, err);
    }
  }
}

export function deleteProjectFiles(projectId: string): void {
  const dirs = [
    path.join(config.uploadsDir, projectId),
    path.join(config.thumbsDir, projectId),
    path.join(config.rendersDir, projectId),
    path.join(config.audioDir, projectId),
    path.join(config.clipsDir, projectId),
    path.join(config.captionsDir, projectId),
    path.join(config.voiceoverDir, projectId),
    path.join(config.movieExplanationDir, projectId),
    path.join(config.movieAnalyzerDir, projectId),
  ];
  for (const dir of dirs) {
    if (fs.existsSync(dir)) {
      try {
        fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch (err) {
        console.warn('Failed to delete directory:', dir, err);
      }
    }
  }
}

export function getFilePath(projectId: string, filename: string): string {
  return path.join(config.uploadsDir, projectId, filename);
}

export function getFileSize(filepath: string): number {
  try {
    const stat = fs.statSync(filepath);
    return stat.size;
  } catch {
    return 0;
  }
}

export function fileExists(filepath: string): boolean {
  return fs.existsSync(filepath);
}

export function getVoiceoverProjectDir(projectId: string): string {
  const dir = path.join(config.voiceoverDir, projectId);
  ensureDir(dir);
  return dir;
}

export function getVoiceoverAudioDir(projectId: string): string {
  const dir = path.join(config.voiceoverDir, projectId, 'audio');
  ensureDir(dir);
  return dir;
}

export function getVoiceoverFootageDir(projectId: string): string {
  const dir = path.join(config.voiceoverDir, projectId, 'footage');
  ensureDir(dir);
  return dir;
}

export function getVoiceoverThumbsDir(projectId: string): string {
  const dir = path.join(config.voiceoverDir, projectId, 'thumbnails');
  ensureDir(dir);
  return dir;
}

export function getVoiceoverRendersDir(projectId: string): string {
  const dir = path.join(config.voiceoverDir, projectId, 'renders');
  ensureDir(dir);
  return dir;
}

export function getMovieExplanationProjectDir(projectId: string): string {
  const dir = path.join(config.movieExplanationDir, projectId);
  ensureDir(dir);
  return dir;
}

export function getMovieExplanationRendersDir(projectId: string): string {
  const dir = path.join(config.movieExplanationDir, projectId, 'renders');
  ensureDir(dir);
  return dir;
}

export function getMovieExplanationThumbsDir(projectId: string): string {
  const dir = path.join(config.movieExplanationDir, projectId, 'thumbnails');
  ensureDir(dir);
  return dir;
}

export function getMovieAnalyzerProjectDir(projectId: string): string {
  const dir = path.join(config.movieAnalyzerDir, projectId);
  ensureDir(dir);
  return dir;
}

// Initialize all storage directories
export function initializeStorage(): void {
  ensureDir(config.dataDir);
  ensureDir(config.uploadsDir);
  ensureDir(config.rendersDir);
  ensureDir(config.thumbsDir);
  ensureDir(config.audioDir);
  ensureDir(config.clipsDir);
  ensureDir(config.captionsDir);
  ensureDir(config.voiceoverDir);
  ensureDir(config.movieExplanationDir);
  ensureDir(config.movieAnalyzerDir);
  console.log('✓ Storage directories initialized');
}


