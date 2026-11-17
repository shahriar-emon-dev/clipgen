// ============================================================
// Project Library Store — Central Project & Storage State Management
// ============================================================

import { create } from 'zustand';
import { api } from '../services/api.js';
import type {
  ProjectLibraryOverview,
  ProjectLibraryItem,
  ProjectLibraryCategory,
  ProjectLibraryAssetType,
  ProjectLibraryBulkDeleteRequest,
  ProjectLibraryDeleteAllRequest,
} from '@shared/types.js';

interface ProjectLibraryStore {
  overview: ProjectLibraryOverview | null;
  loading: boolean;
  error: string | null;
  selectedCategory: ProjectLibraryCategory | 'all';
  searchQuery: string;
  selectedItemKeys: string[];
  viewMode: 'active' | 'trash';
  actionInProgress: boolean;
  actionMessage: string | null;

  // Actions
  loadOverview: () => Promise<void>;
  setSelectedCategory: (category: ProjectLibraryCategory | 'all') => void;
  setSearchQuery: (query: string) => void;
  setViewMode: (mode: 'active' | 'trash') => void;
  toggleItemSelection: (key: string) => void;
  selectAllItems: (keys: string[]) => void;
  clearSelection: () => void;
  deleteProject: (category: ProjectLibraryCategory, projectId: string, permanent?: boolean) => Promise<boolean>;
  restoreProject: (category: ProjectLibraryCategory, projectId: string) => Promise<boolean>;
  deleteAsset: (category: ProjectLibraryCategory, projectId: string, assetType: ProjectLibraryAssetType) => Promise<boolean>;
  bulkDeleteSelected: (permanent?: boolean) => Promise<boolean>;
  deleteAllProjects: (confirmPhrase: string, scope?: 'all' | 'trash_only' | 'assets_only') => Promise<boolean>;
  cleanupOrphans: () => Promise<boolean>;
}

