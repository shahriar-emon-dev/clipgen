// ============================================================
// Project Library API Routes
// Exposes central project overview, asset deletion, bulk deletion,
// trash restore, protected DELETE ALL, and storage orphan cleanup.
// ============================================================

import { Router, Request, Response } from 'express';
import { projectLibraryService } from '../services/projectLibrary/ProjectLibraryService.js';
import type {
  ProjectLibraryCategory,
  ProjectLibraryAssetType,
  ProjectLibraryBulkDeleteRequest,
  ProjectLibraryDeleteAllRequest,
} from '../../../shared/types.js';

export const projectLibraryRouter = Router();

/**
 * GET /api/project-library/overview
 * Returns unified project list, assets, disk storage summary, and trash items.
 */
projectLibraryRouter.get('/overview', (_req: Request, res: Response) => {
  try {
    const overview = projectLibraryService.getOverview();
    return res.json({ success: true, data: overview });
  } catch (error: any) {
    console.error('[ProjectLibrary] Failed to get overview:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to retrieve project library overview' });
  }
});

/**
 * DELETE /api/project-library/projects/:type/:id
 * Deletes a project. If ?permanent=true, permanently deletes files.
 * Otherwise, soft-deletes (moves to trash).
 */
projectLibraryRouter.delete('/projects/:type/:id', (req: Request, res: Response) => {
  try {
    const category = req.params.type as ProjectLibraryCategory;
    const projectId = String(req.params.id);
    const permanent = req.query.permanent === 'true';

    const result = projectLibraryService.deleteProject(category, projectId, permanent);
    if (!result.success) {
      return res.status(404).json(result);
    }
    return res.json(result);
  } catch (error: any) {
    console.error('[ProjectLibrary] Failed to delete project:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to delete project' });
  }
});

/**
 * POST /api/project-library/projects/:type/:id/restore
 * Restores a trashed project back to active state.
 */
projectLibraryRouter.post('/projects/:type/:id/restore', (req: Request, res: Response) => {
  try {
    const category = req.params.type as ProjectLibraryCategory;
    const projectId = String(req.params.id);

    const success = projectLibraryService.restoreProject(category, projectId);
    if (!success) {
      return res.status(404).json({ success: false, message: 'Project not found or not in trash' });
    }
    return res.json({ success: true, message: 'Project restored successfully' });
  } catch (error: any) {
    console.error('[ProjectLibrary] Failed to restore project:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to restore project' });
  }
});

/**
 * DELETE /api/project-library/assets/:type/:id/:assetType
 * Deletes an individual asset (video, transcript, script, audio, render)
 * without deleting the parent project.
 */
projectLibraryRouter.delete('/assets/:type/:id/:assetType', (req: Request, res: Response) => {
  try {
    const category = req.params.type as ProjectLibraryCategory;
    const projectId = String(req.params.id);
    const assetType = req.params.assetType as ProjectLibraryAssetType;

    const result = projectLibraryService.deleteIndividualAsset(category, projectId, assetType);
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.json(result);
  } catch (error: any) {
    console.error('[ProjectLibrary] Failed to delete asset:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to delete asset' });
  }
});

/**
 * POST /api/project-library/bulk-delete
 * Bulk deletes selected projects or selected individual assets.
 */
projectLibraryRouter.post('/bulk-delete', (req: Request, res: Response) => {
  try {
    const body = req.body as ProjectLibraryBulkDeleteRequest;
    if (!body || !body.items || body.items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No projects or assets specified for bulk deletion',
      });
    }

    const result = projectLibraryService.bulkDelete(body);
    return res.json(result);
  } catch (error: any) {
    console.error('[ProjectLibrary] Failed bulk deletion:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed bulk deletion' });
  }
});

/**
 * POST /api/project-library/delete-all
 * Protected global wipe of all projects, trash, or assets.
 * Requires confirmPhrase === 'DELETE ALL'.
 */
projectLibraryRouter.post('/delete-all', (req: Request, res: Response) => {
  try {
    const body = req.body as ProjectLibraryDeleteAllRequest;
    if (!body || body.confirmPhrase !== 'DELETE ALL') {
      return res.status(400).json({
        success: false,
        error: 'Confirmation phrase must match "DELETE ALL" exactly.',
      });
    }

    const result = projectLibraryService.deleteAllProjects(body);
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.json(result);
  } catch (error: any) {
    console.error('[ProjectLibrary] Failed delete all:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to delete all projects' });
  }
});

/**
 * POST /api/project-library/cleanup-orphans
 * Cleans up untracked or orphaned directories left behind in storage.
 */
projectLibraryRouter.post('/cleanup-orphans', (_req: Request, res: Response) => {
  try {
    const result = projectLibraryService.cleanupOrphans();
    return res.json({ success: true, ...result });
  } catch (error: any) {
    console.error('[ProjectLibrary] Failed to cleanup orphans:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to cleanup orphan files' });
  }
});
