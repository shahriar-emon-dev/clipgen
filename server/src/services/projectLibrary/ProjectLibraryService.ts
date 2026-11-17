// ============================================================
// Project Library Service — Central Project & Storage Management
// Manages projects across Movie Analyzer, Movie Explanation,
// Voiceover Video, and Shorts Clipping with safe individual asset
// deletion, bulk deletion, trash recovery, and storage cleanup.
// ============================================================

import fs from 'fs';
import path from 'path';
import { config } from '../../config/index.js';
import { getDb } from '../database.js';
import { deleteFile, deleteProjectFiles } from '../storage.js';
import { movieAnalyzerStore } from '../movieAnalyzer/MovieAnalyzerStore.js';
import { movieExplanationStore } from '../movieExplanation/MovieExplanationStore.js';
import { voiceoverStore } from '../voiceover/VoiceoverStore.js';
import type {
  ProjectLibraryCategory,
  ProjectLibraryAssetType,
  ProjectLibraryAsset,
  ProjectLibraryItem,
  ProjectLibraryOverview,
  ProjectLibraryBulkDeleteRequest,
  ProjectLibraryBulkDeleteResult,
  ProjectLibraryDeleteAllRequest,
  ProjectLibraryDeleteAllResult,
} from '../../../../shared/types.js';

