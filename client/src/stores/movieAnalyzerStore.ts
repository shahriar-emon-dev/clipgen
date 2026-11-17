// ============================================================
// Movie Analyzer Store — State Management for AI Movie Analyzer
// ============================================================

import { create } from 'zustand';
import { api } from '../services/api.js';
import { wsService } from '../services/websocket.js';
import type {
  MovieAnalyzerProject,
  MovieAnalyzerStage,
  MovieAnalyzerLanguage,
  MultilingualExplanationScript,
  MultilingualScriptParagraph,
  WSMessage,
} from '@shared/types.js';

interface MovieAnalyzerStore {
  projects: MovieAnalyzerProject[];
  project: MovieAnalyzerProject | null;
  activeStage: MovieAnalyzerStage;
  activeLanguageTab: MovieAnalyzerLanguage;
  loading: boolean;
  uploading: boolean;
  progressPercent: number;
  progressMessage: string;
  error: string | null;

  // Actions
  loadProjects: () => Promise<void>;
  createProject: (name?: string) => Promise<MovieAnalyzerProject>;
  selectProject: (projectId: string) => Promise<void>;
  refreshProject: () => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  setActiveStage: (stage: MovieAnalyzerStage) => void;
  setActiveLanguageTab: (lang: MovieAnalyzerLanguage) => void;
  setError: (err: string | null) => void;
  cancelOperation: () => Promise<void>;

  // Workflow actions
  uploadVideo: (file: File) => Promise<void>;
  uploadTranscript: (fileOrText: File | string, filename?: string) => Promise<void>;
  startAnalysis: () => Promise<void>;
  generateScripts: (targetMinutes?: number) => Promise<void>;
  generateSingleScript: (language: MovieAnalyzerLanguage, targetMinutes?: number) => Promise<void>;
  updateScriptParagraph: (paragraphId: string, text: string) => Promise<void>;
  updateScriptHook: (hookText: string, hookType?: string) => Promise<void>;
  downloadScript: (lang?: MovieAnalyzerLanguage) => Promise<void>;
  downloadSrt: (lang?: MovieAnalyzerLanguage) => Promise<void>;
  regenerateHook: (language?: MovieAnalyzerLanguage, hookType?: string) => Promise<void>;
  regenerateSection: (paragraphId: string, language?: MovieAnalyzerLanguage) => Promise<void>;
  approveScript: (language: MovieAnalyzerLanguage) => Promise<void>;
  selectLanguage: (lang: MovieAnalyzerLanguage) => Promise<void>;
  uploadVoiceover: (file?: File) => Promise<void>;
  matchScenes: (options?: { enableMovingScreenshots?: boolean; screenshotInterval?: number }) => Promise<void>;
  handoffToStudio: () => Promise<string>;
}

let wsUnsubscribe: (() => void) | null = null;

