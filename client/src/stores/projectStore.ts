// ============================================================
// Project Store — Manages Projects and Active Project State
// ============================================================

import { create } from 'zustand';
import { api } from '../services/api.js';
import type { Project, Video } from '@shared/types.js';

interface ProjectStore {
  projects: Project[];
  currentProject: (Project & { video?: Video; highlightCount?: number; shortsCount?: number }) | null;
  loading: boolean;
  uploading: boolean;
  uploadProgress: number;
  error: string | null;
  activeView: 'dashboard' | 'project' | 'settings' | 'voiceover' | 'movieExplanation' | 'movieAnalyzer' | 'projectLibrary';
  activeTab: 'highlights' | 'shorts' | 'transcript' | 'processing' | 'copyright';

  loadProjects: () => Promise<void>;
  createProject: (name: string) => Promise<Project>;
  selectProject: (id: string) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  uploadVideo: (projectId: string, file: File) => Promise<void>;
  setActiveView: (view: 'dashboard' | 'project' | 'settings' | 'voiceover' | 'movieExplanation' | 'movieAnalyzer' | 'projectLibrary') => void;
  setActiveTab: (tab: 'highlights' | 'shorts' | 'transcript' | 'processing' | 'copyright') => void;
  setError: (error: string | null) => void;
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [],
  currentProject: null,
  loading: false,
  uploading: false,
  uploadProgress: 0,
  error: null,
  activeView: 'dashboard',
  activeTab: 'highlights',

  loadProjects: async () => {
    set({ loading: true, error: null });
    try {
      const projects = await api.getProjects();
      set({ projects, loading: false });
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  createProject: async (name: string) => {
    set({ loading: true, error: null });
    try {
      const project = await api.createProject(name);
      set((s) => ({
        projects: [project, ...s.projects],
        currentProject: project,
        loading: false,
        activeView: 'project',
        activeTab: 'highlights',
      }));
      return project;
    } catch (err: any) {
      set({ error: err.message, loading: false });
      throw err;
    }
  },

  selectProject: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const project = await api.getProject(id);
      set({
        currentProject: project,
        loading: false,
        activeView: 'project',
      });
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  deleteProject: async (id: string) => {
    try {
      await api.deleteProject(id);
      set((s) => ({
        projects: s.projects.filter((p) => p.id !== id),
        currentProject: s.currentProject?.id === id ? null : s.currentProject,
        activeView: s.currentProject?.id === id ? 'dashboard' : s.activeView,
      }));
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  uploadVideo: async (projectId: string, file: File) => {
    set({ uploading: true, uploadProgress: 0, error: null });
    try {
      const video = await api.uploadVideo(projectId, file, (percent) => {
        set({ uploadProgress: percent });
      });

      const current = get().currentProject;
      if (current && current.id === projectId) {
        set({
          currentProject: {
            ...current,
            status: 'uploaded',
            video,
          },
          uploading: false,
          uploadProgress: 100,
        });
      }

      // Also refresh project in list
      get().loadProjects();
    } catch (err: any) {
      set({ uploading: false, uploadProgress: 0, error: err.message });
      throw err;
    }
  },

  setActiveView: (activeView) => set({ activeView }),
  setActiveTab: (activeTab) => set({ activeTab }),
  setError: (error) => set({ error }),
}));
