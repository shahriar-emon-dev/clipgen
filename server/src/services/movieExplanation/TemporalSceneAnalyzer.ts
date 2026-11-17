// ============================================================
// TemporalSceneAnalyzer
// Isolated module for temporal multi-frame analysis of movie scenes.
// Detects primary and secondary actions, action-level time ranges,
// characters, emotions, and inter-scene narrative continuity.
// ============================================================

import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import type { EpisodeScene } from '../../../../shared/types.js';

export interface SceneActionTimeRange {
  action: string;
  startTime: number;
  endTime: number;
  isPrimary: boolean;
  confidence: number;
}

export interface TemporalSceneAnalysisResult {
  sceneId: string;
  primaryAction: string;
  secondaryActions: string[];
  actionTimeRanges: SceneActionTimeRange[];
  characters: string[];
  location: string;
  emotionalTone: string;
  representativeFramePaths: string[];
  previousSceneId?: string;
  nextSceneId?: string;
  narrativeFlowSummary: string;
}

export class TemporalSceneAnalyzer {
  /**
   * Enriches a list of scenes with temporal action ranges,
   * multi-frame visual anchors, and inter-scene continuity links.
   */
  public analyzeTemporalContinuity(
    scenes: EpisodeScene[],
    videoFilePath?: string,
    outputDir?: string
  ): TemporalSceneAnalysisResult[] {
    if (!scenes || scenes.length === 0) return [];

    const results: TemporalSceneAnalysisResult[] = [];

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const prevScene = i > 0 ? scenes[i - 1] : undefined;
      const nextScene = i < scenes.length - 1 ? scenes[i + 1] : undefined;

      const primaryAction = scene.actions && scene.actions.length > 0
        ? scene.actions[0]
        : 'observing / conversational dialogue';

      const secondaryActions = scene.secondaryActions || (scene.actions ? scene.actions.slice(1) : []);

      // Build temporal action slices across the scene duration
      const duration = Math.max(1.0, scene.endTime - scene.startTime);
      const actionRanges: SceneActionTimeRange[] = [];

      if (secondaryActions.length > 0) {
        const sliceDur = duration / (secondaryActions.length + 1);
        actionRanges.push({
          action: primaryAction,
          startTime: scene.startTime,
          endTime: Number((scene.startTime + sliceDur).toFixed(2)),
          isPrimary: true,
          confidence: 0.9,
        });
        secondaryActions.forEach((act, actIdx) => {
          actionRanges.push({
            action: act,
            startTime: Number((scene.startTime + (actIdx + 1) * sliceDur).toFixed(2)),
            endTime: Number((scene.startTime + (actIdx + 2) * sliceDur).toFixed(2)),
            isPrimary: false,
            confidence: 0.8,
          });
        });
      } else {
        actionRanges.push({
          action: primaryAction,
          startTime: scene.startTime,
          endTime: scene.endTime,
          isPrimary: true,
          confidence: 0.95,
        });
      }

      // Multi-frame visual anchors
      const representativeFrames = scene.representativeFramePaths && scene.representativeFramePaths.length > 0
        ? scene.representativeFramePaths
        : (scene.thumbnailUrl ? [scene.thumbnailUrl] : []);

      // Structured narrative summary
      const charactersText = (scene.characters && scene.characters.length > 0)
        ? scene.characters.join(', ')
        : 'Unknown / Background figures';
      const flowSummary = `Scene ${scene.sceneId} (${scene.startTime.toFixed(1)}s - ${scene.endTime.toFixed(1)}s): [${scene.location || 'Interior'}] ${charactersText} involved in ${primaryAction}.`;

      results.push({
        sceneId: scene.sceneId,
        primaryAction,
        secondaryActions,
        actionTimeRanges: actionRanges,
        characters: scene.characters || [],
        location: scene.location || 'narrative space',
        emotionalTone: scene.emotionalTone || 'neutral',
        representativeFramePaths: representativeFrames,
        previousSceneId: prevScene?.sceneId,
        nextSceneId: nextScene?.sceneId,
        narrativeFlowSummary: flowSummary,
      });
    }

    return results;
  }

  /**
   * Asynchronously extracts entry, mid, and peak action frames if missing
   */
  public async extractMultiFramesIfMissing(
    videoPath: string,
    scene: EpisodeScene,
    outputFolder: string
  ): Promise<string[]> {
    if (!fs.existsSync(videoPath)) return [];
    if (scene.representativeFramePaths && scene.representativeFramePaths.length >= 3) {
      return scene.representativeFramePaths;
    }

    const start = scene.startTime;
    const dur = Math.max(1.0, scene.endTime - scene.startTime);
    const entryTime = Math.min(scene.endTime - 0.2, start + 0.4);
    const midTime = start + dur * 0.5;
    const peakTime = Math.min(scene.endTime - 0.2, start + dur * 0.75);

    const frameTimes = [entryTime, midTime, peakTime];
    const framePaths: string[] = [];

    for (let idx = 0; idx < frameTimes.length; idx++) {
      const timecode = frameTimes[idx];
      const outPath = path.join(outputFolder, `${scene.sceneId}_frame_${idx}.jpg`);

      if (fs.existsSync(outPath)) {
        framePaths.push(outPath);
        continue;
      }

      await new Promise<void>((resolve) => {
        const proc = spawn('ffmpeg', [
          '-ss', timecode.toFixed(3),
          '-i', videoPath,
          '-vframes', '1',
          '-q:v', '3',
          '-vf', 'scale=640:-1',
          '-y', outPath,
        ]);
        proc.on('close', () => resolve());
        proc.on('error', () => resolve());
      });

      if (fs.existsSync(outPath)) {
        framePaths.push(outPath);
      }
    }

    scene.representativeFramePaths = framePaths;
    return framePaths;
  }
}

export const temporalSceneAnalyzer = new TemporalSceneAnalyzer();