export const useMovieAnalyzerStore = create<MovieAnalyzerStore>((set, get) => ({
  projects: [],
  project: null,
  activeStage: 1,
  activeLanguageTab: 'english',
  loading: false,
  uploading: false,
  progressPercent: 0,
  progressMessage: '',
  error: null,

  loadProjects: async () => {
    try {
      set({ loading: true, error: null });
      const res = await api.getMovieAnalyzerProjects();
      const list = res.projects || [];
      set({ projects: list, loading: false });

      const current = get().project;
      if (!current || !list.some((p) => p.id === current.id)) {
        if (list.length > 0) {
          await get().selectProject(list[0].id);
        } else {
          await get().createProject('Movie Analyzer Project 1');
        }
      }
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  createProject: async (name?: string) => {
    try {
      set({ loading: true, error: null });
      const res = await api.createMovieAnalyzerProject(name);
      set((s) => ({
        projects: [res.project, ...s.projects.filter((p) => p.id !== res.project.id)],
        project: res.project,
        activeStage: 1,
        loading: false,
      }));
      await get().selectProject(res.project.id);
      return res.project;
    } catch (err: any) {
      set({ error: err.message, loading: false });
      throw err;
    }
  },

  selectProject: async (projectId: string) => {
    try {
      set({ loading: true, error: null });
      const res = await api.getMovieAnalyzerProject(projectId);

      // Connect WebSocket for real-time progress updates
      if (wsUnsubscribe) {
        wsUnsubscribe();
        wsUnsubscribe = null;
      }

      wsService.connect(projectId);
      wsUnsubscribe = wsService.subscribe((msg: WSMessage) => {
        if (msg.type === 'movie_analyzer_progress') {
          const payload = (msg as any).payload;
          if (payload && payload.projectId === projectId) {
            const isFinished = (payload.progress !== undefined && payload.progress >= 100) ||
                               payload.status === 'review' ||
                               payload.stage >= 4;

            set((s) => ({
              progressPercent: payload.progress !== undefined ? payload.progress : s.progressPercent,
              progressMessage: payload.detail || payload.stageName || s.progressMessage,
              loading: !isFinished && payload.status !== 'error' && (payload.progress !== undefined && payload.progress < 100),
              error: payload.status === 'error' ? (payload.detail || 'Analysis error occurred') : null,
              activeStage: isFinished && s.activeStage === 3 ? 4 : s.activeStage,
            }));

            if (isFinished) {
              get().refreshProject();
            }
          }
        }
      });

      const p = res.project;
      const allScriptsExist = Boolean(
        p.scripts?.english?.paragraphs?.length &&
        p.scripts?.hindi?.paragraphs?.length &&
        p.scripts?.bangla?.paragraphs?.length
      );
      // Auto-advance stage to 4 if scripts exist and stage hasn't passed 4
      const isScriptStageDone = allScriptsExist && (p.stage || 1) <= 3;
      const resolvedStage = isScriptStageDone ? 4 : (p.stage || 1);
      const resolvedStatus = isScriptStageDone && (p.status === 'analyzing' || p.status === 'scripting')
        ? 'review'
        : (p.status || 'setup');

      set({
        project: {
          ...p,
          stage: resolvedStage,
          status: resolvedStatus,
        },
        activeStage: resolvedStage,
        activeLanguageTab: p.scripts?.selectedLanguage || 'english',
        loading: false,
        progressPercent: allScriptsExist ? 100 : (p.analysis?.progress || 0),
        progressMessage: allScriptsExist
          ? 'All 3 scripts generated and verified'
          : (p.analysis?.statusMessage || ''),
        error: null,
      });
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  refreshProject: async () => {
    const { project } = get();
    if (!project) return;
    try {
      const res = await api.getMovieAnalyzerProject(project.id);
      const p = res.project;
      const allScriptsExist = Boolean(
        p.scripts?.english?.paragraphs?.length &&
        p.scripts?.hindi?.paragraphs?.length &&
        p.scripts?.bangla?.paragraphs?.length
      );
      const isScriptStageDone = allScriptsExist && (p.stage || 1) <= 3;
      const resolvedStage = isScriptStageDone ? 4 : (p.stage || get().activeStage);
      const resolvedStatus = isScriptStageDone && (p.status === 'analyzing' || p.status === 'scripting')
        ? 'review'
        : (p.status || 'setup');

      set({
        project: {
          ...p,
          stage: resolvedStage,
          status: resolvedStatus,
        },
        activeStage: resolvedStage,
        loading: false,
        progressPercent: allScriptsExist ? 100 : (p.analysis?.progress || 100),
      });
    } catch {}
  },

  deleteProject: async (projectId: string) => {
    try {
      set({ loading: true, error: null });
      await api.deleteMovieAnalyzerProject(projectId);
      set((s) => ({
        projects: s.projects.filter((p) => p.id !== projectId),
        project: s.project?.id === projectId ? null : s.project,
        loading: false,
      }));
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  setActiveStage: (stage: MovieAnalyzerStage) => {
    set({ activeStage: stage });
  },

  setActiveLanguageTab: (lang: MovieAnalyzerLanguage) => {
    set({ activeLanguageTab: lang });
  },

  setError: (error: string | null) => {
    set({ error });
  },

  cancelOperation: async () => {
    const { project } = get();
    if (!project) return;
    try {
      await api.cancelMovieAnalyzerOperation(project.id);
      set({
        loading: false,
        progressPercent: 0,
        progressMessage: 'Operation cancelled',
        error: null,
      });
      await get().refreshProject();
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  uploadVideo: async (file: File) => {
    let current = get().project;
    if (!current) {
      const projName = file.name.replace(/\.[^/.]+$/, '').trim() || 'New Movie Analyzer Project';
      current = await get().createProject(projName);
    }
    if (!current) return;
    try {
      set({ uploading: true, error: null });
      const res = await api.uploadMovieAnalyzerVideo(current.id, file);
      set({ project: res.project, uploading: false });
    } catch (err: any) {
      set({ error: err.message, uploading: false });
    }
  },

  uploadTranscript: async (fileOrText: File | string, filename?: string) => {
    let current = get().project;
    if (!current) {
      const defaultName = typeof fileOrText === 'string'
        ? 'New Movie Analyzer Project'
        : fileOrText.name.replace(/\.[^/.]+$/, '').trim() || 'New Movie Analyzer Project';
      current = await get().createProject(defaultName);
    }
    if (!current) return;
    try {
      set({ uploading: true, error: null });
      const res = await api.uploadMovieAnalyzerTranscript(current.id, fileOrText, filename);
      set({ project: res.project, uploading: false });
    } catch (err: any) {
      set({ error: err.message, uploading: false });
    }
  },

  startAnalysis: async () => {
    const { project } = get();
    if (!project) return;
    try {
      set({
        loading: true,
        progressPercent: 10,
        progressMessage: 'Initializing technical indexing & scene segmentation...',
        error: null,
      });
      const res = await api.startMovieAnalyzerAnalysis(project.id);
      set({
        project: res.project,
        activeStage: res.project.stage || 3,
        loading: false,
        progressPercent: 100,
        progressMessage: 'Full movie scene indexing completed!',
      });
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  generateScripts: async (targetMinutes: number = 9) => {
    const { project } = get();
    if (!project) return;
    try {
      set({
        loading: true,
        progressPercent: 15,
        progressMessage: 'Analyzing story arc & turning points from transcript...',
        error: null,
      });
      const res = await api.generateMovieAnalyzerScripts(project.id, targetMinutes);
      const allScriptsExist = Boolean(
        res.project.scripts?.english?.paragraphs?.length &&
        res.project.scripts?.hindi?.paragraphs?.length &&
        res.project.scripts?.bangla?.paragraphs?.length
      );
      set({
        project: res.project,
        activeStage: allScriptsExist ? 4 : (res.project.stage || 4),
        loading: false,
        progressPercent: 100,
        progressMessage: 'Generated 3 complete multilingual explanation scripts!',
        error: null,
      });
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  generateSingleScript: async (language: MovieAnalyzerLanguage, targetMinutes: number = 9) => {
    const { project } = get();
    if (!project) return;
    try {
      set({
        loading: true,
        progressPercent: 30,
        progressMessage: `Synthesizing ${language.toUpperCase()} explanation script...`,
        error: null,
      });
      const res = await api.generateMovieAnalyzerScripts(project.id, targetMinutes, language);
      const allScriptsExist = Boolean(
        res.project.scripts?.english?.paragraphs?.length &&
        res.project.scripts?.hindi?.paragraphs?.length &&
        res.project.scripts?.bangla?.paragraphs?.length
      );
      set({
        project: res.project,
        activeStage: allScriptsExist ? 4 : get().activeStage,
        loading: false,
        progressPercent: allScriptsExist ? 100 : 80,
        progressMessage: `Successfully synthesized ${language.toUpperCase()} script!`,
        error: null,
      });
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  updateScriptParagraph: async (paragraphId: string, text: string) => {
    const { project, activeLanguageTab } = get();
    if (!project) return;
    try {
      const res = await api.updateMovieAnalyzerScript(project.id, {
        language: activeLanguageTab,
        paragraphId,
        text,
      });
      set({ project: res.project });
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  updateScriptHook: async (hookText: string, hookType?: string) => {
    const { project, activeLanguageTab } = get();
    if (!project) return;
    try {
      const res = await api.updateMovieAnalyzerScript(project.id, {
        language: activeLanguageTab,
        hookText,
        hookType,
      });
      set({ project: res.project });
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  downloadScript: async (lang?: MovieAnalyzerLanguage) => {
    const { project, activeLanguageTab } = get();
    if (!project) return;
    const targetLang = lang || activeLanguageTab || 'english';
    try {
      await api.downloadMovieAnalyzerScript(project.id, targetLang, `${project.name || 'script'}_${targetLang}.txt`);
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  downloadSrt: async (lang?: MovieAnalyzerLanguage) => {
    const { project, activeLanguageTab } = get();
    if (!project) return;
    const targetLang = lang || activeLanguageTab || 'english';
    try {
      await api.downloadMovieAnalyzerSrt(project.id, targetLang, `${project.name || 'script'}_${targetLang}.srt`);
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  regenerateHook: async (language?: MovieAnalyzerLanguage, hookType?: string) => {
    const { project, activeLanguageTab } = get();
    if (!project) return;
    const targetLang = language || activeLanguageTab || 'english';
    try {
      set({ loading: true, error: null });
      const res = await api.regenerateMovieAnalyzerHook(project.id, targetLang, hookType);
      set({ project: res.project, loading: false });
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  regenerateSection: async (paragraphId: string, language?: MovieAnalyzerLanguage) => {
    const { project, activeLanguageTab } = get();
    if (!project) return;
    const targetLang = language || activeLanguageTab || 'english';
    try {
      set({ loading: true, error: null });
      const res = await api.regenerateMovieAnalyzerSection(project.id, targetLang, paragraphId);
      set({ project: res.project, loading: false });
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  approveScript: async (language: MovieAnalyzerLanguage) => {
    const { project } = get();
    if (!project) return;
    try {
      set({ loading: true, error: null });
      const res = await api.approveMovieAnalyzerScript(project.id, language);
      set({
        project: res.project,
        activeStage: 5, // Unlocks and advances to Stage 5: Voiceover
        loading: false,
      });
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  selectLanguage: async (lang: MovieAnalyzerLanguage) => {
    const { project } = get();
    if (!project) return;
    try {
      set({ loading: true, error: null });
      const res = await api.selectMovieAnalyzerLanguage(project.id, lang);
      set({
        project: res.project,
        activeLanguageTab: lang,
        loading: false,
      });
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  uploadVoiceover: async (file?: File) => {
    const { project } = get();
    if (!project) return;
    try {
      set({ uploading: true, error: null });
      const res = await api.uploadMovieAnalyzerVoiceover(project.id, file);
      set({
        project: res.project,
        activeStage: res.project.stage || 6,
        uploading: false,
      });
    } catch (err: any) {
      set({ error: err.message, uploading: false });
    }
  },

  matchScenes: async (options) => {
    const { project } = get();
    if (!project) return;
    try {
      set({ loading: true, progressPercent: 30, progressMessage: 'Matching scenes across full movie with <=3.0s cut rule...', error: null });
      const res = await api.matchMovieAnalyzerScenes(project.id, options);
      set({
        project: res.project,
        activeStage: res.project.stage,
        loading: false,
        progressPercent: 100,
        progressMessage: 'Scenes matched successfully!',
      });
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  handoffToStudio: async () => {
    const { project } = get();
    if (!project) throw new Error('No active project');
    try {
      set({ loading: true, error: null });
      const res = await api.handoffMovieAnalyzer(project.id);
      set({ project: res.project, loading: false });
      return res.movieExplanationProjectId;
    } catch (err: any) {
      set({ error: err.message, loading: false });
      throw err;
    }
  },
}));