export const useProjectLibraryStore = create<ProjectLibraryStore>((set, get) => ({
  overview: null,
  loading: false,
  error: null,
  selectedCategory: 'all',
  searchQuery: '',
  selectedItemKeys: [],
  viewMode: 'active',
  actionInProgress: false,
  actionMessage: null,

  loadOverview: async () => {
    set({ loading: true, error: null });
    try {
      const res: any = await api.getProjectLibraryOverview();
      const overviewData: ProjectLibraryOverview | null =
        res && Array.isArray(res.projects)
          ? res
          : (res?.data && Array.isArray(res.data.projects) ? res.data : null);

      if (overviewData) {
        set({ overview: overviewData, loading: false });
      } else {
        set({ error: 'Failed to retrieve project library data', loading: false });
      }
    } catch (err: any) {
      set({ error: err.message || 'Failed to connect to library service', loading: false });
    }
  },

  setSelectedCategory: (category) => set({ selectedCategory: category, selectedItemKeys: [] }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setViewMode: (mode) => set({ viewMode: mode, selectedItemKeys: [] }),

  toggleItemSelection: (key) => {
    const current = get().selectedItemKeys;
    if (current.includes(key)) {
      set({ selectedItemKeys: current.filter((k) => k !== key) });
    } else {
      set({ selectedItemKeys: [...current, key] });
    }
  },

  selectAllItems: (keys) => {
    const current = get().selectedItemKeys;
    const allSelected = keys.every((k) => current.includes(k));
    if (allSelected) {
      set({ selectedItemKeys: current.filter((k) => !keys.includes(k)) });
    } else {
      const combined = Array.from(new Set([...current, ...keys]));
      set({ selectedItemKeys: combined });
    }
  },

  clearSelection: () => set({ selectedItemKeys: [] }),

  deleteProject: async (category, projectId, permanent = false) => {
    set({ actionInProgress: true, actionMessage: permanent ? 'Deleting project permanently...' : 'Moving project to trash...' });
    try {
      const res = await api.deleteProjectLibraryProject(category, projectId, permanent);
      if (res.success) {
        await get().loadOverview();
        set({
          actionInProgress: false,
          actionMessage: null,
          selectedItemKeys: get().selectedItemKeys.filter((k) => !k.includes(projectId)),
        });
        return true;
      }
      set({ actionInProgress: false, error: res.message || 'Failed to delete project' });
      return false;
    } catch (err: any) {
      set({ actionInProgress: false, error: err.message || 'Failed to delete project' });
      return false;
    }
  },

  restoreProject: async (category, projectId) => {
    set({ actionInProgress: true, actionMessage: 'Restoring project from trash...' });
    try {
      const res = await api.restoreProjectLibraryProject(category, projectId);
      if (res.success) {
        await get().loadOverview();
        set({
          actionInProgress: false,
          actionMessage: null,
          selectedItemKeys: get().selectedItemKeys.filter((k) => !k.includes(projectId)),
        });
        return true;
      }
      set({ actionInProgress: false, error: res.message || 'Failed to restore project' });
      return false;
    } catch (err: any) {
      set({ actionInProgress: false, error: err.message || 'Failed to restore project' });
      return false;
    }
  },

  deleteAsset: async (category, projectId, assetType) => {
    set({ actionInProgress: true, actionMessage: `Deleting ${assetType} asset...` });
    try {
      const res = await api.deleteProjectLibraryAsset(category, projectId, assetType);
      if (res.success) {
        await get().loadOverview();
        set({ actionInProgress: false, actionMessage: null });
        return true;
      }
      set({ actionInProgress: false, error: res.message || 'Failed to delete asset' });
      return false;
    } catch (err: any) {
      set({ actionInProgress: false, error: err.message || 'Failed to delete asset' });
      return false;
    }
  },

  bulkDeleteSelected: async (permanent = false) => {
    const keys = get().selectedItemKeys;
    if (keys.length === 0) return false;

    set({ actionInProgress: true, actionMessage: `Deleting ${keys.length} selected items...` });
    try {
      // Parse keys formatted as: "proj_{type}_{id}" or "asset_{type}_{id}_{assetType}"
      const items: ProjectLibraryBulkDeleteRequest['items'] = [];
      for (const k of keys) {
        const parts = k.split(':');
        if (parts[0] === 'proj') {
          items.push({
            type: parts[1] as ProjectLibraryCategory,
            projectId: parts[2],
          });
        } else if (parts[0] === 'asset') {
          items.push({
            type: parts[1] as ProjectLibraryCategory,
            projectId: parts[2],
            assetType: parts[3] as ProjectLibraryAssetType,
          });
        }
      }

      const res = await api.bulkDeleteProjectLibrary({ items, permanent });
      await get().loadOverview();
      set({ actionInProgress: false, actionMessage: null, selectedItemKeys: [] });
      return true;
    } catch (err: any) {
      set({ actionInProgress: false, error: err.message || 'Bulk deletion failed' });
      return false;
    }
  },

  deleteAllProjects: async (confirmPhrase, scope = 'all') => {
    set({ actionInProgress: true, actionMessage: 'Executing global cleanup...' });
    try {
      const res = await api.deleteAllProjectLibrary({ confirmPhrase, scope });
      if (res.success) {
        await get().loadOverview();
        set({ actionInProgress: false, actionMessage: null, selectedItemKeys: [] });
        return true;
      }
      set({ actionInProgress: false, error: res.message || 'Failed to delete all projects' });
      return false;
    } catch (err: any) {
      set({ actionInProgress: false, error: err.message || 'Global cleanup failed' });
      return false;
    }
  },

  cleanupOrphans: async () => {
    set({ actionInProgress: true, actionMessage: 'Cleaning orphaned storage directories...' });
    try {
      const res = await api.cleanupProjectLibraryOrphans();
      if (res.success) {
        await get().loadOverview();
        set({ actionInProgress: false, actionMessage: null });
        return true;
      }
      set({ actionInProgress: false, error: res.message || 'Orphan cleanup failed' });
      return false;
    } catch (err: any) {
      set({ actionInProgress: false, error: err.message || 'Orphan cleanup failed' });
      return false;
    }
  },
}));