export function formatBytes(bytes: number): string {
  if (bytes <= 0 || isNaN(bytes)) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i] || 'B'}`;
}

export function getSafeFileSize(filepath?: string | null): number {
  if (!filepath) return 0;
  try {
    if (fs.existsSync(filepath)) {
      const stat = fs.statSync(filepath);
      return stat.size;
    }
  } catch {}
  return 0;
}

export function getDirectorySize(dirPath: string): number {
  let total = 0;
  if (!fs.existsSync(dirPath)) return 0;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const ent of entries) {
      const fullPath = path.join(dirPath, ent.name);
      if (ent.isDirectory()) {
        total += getDirectorySize(fullPath);
      } else if (ent.isFile()) {
        try {
          total += fs.statSync(fullPath).size;
        } catch {}
      }
    }
  } catch {}
  return total;
}

export class ProjectLibraryService {
  /**
   * Retrieves a comprehensive overview of all projects across the application.
   */
  public getOverview(): ProjectLibraryOverview {
    const projects: ProjectLibraryItem[] = [];

    // 1. Movie Analyzer Projects
    const analyzerProjects = movieAnalyzerStore.listProjects();
    for (const p of analyzerProjects) {
      const assets: ProjectLibraryAsset[] = [];
      const projectDir = movieAnalyzerStore.getProjectDir(p.id);

      // Video Asset
      if (p.video?.filePath && fs.existsSync(p.video.filePath)) {
        const size = getSafeFileSize(p.video.filePath);
        assets.push({
          assetId: `video_${p.id}`,
          type: 'video',
          name: p.video.originalFilename || p.video.filename || 'Source Video',
          filename: p.video.filename || path.basename(p.video.filePath),
          relativePath: path.relative(config.dataDir, p.video.filePath),
          sizeBytes: size,
          formattedSize: formatBytes(size),
          canDeleteIndividually: true,
          metadata: {
            duration: p.video.duration,
            resolution: `${p.video.width || 0}x${p.video.height || 0}`,
            codec: p.video.codec,
          },
        });
      }

      // Transcript Asset
      if (p.transcript?.rawText || (p.transcript?.filePath && fs.existsSync(p.transcript.filePath))) {
        const filePath = p.transcript.filePath;
        const size = filePath && fs.existsSync(filePath)
          ? getSafeFileSize(filePath)
          : Buffer.byteLength(p.transcript.rawText || '', 'utf8');

        assets.push({
          assetId: `transcript_${p.id}`,
          type: 'transcript',
          name: p.transcript.filename || 'Original Transcript',
          filename: p.transcript.filename || 'transcript.txt',
          relativePath: filePath ? path.relative(config.dataDir, filePath) : undefined,
          sizeBytes: size,
          formattedSize: formatBytes(size),
          canDeleteIndividually: true,
          metadata: {
            wordCount: p.transcript.wordCount,
            lineCount: p.transcript.lineCount,
            isTruncated: p.transcript.isTruncated,
          },
        });
      }

      // Script Assets (English / Hindi / Bangla)
      if (p.scripts?.english || p.scripts?.hindi || p.scripts?.bangla) {
        const langs = [
          p.scripts.english ? `EN (${p.scripts.english.wordCount}w)` : null,
          p.scripts.hindi ? `HI (${p.scripts.hindi.wordCount}w)` : null,
          p.scripts.bangla ? `BN (${p.scripts.bangla.wordCount}w)` : null,
        ].filter(Boolean).join(', ');

        const scriptContent = JSON.stringify(p.scripts);
        const scriptSize = Buffer.byteLength(scriptContent, 'utf8');

        assets.push({
          assetId: `script_${p.id}`,
          type: 'script',
          name: `Explanation Scripts: ${langs}`,
          filename: 'scripts.json',
          sizeBytes: scriptSize,
          formattedSize: formatBytes(scriptSize),
          canDeleteIndividually: true,
          metadata: {
            targetDurationMinutes: p.scripts.targetDurationMinutes,
            isApproved: p.scripts.isApproved,
          },
        });
      }

      // Voiceover Audio Asset
      if (p.voiceover?.audioPath && fs.existsSync(p.voiceover.audioPath)) {
        const size = getSafeFileSize(p.voiceover.audioPath);
        assets.push({
          assetId: `audio_${p.id}`,
          type: 'audio',
          name: p.voiceover.filename || 'Voiceover Audio',
          filename: p.voiceover.filename || path.basename(p.voiceover.audioPath),
          relativePath: path.relative(config.dataDir, p.voiceover.audioPath),
          sizeBytes: size,
          formattedSize: formatBytes(size),
          canDeleteIndividually: true,
          metadata: { duration: p.voiceover.duration },
        });
      }

      // Thumbnails directory
      const thumbsDir = path.join(projectDir, 'thumbnails');
      if (fs.existsSync(thumbsDir)) {
        const thumbSize = getDirectorySize(thumbsDir);
        if (thumbSize > 0) {
          assets.push({
            assetId: `thumbs_${p.id}`,
            type: 'thumbnail',
            name: 'Scene Thumbnails',
            filename: 'thumbnails/',
            sizeBytes: thumbSize,
            formattedSize: formatBytes(thumbSize),
            canDeleteIndividually: true,
          });
        }
      }

      const totalSizeBytes = getDirectorySize(projectDir);
      const isTrash = (p as any).isTrash === true;

      projects.push({
        id: p.id,
        name: p.name,
        type: 'movie_analyzer',
        typeLabel: 'Movie Analyzer & Script',
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        totalSizeBytes,
        formattedTotalSize: formatBytes(totalSizeBytes),
        assets,
        isTrash,
        trashedAt: (p as any).trashedAt,
        stageLabel: `Stage ${p.stage || 1} (${p.status || 'setup'})`,
        status: p.status,
      });
    }

    // 2. Movie Explanation Projects
    const explanationProjects = movieExplanationStore.listProjects();
    for (const ep of explanationProjects) {
      const assets: ProjectLibraryAsset[] = [];
      const projectDir = movieExplanationStore.getProjectDir(ep.projectId);

      // Uploaded Clips
      if (ep.uploadedClips && ep.uploadedClips.length > 0) {
        let clipsSize = 0;
        for (const c of ep.uploadedClips) {
          clipsSize += getSafeFileSize(c.filePath);
        }
        assets.push({
          assetId: `clips_${ep.projectId}`,
          type: 'video',
          name: `${ep.uploadedClips.length} Source Clip(s)`,
          filename: ep.uploadedClips[0]?.originalFilename || 'source_clips',
          sizeBytes: clipsSize,
          formattedSize: formatBytes(clipsSize),
          canDeleteIndividually: true,
          metadata: { count: ep.uploadedClips.length },
        });
      }

      // Voiceover Audio
      if (ep.voiceoverAudio?.filePath && fs.existsSync(ep.voiceoverAudio.filePath)) {
        const size = getSafeFileSize(ep.voiceoverAudio.filePath);
        assets.push({
          assetId: `audio_${ep.projectId}`,
          type: 'audio',
          name: ep.voiceoverAudio.originalFilename || 'Voiceover Audio',
          filename: ep.voiceoverAudio.filename || path.basename(ep.voiceoverAudio.filePath),
          sizeBytes: size,
          formattedSize: formatBytes(size),
          canDeleteIndividually: true,
          metadata: { duration: ep.voiceoverAudio.duration },
        });
      }

      // Renders
      const rendersDir = path.join(projectDir, 'renders');
      if (fs.existsSync(rendersDir)) {
        const renderSize = getDirectorySize(rendersDir);
        if (renderSize > 0) {
          assets.push({
            assetId: `render_${ep.projectId}`,
            type: 'render',
            name: 'Rendered Output MP4',
            filename: ep.renderedVideoPath ? path.basename(ep.renderedVideoPath) : 'renders/',
            sizeBytes: renderSize,
            formattedSize: formatBytes(renderSize),
            canDeleteIndividually: true,
          });
        }
      }

      const totalSizeBytes = getDirectorySize(projectDir);
      const isTrash = (ep as any).isTrash === true;

      projects.push({
        id: ep.projectId,
        name: ep.projectName,
        type: 'movie_explanation',
        typeLabel: 'Movie Explanation Studio',
        createdAt: ep.createdAt,
        updatedAt: ep.updatedAt,
        totalSizeBytes,
        formattedTotalSize: formatBytes(totalSizeBytes),
        assets,
        isTrash,
        trashedAt: (ep as any).trashedAt,
        stageLabel: ep.status,
        status: ep.status,
      });
    }

    // 3. Voiceover Studio Projects
    const voProjects = voiceoverStore.listProjects();
    for (const vp of voProjects) {
      const assets: ProjectLibraryAsset[] = [];
      const projectDir = voiceoverStore.getProjectDir(vp.projectId);

      if (vp.voiceover?.filePath && fs.existsSync(vp.voiceover.filePath)) {
        const size = getSafeFileSize(vp.voiceover.filePath);
        assets.push({
          assetId: `audio_${vp.projectId}`,
          type: 'audio',
          name: vp.voiceover.originalFilename || 'Voiceover Audio Track',
          filename: vp.voiceover.filename || path.basename(vp.voiceover.filePath),
          sizeBytes: size,
          formattedSize: formatBytes(size),
          canDeleteIndividually: true,
        });
      }

      const totalSizeBytes = getDirectorySize(projectDir);
      const isTrash = (vp as any).isTrash === true;

      projects.push({
        id: vp.projectId,
        name: `Voiceover Project ${vp.projectId.slice(0, 8)}`,
        type: 'voiceover',
        typeLabel: 'Voiceover Video',
        createdAt: vp.createdAt,
        updatedAt: vp.updatedAt,
        totalSizeBytes,
        formattedTotalSize: formatBytes(totalSizeBytes),
        assets,
        isTrash,
        trashedAt: (vp as any).trashedAt,
        stageLabel: vp.status,
        status: vp.status,
      });
    }

    // 4. Shorts Clipping Projects (Database)
    try {
      const db = getDb();
      const dbProjects = db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all() as any[];
      for (const dp of dbProjects) {
        const assets: ProjectLibraryAsset[] = [];
        const projectUploadsDir = path.join(config.uploadsDir, dp.id);
        const projectRendersDir = path.join(config.rendersDir, dp.id);
        const projectClipsDir = path.join(config.clipsDir, dp.id);

        const videoRows = db.prepare('SELECT * FROM videos WHERE project_id = ?').all(dp.id) as any[];
        for (const v of videoRows) {
          if (v.file_path && fs.existsSync(v.file_path)) {
            const size = getSafeFileSize(v.file_path);
            assets.push({
              assetId: `video_${v.id}`,
              type: 'video',
              name: v.original_filename || 'Source Video',
              filename: v.filename || path.basename(v.file_path),
              sizeBytes: size,
              formattedSize: formatBytes(size),
              canDeleteIndividually: true,
              metadata: { duration: v.duration, resolution: `${v.width}x${v.height}` },
            });
          }
        }

        const transcriptRows = db.prepare('SELECT * FROM transcripts WHERE project_id = ?').all(dp.id) as any[];
        for (const t of transcriptRows) {
          assets.push({
            assetId: `transcript_${t.id}`,
            type: 'transcript',
            name: 'Clipping Transcript',
            filename: 'transcript.json',
            sizeBytes: Buffer.byteLength(t.raw_text || '', 'utf8'),
            formattedSize: formatBytes(Buffer.byteLength(t.raw_text || '', 'utf8')),
            canDeleteIndividually: true,
          });
        }

        const renderSize = getDirectorySize(projectRendersDir);
        if (renderSize > 0) {
          assets.push({
            assetId: `renders_${dp.id}`,
            type: 'render',
            name: 'Generated Shorts Renders',
            filename: 'renders/',
            sizeBytes: renderSize,
            formattedSize: formatBytes(renderSize),
            canDeleteIndividually: true,
          });
        }

        const totalSizeBytes =
          getDirectorySize(projectUploadsDir) +
          getDirectorySize(projectRendersDir) +
          getDirectorySize(projectClipsDir);

        const isTrash = dp.is_trash === 1 || dp.is_trash === true;

        projects.push({
          id: dp.id,
          name: dp.name,
          type: 'clipping',
          typeLabel: 'Shorts Clipping',
          createdAt: dp.created_at || new Date().toISOString(),
          updatedAt: dp.updated_at || dp.created_at || new Date().toISOString(),
          totalSizeBytes,
          formattedTotalSize: formatBytes(totalSizeBytes),
          assets,
          isTrash,
          trashedAt: dp.trashed_at,
          stageLabel: dp.status,
          status: dp.status,
        });
      }
    } catch (err) {
      console.warn('[ProjectLibraryService] Failed to load clipping projects from DB:', err);
    }

    // Sort all projects newest first
    projects.sort(
      (a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()
    );

    const countsByCategory: Record<ProjectLibraryCategory, number> = {
      movie_analyzer: 0,
      movie_explanation: 0,
      voiceover: 0,
      clipping: 0,
    };

    const storageByCategory: Record<ProjectLibraryCategory, number> = {
      movie_analyzer: 0,
      movie_explanation: 0,
      voiceover: 0,
      clipping: 0,
    };

    let totalAssetsCount = 0;
    let totalStorageBytes = 0;
    let trashCount = 0;

    for (const p of projects) {
      countsByCategory[p.type] = (countsByCategory[p.type] || 0) + 1;
      storageByCategory[p.type] = (storageByCategory[p.type] || 0) + p.totalSizeBytes;
      totalAssetsCount += p.assets.length;
      totalStorageBytes += p.totalSizeBytes;
      if (p.isTrash) trashCount++;
    }

    return {
      projects,
      totalProjectsCount: projects.length,
      totalAssetsCount,
      totalStorageBytes,
      formattedTotalStorage: formatBytes(totalStorageBytes),
      countsByCategory,
      storageByCategory,
      trashCount,
    };
  }

  /**
   * Deletes an entire project. Supports soft-delete (moving to Trash) or permanent deletion.
   */
  public deleteProject(
    category: ProjectLibraryCategory,
    projectId: string,
    permanent: boolean = false
  ): { success: boolean; freedBytes: number; message: string } {
    let freedBytes = 0;

    if (!permanent) {
      // Soft-delete (move to trash)
      if (category === 'movie_analyzer') {
        const p = movieAnalyzerStore.getProject(projectId);
        if (!p) throw new Error(`Movie Analyzer project ${projectId} not found`);
        (p as any).isTrash = true;
        (p as any).trashedAt = new Date().toISOString();
        movieAnalyzerStore.saveProject(p);
      } else if (category === 'movie_explanation') {
        const ep = movieExplanationStore.getProject(projectId);
        if (!ep) throw new Error(`Movie Explanation project ${projectId} not found`);
        (ep as any).isTrash = true;
        (ep as any).trashedAt = new Date().toISOString();
        movieExplanationStore.saveProject(ep);
      } else if (category === 'voiceover') {
        const vp = voiceoverStore.getProject(projectId);
        if (!vp) throw new Error(`Voiceover project ${projectId} not found`);
        (vp as any).isTrash = true;
        (vp as any).trashedAt = new Date().toISOString();
        voiceoverStore.saveProject(vp);
      } else if (category === 'clipping') {
        const db = getDb();
        try {
          db.prepare('UPDATE projects SET is_trash = 1, trashed_at = ? WHERE id = ?').run(
            new Date().toISOString(),
            projectId
          );
        } catch {
          // If column doesn't exist, execute permanent deletion
          return this.deleteProject(category, projectId, true);
        }
      }
      return { success: true, freedBytes: 0, message: `Project moved to Trash` };
    }

    // Permanent Deletion
    if (category === 'movie_analyzer') {
      const projectDir = movieAnalyzerStore.getProjectDir(projectId);
      freedBytes = getDirectorySize(projectDir);
      movieAnalyzerStore.deleteProject(projectId);
    } else if (category === 'movie_explanation') {
      const projectDir = movieExplanationStore.getProjectDir(projectId);
      freedBytes = getDirectorySize(projectDir);
      movieExplanationStore.deleteProject(projectId);
    } else if (category === 'voiceover') {
      const projectDir = voiceoverStore.getProjectDir(projectId);
      freedBytes = getDirectorySize(projectDir);
      voiceoverStore.deleteProject(projectId);
    } else if (category === 'clipping') {
      const projectUploadsDir = path.join(config.uploadsDir, projectId);
      const projectRendersDir = path.join(config.rendersDir, projectId);
      const projectClipsDir = path.join(config.clipsDir, projectId);
      freedBytes =
        getDirectorySize(projectUploadsDir) +
        getDirectorySize(projectRendersDir) +
        getDirectorySize(projectClipsDir);

      deleteProjectFiles(projectId);
      const db = getDb();
      try {
        db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
      } catch (err: any) {
        console.warn(`[ProjectLibraryService] Failed to delete project row:`, err);
      }
    }

    return {
      success: true,
      freedBytes,
      message: `Project permanently deleted (${formatBytes(freedBytes)} freed)`,
    };
  }

  /**
   * Restores a project from Trash.
   */
  public restoreProject(category: ProjectLibraryCategory, projectId: string): boolean {
    if (category === 'movie_analyzer') {
      const p = movieAnalyzerStore.getProject(projectId);
      if (!p) return false;
      delete (p as any).isTrash;
      delete (p as any).trashedAt;
      movieAnalyzerStore.saveProject(p);
      return true;
    } else if (category === 'movie_explanation') {
      const ep = movieExplanationStore.getProject(projectId);
      if (!ep) return false;
      delete (ep as any).isTrash;
      delete (ep as any).trashedAt;
      movieExplanationStore.saveProject(ep);
      return true;
    } else if (category === 'voiceover') {
      const vp = voiceoverStore.getProject(projectId);
      if (!vp) return false;
      delete (vp as any).isTrash;
      delete (vp as any).trashedAt;
      voiceoverStore.saveProject(vp);
      return true;
    } else if (category === 'clipping') {
      const db = getDb();
      try {
        db.prepare('UPDATE projects SET is_trash = 0, trashed_at = NULL WHERE id = ?').run(projectId);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  /**
   * Deletes an individual asset from a project without deleting the project itself.
   */
  public deleteIndividualAsset(
    category: ProjectLibraryCategory,
    projectId: string,
    assetType: ProjectLibraryAssetType,
    assetId?: string
  ): { success: boolean; freedBytes: number; message: string } {
    let freedBytes = 0;

    if (category === 'movie_analyzer') {
      const project = movieAnalyzerStore.getProject(projectId);
      if (!project) throw new Error(`Movie Analyzer project ${projectId} not found`);

      if (assetType === 'video') {
        if (project.video?.filePath) {
          freedBytes = getSafeFileSize(project.video.filePath);
          deleteFile(project.video.filePath);
        }
        project.video = undefined;
        project.stage = 1;
        movieAnalyzerStore.saveProject(project);
        return { success: true, freedBytes, message: `Source video deleted from project (${formatBytes(freedBytes)})` };
      }

      if (assetType === 'transcript') {
        if (project.transcript?.filePath) {
          freedBytes = getSafeFileSize(project.transcript.filePath);
          deleteFile(project.transcript.filePath);
        }
        project.transcript = undefined;
        project.stage = 1;
        movieAnalyzerStore.saveProject(project);
        return { success: true, freedBytes, message: `Transcript deleted from project (${formatBytes(freedBytes)})` };
      }

      if (assetType === 'script') {
        project.scripts = undefined;
        if (project.stage > 3) project.stage = 3;
        movieAnalyzerStore.saveProject(project);
        return { success: true, freedBytes: 0, message: `Scripts cleared from project` };
      }

      if (assetType === 'audio') {
        if (project.voiceover?.audioPath) {
          freedBytes = getSafeFileSize(project.voiceover.audioPath);
          deleteFile(project.voiceover.audioPath);
        }
        project.voiceover = undefined;
        if (project.stage > 5) project.stage = 4;
        movieAnalyzerStore.saveProject(project);
        return { success: true, freedBytes, message: `Voiceover audio deleted (${formatBytes(freedBytes)})` };
      }

      if (assetType === 'thumbnail') {
        const thumbDir = path.join(movieAnalyzerStore.getProjectDir(projectId), 'thumbnails');
        freedBytes = getDirectorySize(thumbDir);
        try { fs.rmSync(thumbDir, { recursive: true, force: true }); } catch {}
        return { success: true, freedBytes, message: `Thumbnails deleted (${formatBytes(freedBytes)})` };
      }
    }

    if (category === 'movie_explanation') {
      const ep = movieExplanationStore.getProject(projectId);
      if (!ep) throw new Error(`Movie Explanation project ${projectId} not found`);

      if (assetType === 'video') {
        if (ep.uploadedClips) {
          for (const c of ep.uploadedClips) {
            freedBytes += getSafeFileSize(c.filePath);
            deleteFile(c.filePath);
          }
          ep.uploadedClips = [];
        }
        movieExplanationStore.saveProject(ep);
        return { success: true, freedBytes, message: `Clips deleted (${formatBytes(freedBytes)})` };
      }

      if (assetType === 'audio') {
        if (ep.voiceoverAudio?.filePath) {
          freedBytes = getSafeFileSize(ep.voiceoverAudio.filePath);
          deleteFile(ep.voiceoverAudio.filePath);
        }
        ep.voiceoverAudio = undefined;
        movieExplanationStore.saveProject(ep);
        return { success: true, freedBytes, message: `Voiceover audio deleted (${formatBytes(freedBytes)})` };
      }

      if (assetType === 'render') {
        const rendersDir = path.join(movieExplanationStore.getProjectDir(projectId), 'renders');
        freedBytes = getDirectorySize(rendersDir);
        try { fs.rmSync(rendersDir, { recursive: true, force: true }); } catch {}
        ep.renderedVideoPath = undefined;
        ep.renderedVideoUrl = undefined;
        movieExplanationStore.saveProject(ep);
        return { success: true, freedBytes, message: `Render outputs deleted (${formatBytes(freedBytes)})` };
      }
    }

    if (category === 'clipping') {
      const db = getDb();
      if (assetType === 'video') {
        const videos = db.prepare('SELECT * FROM videos WHERE project_id = ?').all(projectId) as any[];
        for (const v of videos) {
          freedBytes += getSafeFileSize(v.file_path);
          deleteFile(v.file_path);
        }
        db.prepare('DELETE FROM videos WHERE project_id = ?').run(projectId);
        return { success: true, freedBytes, message: `Video files removed from project (${formatBytes(freedBytes)})` };
      }

      if (assetType === 'transcript') {
        db.prepare('DELETE FROM transcripts WHERE project_id = ?').run(projectId);
        db.prepare('DELETE FROM transcript_segments WHERE project_id = ?').run(projectId);
        return { success: true, freedBytes: 0, message: `Transcript removed from project` };
      }

      if (assetType === 'render') {
        const rendersDir = path.join(config.rendersDir, projectId);
        freedBytes = getDirectorySize(rendersDir);
        try { fs.rmSync(rendersDir, { recursive: true, force: true }); } catch {}
        return { success: true, freedBytes, message: `Rendered clips deleted (${formatBytes(freedBytes)})` };
      }
    }

    return { success: false, freedBytes: 0, message: `Unsupported asset deletion type` };
  }

  /**
   * Performs bulk deletion across multiple selected projects or individual assets.
   */
  public bulkDelete(request: ProjectLibraryBulkDeleteRequest): ProjectLibraryBulkDeleteResult {
    let deletedProjectsCount = 0;
    let deletedAssetsCount = 0;
    let totalFreedBytes = 0;
    const errors: string[] = [];

    for (const item of request.items) {
      try {
        if (item.assetType) {
          // Delete individual asset
          const res = this.deleteIndividualAsset(item.type, item.projectId, item.assetType, item.assetId);
          if (res.success) {
            deletedAssetsCount++;
            totalFreedBytes += res.freedBytes;
          }
        } else {
          // Delete entire project
          const res = this.deleteProject(item.type, item.projectId, request.permanent ?? false);
          if (res.success) {
            deletedProjectsCount++;
            totalFreedBytes += res.freedBytes;
          }
        }
      } catch (err: any) {
        errors.push(`${item.type}/${item.projectId}: ${err.message}`);
      }
    }

    return {
      deletedProjectsCount,
      deletedAssetsCount,
      freedBytes: totalFreedBytes,
      formattedFreedBytes: formatBytes(totalFreedBytes),
      errors,
    };
  }

  /**
   * Protected operation: Permanently deletes all projects or specific categories.
   * STRICTLY requires confirmPhrase === "DELETE ALL".
   */
  public deleteAllProjects(request: ProjectLibraryDeleteAllRequest): ProjectLibraryDeleteAllResult {
    if (request.confirmPhrase !== 'DELETE ALL') {
      throw new Error(`Invalid confirmation phrase. You must type 'DELETE ALL' exactly to confirm this action.`);
    }

    const overview = this.getOverview();
    let deletedProjectsCount = 0;
    let totalFreedBytes = 0;

    for (const p of overview.projects) {
      if (request.scope === 'trash_only' && !p.isTrash) {
        continue;
      }

      try {
        if (request.scope === 'assets_only') {
          // Clean assets only, preserve project shell
          for (const a of p.assets) {
            if (a.canDeleteIndividually) {
              const res = this.deleteIndividualAsset(p.type, p.id, a.type, a.assetId);
              totalFreedBytes += res.freedBytes;
            }
          }
        } else {
          // Delete entire project permanently
          const res = this.deleteProject(p.type, p.id, true);
          if (res.success) {
            deletedProjectsCount++;
            totalFreedBytes += res.freedBytes;
          }
        }
      } catch (err) {
        console.warn(`[ProjectLibraryService] Failed to delete ${p.type}/${p.id}:`, err);
      }
    }

    return {
      success: true,
      deletedProjectsCount,
      freedBytes: totalFreedBytes,
      formattedFreedBytes: formatBytes(totalFreedBytes),
      message: `Cleaned up ${deletedProjectsCount} project(s), freeing ${formatBytes(totalFreedBytes)} of storage.`,
    };
  }

  /**
   * Scans storage folders and cleans up unlinked or orphaned files.
   */
  public cleanupOrphans(): { freedBytes: number; formattedFreedBytes: string; message: string } {
    let freedBytes = 0;
    const overview = this.getOverview();
    const activeIds = new Set(overview.projects.map((p) => p.id));

    const checkDirs = [
      config.uploadsDir,
      config.rendersDir,
      config.thumbsDir,
      config.audioDir,
      config.clipsDir,
      config.captionsDir,
    ];

    for (const baseDir of checkDirs) {
      if (!fs.existsSync(baseDir)) continue;
      try {
        const entries = fs.readdirSync(baseDir, { withFileTypes: true });
        for (const ent of entries) {
          if (ent.isDirectory() && !activeIds.has(ent.name)) {
            const dirPath = path.join(baseDir, ent.name);
            const size = getDirectorySize(dirPath);
            try {
              fs.rmSync(dirPath, { recursive: true, force: true });
              freedBytes += size;
            } catch {}
          }
        }
      } catch {}
    }

    return {
      freedBytes,
      formattedFreedBytes: formatBytes(freedBytes),
      message: `Cleaned up orphaned storage files (${formatBytes(freedBytes)} freed)`,
    };
  }
}

export const projectLibraryService = new ProjectLibraryService();
