// ============================================================
// Scene Detector — FFmpeg-based scene change detection
// ============================================================

import { spawn } from 'child_process';
import { config } from '../config/index.js';
import { getDb } from './database.js';
import { v4 as uuid } from 'uuid';
import type { Scene } from '../../../shared/types.js';
import { titleBumperDetector } from './movieExplanation/TitleBumperDetector.js';

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export async function detectScenes(
  videoPath: string,
  projectId: string,
  videoDuration: number,
  threshold: number = 0.3,
  onProgress?: (percent: number, detail: string) => void
): Promise<Scene[]> {
  // Check cache
  const db = getDb();
  const existing = db.prepare('SELECT COUNT(*) as count FROM scenes WHERE project_id = ?').get(projectId) as any;
  if (existing.count > 0) {
    if (onProgress) onProgress(100, 'Loaded existing detected scenes from cache');
    return loadScenes(projectId);
  }

  const sceneTimestamps = await detectSceneChanges(videoPath, threshold, videoDuration, onProgress);

  // Build scene objects from detected change points
  const scenes: Scene[] = [];
  let prevTime = 0;

  for (let i = 0; i < sceneTimestamps.length; i++) {
    const endTime = sceneTimestamps[i];
    if (endTime - prevTime < 0.5) {
      prevTime = endTime;
      continue; // Skip very short scenes
    }

    scenes.push({
      id: uuid(),
      projectId,
      sceneIndex: scenes.length,
      startTime: prevTime,
      endTime,
      duration: endTime - prevTime,
    });
    prevTime = endTime;
  }

  // Add final scene to cover remaining duration
  if (prevTime < videoDuration - 0.5) {
    scenes.push({
      id: uuid(),
      projectId,
      sceneIndex: scenes.length,
      startTime: prevTime,
      endTime: videoDuration,
      duration: videoDuration - prevTime,
    });
  }

  // If no scenes detected, create a single scene covering the whole video
  if (scenes.length === 0) {
    scenes.push({
      id: uuid(),
      projectId,
      sceneIndex: 0,
      startTime: 0,
      endTime: videoDuration,
      duration: videoDuration,
    });
  }

  // Detect non-narrative title cards & bumpers across any project
  try {
    const openingSlate = await titleBumperDetector.detectOpeningTitleSlate(videoPath);
    if (openingSlate && openingSlate.hasTitleSlate) {
      for (const scene of scenes) {
        if (scene.startTime < openingSlate.openingSlateEnd - 0.5) {
          scene.isBumper = true;
        }
      }
    }
  } catch (err: any) {
    // Non-fatal bumper detection fallback
  }

  // Store in database
  const insertScene = db.prepare(`
    INSERT INTO scenes (id, project_id, scene_index, start_time, end_time, duration, is_bumper)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertAll = db.transaction(() => {
    for (const scene of scenes) {
      insertScene.run(scene.id, projectId, scene.sceneIndex, scene.startTime, scene.endTime, scene.duration, scene.isBumper ? 1 : 0);
    }
  });
  insertAll();

  if (onProgress) {
    onProgress(100, `Detected ${scenes.length} scene cuts across ${formatDuration(videoDuration)}`);
  }

  return scenes;
}

export async function detectSceneChanges(
  videoPath: string,
  threshold: number,
  videoDuration: number,
  onProgress?: (percent: number, detail: string) => void
): Promise<number[]> {
  return new Promise((resolve, reject) => {
    // Downscale to 240p and sample at 5fps for high-speed detection while preserving cut accuracy
    const args = [
      '-threads', '0',
      '-i', videoPath,
      '-vf', `fps=5,scale=240:-1:flags=fast_bilinear,select='gt(scene,${threshold})',showinfo`,
      '-vsync', 'vfr',
      '-f', 'null',
      '-',
    ];

    const proc = spawn(config.ffmpegPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    const timestamps: number[] = [];
    let lastProgressTime = 0;
    let maxScannedSeconds = 0;

    proc.stderr?.on('data', (d: Buffer) => {
      const chunk = d.toString();
      stderr += chunk;

      // Extract detected scene timestamps on the fly
      const ptsRegex = /pts_time:(\d+\.?\d*)/g;
      let match;
      while ((match = ptsRegex.exec(chunk)) !== null) {
        const time = parseFloat(match[1]);
        if (!isNaN(time) && time > 0) {
          timestamps.push(time);
          if (time > maxScannedSeconds) maxScannedSeconds = time;
        }
      }

      // Check for FFmpeg time=HH:MM:SS.ms progress line
      const timeMatch = chunk.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d+)/);
      if (timeMatch) {
        const h = parseFloat(timeMatch[1]);
        const m = parseFloat(timeMatch[2]);
        const s = parseFloat(timeMatch[3]);
        const currentSec = h * 3600 + m * 60 + s;
        if (currentSec > maxScannedSeconds) maxScannedSeconds = currentSec;
      }

      // Throttle live progress updates to once every 350ms
      const now = Date.now();
      if (onProgress && now - lastProgressTime > 350 && videoDuration > 0) {
        lastProgressTime = now;
        const percent = Math.min(99, Math.max(1, Math.round((maxScannedSeconds / videoDuration) * 100)));
        const detail = `Scanned ${formatDuration(maxScannedSeconds)} / ${formatDuration(videoDuration)} (${percent}%) • ${timestamps.length} scene cuts found`;
        onProgress(percent, detail);
      }
    });

    proc.on('close', (code) => {
      // Final parse of any remaining timestamps from full stderr
      const regex = /pts_time:(\d+\.?\d*)/g;
      let match;
      while ((match = regex.exec(stderr)) !== null) {
        const time = parseFloat(match[1]);
        if (!isNaN(time) && time > 0) {
          timestamps.push(time);
        }
      }

      // Sort and deduplicate
      const unique = [...new Set(timestamps)].sort((a, b) => a - b);
      resolve(unique);
    });

    proc.on('error', (err) => {
      console.warn('Scene detection failed, returning empty:', err.message);
      resolve([]);
    });
  });
}

export function loadScenes(projectId: string): Scene[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM scenes WHERE project_id = ? ORDER BY scene_index'
  ).all(projectId) as any[];

  return rows.map(row => ({
    id: row.id,
    projectId: row.project_id,
    sceneIndex: row.scene_index,
    startTime: row.start_time,
    endTime: row.end_time,
    duration: row.duration,
    thumbnailPath: row.thumbnail_path,
    isBumper: Boolean(row.is_bumper),
  }));
}
