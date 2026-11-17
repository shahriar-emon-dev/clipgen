// ============================================================
// Movie Explanation Store — Zustand State Management
// Manages project lifecycle, deep source indexing, script alignment,
// multi-track AI timeline, manual review tools, and master render.
// ============================================================

import { create } from 'zustand';
import { api } from '../services/api.js';
import type {
  MovieExplanationProjectState,
  VoiceoverOutputAspectRatio,
  MovieTimelineShot,
  EpisodeIntelligenceIndex,
  ExplanationScript,
  MovieExplanationTimeline,
  MovieExplanationQualityReport,
  WSMovieExplanationProgress,
  OpeningVerificationReport,
  MovieExplanationClipAsset,
  PreExportRightsReview,
  ShotAlignmentMode,
  AssetRightsMetadata,
  ScriptReviewReport,
  ExportManifest,
  CaptionStyleSettings,
  TimelineCaptionItem,
  TimelineTextOverlay,
  MovieScreenshotMotionEffect,
} from '@shared/types.js';

interface MovieExplanationState {
  projects: MovieExplanationProjectState[];
  project: MovieExplanationProjectState | null;
  activeProjectId: string | null;
  activeTab: 'setup' | 'storyMap' | 'timeline' | 'review';
  aspectRatio: VoiceoverOutputAspectRatio;
  selectedShotId: string | null;
  selectedAlternativeShotId: string | null;
  alternativesList: any[];
  isWhyModalOpen: boolean;
  isAlternativesModalOpen: boolean;
  isQualityModalOpen: boolean;
  isLoading: boolean;
  isUploadingVideo: boolean;
  isUploadingAudio: boolean;
  isUploadingScript: boolean;
  isUploadingOriginalTranscript: boolean;
  isIndexing: boolean;
  isAligning: boolean;
  isGenerating: boolean;
  isRendering: boolean;
  renderProgress: number;
  renderStage: string;
  renderDetail: string;
  currentTime: number;
  isPlaying: boolean;
  error: string | null;

  openingReport: OpeningVerificationReport | null;
  isLoadingOpeningReport: boolean;
  isGeneratingOpeningPreview: boolean;

  exportStatus?: 'none' | 'up_to_date' | 'outdated' | 'rendering' | 'failed';
  analysisJob: any | null;

  // Rights & replacement visual assets
  replacementAssets: MovieExplanationClipAsset[];
  rightsReview: PreExportRightsReview | null;
  isLoadingRightsReview: boolean;
  isUploadingVisual: boolean;

  // Script Review & Manifest
  scriptReview: ScriptReviewReport | null;
  isLoadingScriptReview: boolean;
  exportManifest: ExportManifest | null;
  isLoadingManifest: boolean;

  // Actions
  loadProjects: () => Promise<void>;
  loadProject: (projectId: string) => Promise<void>;
  selectProject: (projectId: string) => Promise<void>;
  fetchAnalysisJob: (projectId: string) => Promise<any | null>;
  cancelIndexing: () => Promise<void>;
  createProject: (name?: string) => Promise<string>;
  deleteProject: (projectId: string) => Promise<void>;
  uploadVideo: (file: File) => Promise<void>;
  uploadVoiceover: (file: File) => Promise<void>;
  uploadScript: (fileOrText: File | string) => Promise<void>;
  uploadOriginalTranscript: (fileOrText: File | string) => Promise<void>;
  startIndexing: () => Promise<void>;
  startAligning: () => Promise<void>;
  generateTimeline: () => Promise<void>;
  regenerateTimeline: () => Promise<void>;
  runFullProductionPipeline: (options?: { autoRender?: boolean }) => Promise<void>;
  toggleShotLock: (shotId: string) => Promise<void>;
  openAlternativesModal: (shotId: string) => Promise<void>;
  replaceShot: (shotId: string, newSceneId: string) => Promise<void>;
  acceptShotMatch: (shotId: string) => Promise<void>;
  acceptAllScreenshots: () => Promise<void>;
  acceptAllMatches: () => Promise<void>;
  convertUnmatchedToScreenshots: () => Promise<void>;
  autoReviewAndApprove: () => Promise<void>;
  convertShotToScreenshot: (shotId: string, motionEffect?: MovieScreenshotMotionEffect) => Promise<void>;
  recheckSegment: (segmentId: string) => Promise<void>;
  revalidateTimeline: () => Promise<void>;
  replaceShotWithAsset: (
    shotId: string,
    assetId: string,
    alignmentMode?: ShotAlignmentMode,
    assetStartOffset?: number
  ) => Promise<void>;
  updateShotRights: (shotId: string, rights: Partial<AssetRightsMetadata>) => Promise<void>;
  loadReplacementAssets: () => Promise<void>;
  uploadReplacementVisual: (file: File, metadata?: any) => Promise<MovieExplanationClipAsset | null>;
  fetchRightsReview: () => Promise<void>;
  acknowledgeRightsWarnings: () => Promise<void>;
  fetchScriptReview: () => Promise<void>;
  updateScriptSegment: (segmentId: string, text: string) => Promise<void>;
  fetchExportManifest: () => Promise<void>;
  trimShot: (shotId: string, sourceStart: number, sourceEnd: number) => Promise<void>;
  startRender: (options?: {
    acknowledgeRightsWarnings?: boolean;
    autoResolveUnmatched?: boolean;
    resolution?: string;
    frameRate?: number;
    qualityPreset?: string;
    burnCaptions?: boolean;
  }) => Promise<void>;
  cancelRender: () => Promise<void>;
  autoResolveUnmatched: () => Promise<void>;
  enforceScreenshotCadence: () => Promise<void>;
  autoVaryRepeatedScenes: () => Promise<void>;
  fetchOpeningReport: () => Promise<void>;
  generateOpeningPreview: (duration?: number) => Promise<void>;
  updateSettings: (settings: any) => Promise<void>;

  // Professional Multi-Track Video Editor Actions
  splitShot: (shotId: string, splitTimestamp: number) => Promise<void>;
  splitShotAtPlayhead: () => Promise<void>;
  reorderShots: (shotIds: string[]) => Promise<void>;
  updateShotTransform: (shotId: string, data: any) => Promise<void>;
  batchUpdateShots: (updates: any, shotIds?: string[], all?: boolean) => Promise<void>;
  duplicateShot: (shotId: string) => Promise<void>;
  deleteShot: (shotId: string) => Promise<void>;
  updateTimelineState: (data: any) => Promise<void>;
  generateCaptions: () => Promise<void>;
  autoGenerateCaptions: () => Promise<void>;
  updateCaptions: (captions: any[]) => Promise<void>;
  addTextOverlay: (overlay: Partial<TimelineTextOverlay>) => Promise<void>;
  updateTextOverlay: (id: string, updates: Partial<TimelineTextOverlay>) => Promise<void>;
  deleteTextOverlay: (id: string) => Promise<void>;
  replaceShotScene: (shotId: string, sceneId: string) => Promise<void>;
  addSceneToTimeline: (sceneId: string, insertAfterShotId?: string, duration?: number) => Promise<void>;
  undo: () => void;
  redo: () => void;

  // Multi-track timeline state
  timelineZoom: number;
  inPoint: number | null;
  outPoint: number | null;
  playbackSpeed: number;
  previewVolume: number;
  isMuted: boolean;
  previewMode: 'full' | 'clip' | 'range';
  selectedTextOverlayId: string | null;
  selectedCaptionId: string | null;
  captionsVisible: boolean;
  setCaptionsVisible: (visible: boolean) => void;
  toggleCaptionsVisible: () => void;
  updateCaptionStyle: (style: Partial<CaptionStyleSettings>) => Promise<void>;
  applyCaptionPreset: (presetName: string) => Promise<void>;
  updateCaption: (captionId: string, updates: Partial<TimelineCaptionItem>) => Promise<void>;
  splitCaption: (captionId: string, splitTime?: number) => Promise<void>;
  mergeCaptions: (captionId1: string, captionId2: string) => Promise<void>;
  deleteCaption: (captionId: string) => Promise<void>;
  canUndo: boolean;
  canRedo: boolean;
  pastTimelines: MovieExplanationTimeline[];
  futureTimelines: MovieExplanationTimeline[];

  // UI state mutators & transport
  seekTo: (time: number) => void;
  togglePlay: () => void;
  clearInOutPoints: () => void;
  setTimelineZoom: (zoom: number) => void;
  setInPoint: (time: number | null) => void;
  setOutPoint: (time: number | null) => void;
  setPlaybackSpeed: (speed: number) => void;
  setPreviewVolume: (vol: number) => void;
  setIsMuted: (muted: boolean) => void;
  setPreviewMode: (mode: 'full' | 'clip' | 'range') => void;
  setSelectedTextOverlayId: (id: string | null) => void;
  setSelectedCaptionId: (id: string | null) => void;
  setActiveTab: (tab: 'setup' | 'storyMap' | 'timeline' | 'review') => void;
  setAspectRatio: (ratio: VoiceoverOutputAspectRatio) => void;
  setSelectedShotId: (shotId: string | null) => void;
  setIsWhyModalOpen: (open: boolean) => void;
  setIsAlternativesModalOpen: (open: boolean) => void;
  setIsQualityModalOpen: (open: boolean) => void;
  setCurrentTime: (time: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setError: (err: string | null) => void;
  listenToProgress: (projectId: string) => () => void;
}

const pastTimelines: MovieExplanationTimeline[] = [];
const futureTimelines: MovieExplanationTimeline[] = [];

function pushHistory(tl: MovieExplanationTimeline) {
  pastTimelines.push(JSON.parse(JSON.stringify(tl)));
  if (pastTimelines.length > 30) pastTimelines.shift();
  futureTimelines.length = 0;
}

export const CAPTION_PRESETS: Record<string, CaptionStyleSettings> = {
  minimal_bottom: {
    preset: 'minimal_bottom',
    fontSize: 14,
    fontFamily: 'Inter, system-ui, sans-serif',
    fontWeight: 600,
    fontColor: '#ffffff',
    backgroundColor: 'transparent',
    backgroundOpacity: 0,
    outlineThickness: 2,
    outlineColor: 'rgba(0,0,0,0.9)',
    shadow: true,
    shadowColor: 'rgba(0,0,0,0.95)',
    align: 'center',
    positionY: 90,
    bottomMargin: 24,
    maxWidth: 75,
    lineSpacing: 1.3,
    letterSpacing: 0.2,
    animation: 'none',
  },
  clean_white: {
    preset: 'clean_white',
    fontSize: 15,
    fontFamily: 'Inter, system-ui, sans-serif',
    fontWeight: 600,
    fontColor: '#ffffff',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    backgroundOpacity: 0.65,
    outlineThickness: 1,
    outlineColor: 'rgba(255,255,255,0.15)',
    shadow: true,
    shadowColor: 'rgba(0,0,0,0.8)',
    align: 'center',
    positionY: 89,
    bottomMargin: 26,
    maxWidth: 75,
    lineSpacing: 1.3,
    letterSpacing: 0.2,
    animation: 'none',
  },
  cinematic: {
    preset: 'cinematic',
    fontSize: 14,
    fontFamily: 'Georgia, serif',
    fontWeight: 600,
    fontColor: '#fef08a',
    backgroundColor: 'rgba(0,0,0,0.5)',
    backgroundOpacity: 0.5,
    outlineThickness: 2,
    outlineColor: 'rgba(0,0,0,0.9)',
    shadow: true,
    shadowColor: 'rgba(0,0,0,0.9)',
    align: 'center',
    positionY: 88,
    bottomMargin: 28,
    maxWidth: 70,
    lineSpacing: 1.4,
    letterSpacing: 1.0,
    animation: 'fade',
  },
  typewriter: {
    preset: 'typewriter',
    fontSize: 15,
    fontFamily: 'Consolas, monospace',
    fontWeight: 700,
    fontColor: '#38bdf8',
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    backgroundOpacity: 0.85,
    outlineThickness: 1,
    outlineColor: 'rgba(56, 189, 248, 0.4)',
    shadow: true,
    shadowColor: 'rgba(0,0,0,0.9)',
    align: 'center',
    positionY: 89,
    bottomMargin: 24,
    maxWidth: 75,
    lineSpacing: 1.3,
    letterSpacing: 0.5,
    animation: 'typewriter',
  },
  word_highlight: {
    preset: 'word_highlight',
    fontSize: 15,
    fontFamily: 'Inter, system-ui, sans-serif',
    fontWeight: 700,
    fontColor: '#ffffff',
    backgroundColor: 'rgba(0,0,0,0.7)',
    backgroundOpacity: 0.7,
    outlineThickness: 2,
    outlineColor: 'rgba(0,0,0,0.9)',
    shadow: true,
    shadowColor: 'rgba(0,0,0,0.9)',
    align: 'center',
    positionY: 89,
    bottomMargin: 24,
    maxWidth: 75,
    lineSpacing: 1.3,
    letterSpacing: 0.2,
    animation: 'word_by_word',
    highlightColor: '#facc15',
  },
  karaoke: {
    preset: 'karaoke',
    fontSize: 16,
    fontFamily: 'Inter, system-ui, sans-serif',
    fontWeight: 800,
    fontColor: '#ffffff',
    backgroundColor: 'rgba(0,0,0,0.75)',
    backgroundOpacity: 0.75,
    outlineThickness: 2,
    outlineColor: '#000000',
    shadow: true,
    shadowColor: 'rgba(0,0,0,0.9)',
    align: 'center',
    positionY: 88,
    bottomMargin: 26,
    maxWidth: 75,
    lineSpacing: 1.3,
    letterSpacing: 0.2,
    animation: 'karaoke',
    highlightColor: '#a855f7',
  },
  bold_emphasis: {
    preset: 'bold_emphasis',
    fontSize: 17,
    fontFamily: 'Impact, Arial Black, sans-serif',
    fontWeight: 900,
    fontColor: '#facc15',
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    backgroundOpacity: 0.85,
    outlineThickness: 3,
    outlineColor: '#000000',
    shadow: true,
    shadowColor: 'rgba(0,0,0,0.95)',
    align: 'center',
    positionY: 88,
    bottomMargin: 26,
    maxWidth: 80,
    lineSpacing: 1.25,
    letterSpacing: 0.5,
    animation: 'none',
  },
  compact_two_line: {
    preset: 'compact_two_line',
    fontSize: 13,
    fontFamily: 'Inter, system-ui, sans-serif',
    fontWeight: 600,
    fontColor: '#f1f5f9',
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    backgroundOpacity: 0.75,
    outlineThickness: 1,
    outlineColor: 'rgba(0,0,0,0.8)',
    shadow: true,
    shadowColor: 'rgba(0,0,0,0.9)',
    align: 'center',
    positionY: 91,
    bottomMargin: 18,
    maxWidth: 62,
    lineSpacing: 1.2,
    letterSpacing: 0.1,
    animation: 'none',
  },
};

export const useMovieExplanationStore = create<MovieExplanationState>((set, get) => ({
  projects: [],
  project: null,
  activeProjectId: null,
  activeTab: 'setup',
  aspectRatio: '16:9',
  selectedShotId: null,
  selectedAlternativeShotId: null,
  alternativesList: [],
  isWhyModalOpen: false,
  isAlternativesModalOpen: false,
  isQualityModalOpen: false,
  isLoading: false,
  isUploadingVideo: false,
  isUploadingAudio: false,
  isUploadingScript: false,
  isUploadingOriginalTranscript: false,
  isIndexing: false,
  isAligning: false,
  openingReport: null,
  isLoadingOpeningReport: false,
  isGeneratingOpeningPreview: false,
  isGenerating: false,
  isRendering: false,
  renderProgress: 0,
  renderStage: 'idle',
  renderDetail: '',
  currentTime: 0,
  isPlaying: false,
  error: null,
  analysisJob: null,
  replacementAssets: [],
  rightsReview: null,
  isLoadingRightsReview: false,
  isUploadingVisual: false,
  scriptReview: null,
  isLoadingScriptReview: false,
  exportManifest: null,
  isLoadingManifest: false,

  // Multi-track video editor state
  timelineZoom: 1.0,
  inPoint: null,
  outPoint: null,
  playbackSpeed: 1.0,
  previewVolume: 1.0,
  isMuted: false,
  previewMode: 'full',
  selectedTextOverlayId: null,
  selectedCaptionId: null,
  captionsVisible: true,
  canUndo: false,
  canRedo: false,
  pastTimelines: [],
  futureTimelines: [],

  loadProjects: async () => {
    try {
      set({ isLoading: true, error: null });
      const { projects } = await api.getMovieExplanationProjects();
      set({ projects, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },

  loadProject: async (projectId: string) => {
    try {
      set({ isLoading: true, activeProjectId: projectId, error: null });
      const { project } = await api.getMovieExplanationProject(projectId);
      
      let jobState = null;
      try {
        const jobRes = await api.getMovieExplanationAnalysisJob(projectId);
        jobState = jobRes.job;
      } catch {}

      const isRunning = jobState?.status === 'running';

      set((state) => ({
        project,
        activeProjectId: projectId,
        analysisJob: jobState,
        replacementAssets: project.replacementAssets || [],
        isIndexing: isRunning || project.status === 'indexing_episode',
        renderProgress: isRunning ? (jobState?.overallProgress ?? 0) : (project.renderProgress || 0),
        renderStage: isRunning ? (jobState?.currentStage || 'indexing_episode') : (project.renderStage || 'idle'),
        renderDetail: isRunning ? (jobState?.stageDetail || '') : (project.renderDetail || ''),
        isLoading: false,
        projects: state.projects.some((p) => p.projectId === projectId)
          ? state.projects.map((p) => (p.projectId === projectId ? project : p))
          : [project, ...state.projects],
      }));

      if (project.timeline) {
        get().fetchRightsReview();
        get().loadReplacementAssets();
      }
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },

  selectProject: async (projectId: string) => {
    return get().loadProject(projectId);
  },

  fetchAnalysisJob: async (projectId: string) => {
    try {
      const res = await api.getMovieExplanationAnalysisJob(projectId);
      if (res.job) {
        const job = res.job;
        set((state) => ({
          analysisJob: job,
          isIndexing: job.status === 'running',
          renderProgress: job.status === 'running' ? job.overallProgress : state.renderProgress,
          renderStage: job.status === 'running' ? job.currentStage : state.renderStage,
          renderDetail: job.status === 'running' ? (job.stageDetail || '') : state.renderDetail,
        }));
      }
      return res.job;
    } catch {
      return null;
    }
  },

  cancelIndexing: async () => {
    const { activeProjectId } = get();
    if (!activeProjectId) return;
    try {
      await api.cancelMovieExplanationAnalysis(activeProjectId);
      set({ isIndexing: false, renderDetail: 'Analysis cancelled by user.' });
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  createProject: async (name?: string) => {
    try {
      set({ isLoading: true, error: null });
      const { project } = await api.createMovieExplanationProject(name);
      set((state) => ({
        projects: [project, ...state.projects.filter((p) => p.projectId !== project.projectId)],
        project,
        activeProjectId: project.projectId,
        activeTab: 'setup',
        renderProgress: 0,
        renderStage: 'idle',
        renderDetail: '',
        isLoading: false,
      }));
      return project.projectId;
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
      throw err;
    }
  },

  deleteProject: async (projectId: string) => {
    try {
      set({ isLoading: true, error: null });
      await api.deleteMovieExplanationProject(projectId);
      const { projects } = await api.getMovieExplanationProjects();
      const remaining = projects.filter((p) => p.projectId !== projectId);

      if (remaining.length > 0) {
        // Automatically switch to the next available project
        const nextId = remaining[0].projectId;
        const { project: nextProject } = await api.getMovieExplanationProject(nextId);
        set({
          projects: remaining,
          activeProjectId: nextId,
          project: nextProject,
          activeTab: 'setup',
          renderProgress: nextProject.renderProgress || 0,
          renderStage: nextProject.renderStage || 'idle',
          renderDetail: nextProject.renderDetail || '',
          isLoading: false,
        });
      } else {
        // No remaining projects: create a fresh clean project
        const { project: freshProject } = await api.createMovieExplanationProject('New Movie Explanation Project');
        set({
          projects: [freshProject],
          activeProjectId: freshProject.projectId,
          project: freshProject,
          activeTab: 'setup',
          renderProgress: 0,
          renderStage: 'idle',
          renderDetail: '',
          isLoading: false,
        });
      }
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },

  uploadVideo: async (file: File) => {
    const { activeProjectId } = get();
    if (!activeProjectId) return;
    try {
      set({ isUploadingVideo: true, error: null });
      const res = await api.uploadEpisodeVideo(activeProjectId, file);
      set((state) => ({
        project: state.project ? { ...state.project, originalVideo: res.originalVideo } : null,
        isUploadingVideo: false,
      }));
    } catch (err: any) {
      set({ error: err.message, isUploadingVideo: false });
    }
  },

  uploadVoiceover: async (file: File) => {
    const { activeProjectId } = get();
    if (!activeProjectId) return;
    try {
      set({ isUploadingAudio: true, error: null });
      const res = await api.uploadExplanationVoiceover(activeProjectId, file);
      set((state) => ({
        project: state.project ? { ...state.project, voiceoverAudio: res.voiceoverAudio } : null,
        isUploadingAudio: false,
      }));
    } catch (err: any) {
      set({ error: err.message, isUploadingAudio: false });
    }
  },

  uploadScript: async (fileOrText: File | string) => {
    const { activeProjectId } = get();
    if (!activeProjectId) return;
    try {
      set({ isUploadingScript: true, error: null });
      const res = await api.uploadExplanationScript(activeProjectId, fileOrText);
      set((state) => ({
        project: state.project ? { ...state.project, script: res.script } : null,
        isUploadingScript: false,
      }));
    } catch (err: any) {
      set({ error: err.message, isUploadingScript: false });
    }
  },

  uploadOriginalTranscript: async (fileOrText: File | string) => {
    const { activeProjectId } = get();
    if (!activeProjectId) return;
    try {
      set({ isUploadingOriginalTranscript: true, error: null });
      const res = await api.uploadOriginalTranscript(activeProjectId, fileOrText);
      set((state) => ({
        project: state.project ? { ...state.project, originalTranscript: res.originalTranscript } : null,
        isUploadingOriginalTranscript: false,
      }));
    } catch (err: any) {
      set({ error: err.message, isUploadingOriginalTranscript: false });
    }
  },

  startIndexing: async () => {
    const { activeProjectId } = get();
    if (!activeProjectId) return;
    try {
      set({ isIndexing: true, error: null, renderStage: 'indexing_episode', renderProgress: 5 });
      const res = await api.startIndexEpisode(activeProjectId);
      set((state) => ({
        project: state.project ? { ...state.project, episodeIndex: res.episodeIndex } : null,
        isIndexing: false,
      }));
    } catch (err: any) {
      set({ error: err.message, isIndexing: false });
    }
  },

  startAligning: async () => {
    const { activeProjectId } = get();
    if (!activeProjectId) return;
    try {
      set({ isAligning: true, error: null, renderStage: 'aligning_script', renderProgress: 10 });
      const res = await api.startAlignScript(activeProjectId);
      set((state) => ({
        project: state.project ? { ...state.project, script: res.script } : null,
        isAligning: false,
      }));
    } catch (err: any) {
      set({ error: err.message, isAligning: false });
    }
  },

  generateTimeline: async () => {
    const { activeProjectId, project, aspectRatio } = get();
    const pid = activeProjectId || project?.projectId;
    if (!pid) {
      set({ error: 'No active project selected. Please select or create a project first.' });
      return;
    }
    try {
      set({ isGenerating: true, error: null, renderStage: 'generating_timeline', renderProgress: 25 });
      const res = await api.generateMovieTimeline(pid, aspectRatio);
      const updatedProject = res.project || (project ? {
        ...project,
        timeline: res.timeline,
        qualityReport: res.qualityReport,
        status: 'timeline_ready',
        timelineRevision: res.timeline?.timelineRevision || ((project.timelineRevision || 1) + 1),
        exportStatus: 'outdated',
      } : null);

      set((state) => ({
        project: updatedProject,
        activeProjectId: pid,
        activeTab: 'timeline',
        isGenerating: false,
        renderProgress: 100,
        renderStage: 'timeline_ready',
        renderDetail: 'AI Director timeline synthesized.',
        error: null,
        projects: state.projects.some((p) => p.projectId === pid)
          ? state.projects.map((p) => (p.projectId === pid ? (updatedProject || p) : p))
          : (updatedProject ? [updatedProject, ...state.projects] : state.projects),
      }));
    } catch (err: any) {
      set({ error: err.message || 'Timeline generation failed', isGenerating: false });
    }
  },

  runFullProductionPipeline: async (options = { autoRender: true }) => {
    const { activeProjectId, project, aspectRatio } = get();
    const pid = activeProjectId || project?.projectId;
    if (!pid) {
      set({ error: 'No active project selected. Please select or create a project first.' });
      return;
    }
    try {
      set({
        isGenerating: true,
        error: null,
        renderStage: 'running_full_pipeline',
        renderProgress: 10,
        renderDetail: 'Starting 1-Click Master Production Studio...',
      });
      const res = await api.runFullProductionPipeline(pid, {
        autoRender: options.autoRender,
        aspectRatio,
      });
      if (res.project) {
        set({
          project: res.project,
          timeline: res.project.timeline,
          qualityReport: res.project.qualityReport,
          rightsReview: res.project.rightsAudit,
          isGenerating: false,
          renderProgress: 100,
          renderDetail: res.result?.message || 'Production pipeline finished!',
          activeTab: options.autoRender ? 'review' : 'timeline',
        });
      }
    } catch (err: any) {
      set({ isGenerating: false, error: err.message || '1-Click Master Production Pipeline failed' });
    }
  },

  regenerateTimeline: async () => {
    const { activeProjectId, project } = get();
    const pid = activeProjectId || project?.projectId;
    if (!pid) {
      set({ error: 'No active project selected to re-match.' });
      return;
    }
    try {
      set({ isGenerating: true, error: null, renderStage: 'generating_timeline', renderProgress: 35 });
      const res = await api.regenerateMovieTimeline(pid);
      const updatedProject = res.project || (project ? {
        ...project,
        timeline: res.timeline,
        qualityReport: res.qualityReport,
        status: 'timeline_ready',
        timelineRevision: res.timeline?.timelineRevision || ((project.timelineRevision || 1) + 1),
        exportStatus: 'outdated',
      } : null);

      set((state) => ({
        project: updatedProject,
        activeProjectId: pid,
        isGenerating: false,
        renderProgress: 100,
        renderStage: 'timeline_ready',
        renderDetail: 'Unlocked shots re-matched successfully.',
        error: null,
        projects: state.projects.some((p) => p.projectId === pid)
          ? state.projects.map((p) => (p.projectId === pid ? (updatedProject || p) : p))
          : (updatedProject ? [updatedProject, ...state.projects] : state.projects),
      }));
    } catch (err: any) {
      set({ error: err.message || 'Timeline re-match failed', isGenerating: false });
    }
  },

  toggleShotLock: async (shotId: string) => {
    const { activeProjectId, project } = get();
    if (!activeProjectId || !project?.timeline) return;

    // Optimistic UI update
    const updatedShots = project.timeline.shots.map((s) =>
      s.shotId === shotId ? { ...s, isLocked: !s.isLocked } : s
    );
    set((state) => ({
      project: state.project && state.project.timeline
        ? { ...state.project, timeline: { ...state.project.timeline, shots: updatedShots } }
        : state.project,
    }));

    try {
      await api.toggleMovieShotLock(activeProjectId, shotId);
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  openAlternativesModal: async (shotId: string) => {
    const { activeProjectId } = get();
    if (!activeProjectId) return;
    try {
      set({ selectedAlternativeShotId: shotId, isAlternativesModalOpen: true, alternativesList: [] });
      const res = await api.getMovieShotAlternatives(activeProjectId, shotId);
      set({ alternativesList: res.candidates || [] });
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  replaceShot: async (shotId: string, newSceneId: string) => {
    const { activeProjectId } = get();
    if (!activeProjectId) return;
    try {
      const res = await api.replaceMovieShot(activeProjectId, shotId, newSceneId);
      set((state) => {
        if (!state.project?.timeline) return state;
        const updatedShots = state.project.timeline.shots.map((s) =>
          s.shotId === shotId ? res.shot : s
        );
        const newRev = res.timelineRevision ?? ((state.project.timelineRevision || 0) + 1);
        return {
          project: {
            ...state.project,
            timelineRevision: newRev,
            exportStatus: (res.exportStatus as any) || 'outdated',
            timeline: {
              ...state.project.timeline,
              shots: updatedShots,
              revision: newRev,
            },
          },
          isAlternativesModalOpen: false,
        };
      });
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  acceptShotMatch: async (shotId: string) => {
    const { activeProjectId } = get();
    if (!activeProjectId) return;
    try {
      const res = await api.acceptShotMatch(activeProjectId, shotId);
      set((state) => {
        if (!state.project?.timeline) return state;
        const updatedShots = state.project.timeline.shots.map((s) =>
          s.shotId === shotId ? res.shot : s
        );
        return {
          project: {
            ...state.project,
            qualityReport: res.qualityReport || state.project.qualityReport,
            timeline: {
              ...state.project.timeline,
              shots: updatedShots,
            },
          },
        };
      });
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  acceptAllScreenshots: async () => {
    const { activeProjectId } = get();
    if (!activeProjectId) return;
    try {
      const res = await api.acceptAllScreenshots(activeProjectId);
      set((state) => {
        if (!state.project?.timeline) return state;
        return {
          project: {
            ...state.project,
            qualityReport: res.qualityReport || state.project.qualityReport,
            timeline: {
              ...state.project.timeline,
              shots: res.shots || state.project.timeline.shots,
            },
          },
        };
      });
    } catch (err: any) {
      set({ error: err.message });
      throw err;
    }
  },

  acceptAllMatches: async () => {
    const { activeProjectId } = get();
    if (!activeProjectId) return;
    try {
      const res = await api.acceptAllMatches(activeProjectId);
      set((state) => {
        if (!state.project?.timeline) return state;
        return {
          project: {
            ...state.project,
            qualityReport: res.qualityReport || state.project.qualityReport,
            timeline: {
              ...state.project.timeline,
              shots: res.shots || state.project.timeline.shots,
            },
          },
        };
      });
    } catch (err: any) {
      set({ error: err.message });
      throw err;
    }
  },

  convertUnmatchedToScreenshots: async () => {
    const { activeProjectId } = get();
    if (!activeProjectId) return;
    try {
      const res = await api.convertUnmatchedToScreenshots(activeProjectId);
      set((state) => {
        if (!state.project?.timeline) return state;
        return {
          project: {
            ...state.project,
            qualityReport: res.qualityReport || state.project.qualityReport,
            timeline: {
              ...state.project.timeline,
              shots: res.shots || state.project.timeline.shots,
            },
          },
        };
      });
    } catch (err: any) {
      set({ error: err.message });
      throw err;
    }
  },

  autoReviewAndApprove: async () => {
    const { activeProjectId } = get();
    if (!activeProjectId) return;
    try {
      const res = await api.autoReviewAndApprove(activeProjectId);
      set((state) => {
        if (!state.project?.timeline) return state;
        return {
          project: {
            ...state.project,
            qualityReport: res.qualityReport || state.project.qualityReport,
            timeline: {
              ...state.project.timeline,
              shots: res.shots || state.project.timeline.shots,
            },
          },
        };
      });
    } catch (err: any) {
      set({ error: err.message });
      throw err;
    }
  },

  convertShotToScreenshot: async (shotId: string, motionEffect?: MovieScreenshotMotionEffect) => {
    const { activeProjectId } = get();
    if (!activeProjectId) return;
    try {
      const res = await api.convertShotToScreenshot(activeProjectId, shotId, motionEffect);
      set((state) => {
        if (!state.project?.timeline) return state;
        const updatedShots = state.project.timeline.shots.map((s) =>
          s.shotId === shotId ? res.shot : s
        );
        return {
          project: {
            ...state.project,
            qualityReport: res.qualityReport || state.project.qualityReport,
            timeline: {
              ...state.project.timeline,
              shots: updatedShots,
            },
          },
        };
      });
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  recheckSegment: async (segmentId: string) => {
    const { activeProjectId } = get();
    if (!activeProjectId) return;
    try {
      const res = await api.recheckMovieSegment(activeProjectId, segmentId);
      set((state) => {
        if (!state.project) return state;
        const updatedScript = state.project.script ? {
          ...state.project.script,
          segments: state.project.script.segments.map((seg) =>
            seg.segmentId === segmentId ? (res.segment || seg) : seg
          ),
        } : state.project.script;
        const updatedTimeline = state.project.timeline ? {
          ...state.project.timeline,
          shots: state.project.timeline.shots.map((s) =>
            s.segmentId === segmentId ? (res.shot || s) : s
          ),
        } : state.project.timeline;

        return {
          project: {
            ...state.project,
            script: updatedScript,
            timeline: updatedTimeline,
            qualityReport: res.qualityReport || state.project.qualityReport,
          },
        };
      });
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  revalidateTimeline: async () => {
    const { activeProjectId } = get();
    if (!activeProjectId) return;
    try {
      const res = await api.revalidateMovieTimeline(activeProjectId);
      set((state) => {
        if (!state.project) return state;
        return {
          project: {
            ...state.project,
            qualityReport: res.qualityReport,
          },
        };
      });
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  replaceShotWithAsset: async (
    shotId: string,
    assetId: string,
    alignmentMode?: ShotAlignmentMode,
    assetStartOffset?: number
  ) => {
    const { activeProjectId } = get();
    if (!activeProjectId) return;
    try {
      const res = await api.replaceShotWithAsset(activeProjectId, shotId, {
        assetId,
        alignmentMode,
        assetStartOffset,
      });
      set((state) => {
        if (!state.project?.timeline) return state;
        const updatedShots = state.project.timeline.shots.map((s) =>
          s.shotId === shotId ? res.shot : s
        );
        const newRev = res.project?.timelineRevision ?? ((state.project.timelineRevision || 0) + 1);
        return {
          project: {
            ...state.project,
            timelineRevision: newRev,
            exportStatus: (res.project?.exportStatus as any) || 'outdated',
            timeline: {
              ...state.project.timeline,
              shots: updatedShots,
              revision: newRev,
            },
          },
          isAlternativesModalOpen: false,
        };
      });
      get().fetchRightsReview();
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  updateShotRights: async (shotId: string, rights: Partial<AssetRightsMetadata>) => {
    const { activeProjectId } = get();
    if (!activeProjectId) return;
    try {
      const res = await api.updateShotRights(activeProjectId, shotId, rights);
      set((state) => {
        if (!state.project?.timeline) return state;
        const updatedShots = state.project.timeline.shots.map((s) =>
          s.shotId === shotId ? res.shot : s
        );
        return {
          project: {
            ...state.project,
            timeline: {
              ...state.project.timeline,
              shots: updatedShots,
            },
          },
        };
      });
      get().fetchRightsReview();
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  loadReplacementAssets: async () => {
    const { activeProjectId } = get();
    if (!activeProjectId) return;
    try {
      const res = await api.getReplacementAssets(activeProjectId);
      if (res.success) {
        set({ replacementAssets: res.assets });
      }
    } catch {}
  },

  uploadReplacementVisual: async (file: File, metadata?: any) => {
    const { activeProjectId } = get();
    if (!activeProjectId) return null;
    try {
      set({ isUploadingVisual: true, error: null });
      const res = await api.uploadReplacementVisual(activeProjectId, file, metadata);
      if (res.success && res.asset) {
        set((state) => ({
          replacementAssets: [...state.replacementAssets, res.asset],
          project: state.project ? {
            ...state.project,
            replacementAssets: [...(state.project.replacementAssets || []), res.asset],
          } : null,
          isUploadingVisual: false,
        }));
        return res.asset;
      }
      set({ isUploadingVisual: false });
      return null;
    } catch (err: any) {
      set({ error: err.message, isUploadingVisual: false });
      return null;
    }
  },

  fetchRightsReview: async () => {
    const { activeProjectId } = get();
    if (!activeProjectId) return;
    try {
      set({ isLoadingRightsReview: true });
      const res = await api.getRightsReview(activeProjectId);
      if (res.success) {
        set({ rightsReview: res.review, isLoadingRightsReview: false });
      } else {
        set({ isLoadingRightsReview: false });
      }
    } catch {
      set({ isLoadingRightsReview: false });
    }
  },

  acknowledgeRightsWarnings: async () => {
    const { activeProjectId } = get();
    if (!activeProjectId) return;
    try {
      const res = await api.acknowledgeRightsWarnings(activeProjectId);
      if (res.success) {
        set({ rightsReview: res.rightsReview });
      }
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  fetchScriptReview: async () => {
    const { activeProjectId } = get();
    if (!activeProjectId) return;
    try {
      set({ isLoadingScriptReview: true });
      const res = await api.getScriptReview(activeProjectId);
      if (res.scriptReview) {
        set({ scriptReview: res.scriptReview, isLoadingScriptReview: false });
      } else {
        set({ isLoadingScriptReview: false });
      }
    } catch {
      set({ isLoadingScriptReview: false });
    }
  },

  updateScriptSegment: async (segmentId: string, text: string) => {
    const { activeProjectId } = get();
    if (!activeProjectId) return;
    try {
      const res = await api.updateScriptSegment(activeProjectId, segmentId, text);
      if (res.success) {
        set((state) => {
          if (!state.project?.script) return state;
          const updatedSegments = state.project.script.segments.map((s) =>
            s.segmentId === segmentId ? { ...s, text } : s
          );
          return {
            scriptReview: res.scriptReview || state.scriptReview,
            project: {
              ...state.project,
              script: {
                ...state.project.script,
                segments: updatedSegments,
              },
            },
          };
        });
      }
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  fetchExportManifest: async () => {
    const { activeProjectId } = get();
    if (!activeProjectId) return;
    try {
      set({ isLoadingManifest: true });
      const res = await api.getExportManifest(activeProjectId);
      if (res.manifest) {
        set({ exportManifest: res.manifest, isLoadingManifest: false });
      } else {
        set({ isLoadingManifest: false });
      }
    } catch {
      set({ isLoadingManifest: false });
    }
  },

  trimShot: async (shotId: string, sourceStart: number, sourceEnd: number) => {
    const { activeProjectId } = get();
    if (!activeProjectId) return;
    try {
      const res = await api.trimMovieShot(activeProjectId, shotId, sourceStart, sourceEnd);
      set((state) => {
        if (!state.project?.timeline) return state;
        const updatedShots = state.project.timeline.shots.map((s) =>
          s.shotId === shotId ? res.shot : s
        );
        const newRev = res.timelineRevision ?? ((state.project.timelineRevision || 0) + 1);
        return {
          project: {
            ...state.project,
            timelineRevision: newRev,
            exportStatus: (res.exportStatus as any) || 'outdated',
            timeline: {
              ...state.project.timeline,
              shots: updatedShots,
              revision: newRev,
            },
          },
        };
      });
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  startRender: async (options?: {
    acknowledgeRightsWarnings?: boolean;
    resolution?: string;
    frameRate?: number;
    qualityPreset?: string;
    burnCaptions?: boolean;
  }) => {
    const { activeProjectId, project } = get();
    const pid = activeProjectId || project?.projectId;
    if (!pid) {
      set({ error: 'No active project selected to render.' });
      return;
    }
    try {
      set((state) => ({
        isRendering: true,
        renderProgress: 5,
        renderStage: 'rendering',
        renderDetail: 'Initiating 60 FPS master render with chunk caching...',
        error: null,
        project: state.project ? { ...state.project, exportStatus: 'rendering' } : null,
      }));

      const renderOptions = {
        acknowledgeRightsWarnings: true,
        resolution: '1080p',
        frameRate: 60,
        qualityPreset: 'high',
        burnCaptions: true,
        ...options,
      };

      const res = await api.renderMovieExplanation(pid, renderOptions);
      if (res.requiresRightsAcknowledgement) {
        set({ error: 'Rights acknowledgement required before render. Please review and approve.' });
      }
    } catch (err: any) {
      set((state) => ({
        error: err.message || 'Rendering failed to start',
        isRendering: false,
        renderStage: 'failed',
        project: state.project ? { ...state.project, exportStatus: 'outdated' } : null,
      }));
    }
  },

  cancelRender: async () => {
    const { activeProjectId, project } = get();
    const pid = activeProjectId || project?.projectId;
    if (!pid) return;

    try {
      set({ renderDetail: 'Cancelling render process...' });
      const res = await api.cancelMovieExplanationRender(pid);
      const updatedProject = await api.getMovieExplanationProject(pid);
      set((state) => ({
        isRendering: false,
        renderStage: 'idle',
        renderProgress: 0,
        renderDetail: res.message || 'Render cancelled.',
        project: updatedProject,
        projects: state.projects.map((p) => (p.projectId === pid ? updatedProject : p)),
      }));
    } catch (err: any) {
      set({ error: err.message || 'Failed to cancel render.' });
    }
  },

  autoResolveUnmatched: async () => {
    const { activeProjectId, project } = get();
    const pid = activeProjectId || project?.projectId;
    if (!pid) return;

    try {
      set({ error: null, renderStage: 'resolving_footage', renderDetail: 'Auto-matching remaining shots to movie footage...' });
      const res = await api.autoResolveUnmatchedShots(pid);
      if (res.project) {
        set((state) => ({
          project: res.project,
          renderStage: 'idle',
          renderDetail: `Successfully matched ${res.resolvedCount} remaining shots.`,
          error: null,
          projects: state.projects.map((p) => (p.projectId === pid ? res.project : p)),
        }));
      }
    } catch (err: any) {
      set({ error: err.message || 'Auto-resolve footage failed', renderStage: 'idle' });
    }
  },

  enforceScreenshotCadence: async () => {
    const { activeProjectId, project } = get();
    const pid = activeProjectId || project?.projectId;
    if (!pid) return;

    try {
      set({ error: null, renderStage: 'resolving_footage', renderDetail: 'Enforcing screenshot cadence (inserting moving screenshot every 4-5 clips)...' });
      const res = await api.enforceScreenshotCadence(pid);
      if (res.project) {
        set((state) => ({
          project: res.project,
          renderStage: 'idle',
          renderDetail: `Enforced cadence: converted ${res.convertedCount} clips to moving screenshots.`,
          error: null,
          projects: state.projects.map((p) => (p.projectId === pid ? res.project : p)),
        }));
      }
    } catch (err: any) {
      set({ error: err.message || 'Enforce cadence failed', renderStage: 'idle' });
    }
  },

  autoVaryRepeatedScenes: async () => {
    const { activeProjectId, project } = get();
    const pid = activeProjectId || project?.projectId;
    if (!pid) return;

    try {
      set({ error: null, renderStage: 'resolving_footage', renderDetail: 'Auto-varying repeated scenes with unused footage pool...' });
      const res = await api.autoVaryRepeatedScenes(pid);
      if (res.project) {
        set((state) => ({
          project: res.project,
          renderStage: 'idle',
          renderDetail: `Successfully varied ${res.replacedCount} repeated scene instances.`,
          error: null,
          projects: state.projects.map((p) => (p.projectId === pid ? res.project : p)),
        }));
      }
    } catch (err: any) {
      set({ error: err.message || 'Auto-vary repeated scenes failed', renderStage: 'idle' });
    }
  },

  fetchOpeningReport: async () => {
    const { activeProjectId } = get();
    if (!activeProjectId) return;
    try {
      set({ isLoadingOpeningReport: true });
      const res = await api.getMovieExplanationOpeningReport(activeProjectId);
      set({ openingReport: res.report, isLoadingOpeningReport: false });
    } catch (err: any) {
      set({ error: err.message, isLoadingOpeningReport: false });
    }
  },

  generateOpeningPreview: async (duration: number = 120) => {
    const { activeProjectId } = get();
    if (!activeProjectId) return;
    try {
      set({ isGeneratingOpeningPreview: true, error: null });
      const res = await api.renderMovieExplanationOpeningPreview(activeProjectId, duration);
      if (res.previewUrl) {
        set((state) => ({
          project: state.project ? {
            ...state.project,
            openingPreviewVideoUrl: res.previewUrl,
            openingPreviewVideoPath: res.outputPath,
          } : null,
          isGeneratingOpeningPreview: false,
        }));
      }
    } catch (err: any) {
      set({ error: err.message, isGeneratingOpeningPreview: false });
    }
  },

  updateSettings: async (settings: any) => {
    const { activeProjectId } = get();
    if (!activeProjectId) return;
    try {
      const res = await api.updateMovieExplanationSettings(activeProjectId, settings);
      if (res.success && res.project) {
        set((state) => ({
          project: {
            ...state.project,
            ...res.project,
            transformativeSettings: res.settings,
          },
        }));
      }
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  // Multi-track timeline & video editor actions
  setTimelineZoom: (zoom: number) => set({ timelineZoom: Math.max(0.1, Math.min(5.0, zoom)) }),
  setInPoint: (time: number | null) => set({ inPoint: time }),
  setOutPoint: (time: number | null) => set({ outPoint: time }),
  setPlaybackSpeed: (speed: number) => set({ playbackSpeed: speed }),
  setPreviewVolume: (vol: number) => set({ previewVolume: Math.max(0, Math.min(1, vol)) }),
  setIsMuted: (muted: boolean) => set({ isMuted: muted }),
  setPreviewMode: (mode: 'full' | 'clip' | 'range') => set({ previewMode: mode }),
  setSelectedTextOverlayId: (id: string | null) => set({ selectedTextOverlayId: id }),
  setSelectedCaptionId: (id: string | null) => set({ selectedCaptionId: id }),
  setCaptionsVisible: (visible: boolean) => set({ captionsVisible: visible }),
  toggleCaptionsVisible: () => set((state) => ({ captionsVisible: !state.captionsVisible })),

  updateCaptionStyle: async (style: Partial<CaptionStyleSettings>) => {
    const { activeProjectId, project } = get();
    if (!activeProjectId || !project?.timeline) return;
    try {
      pushHistory(project.timeline);
      const updatedStyle: CaptionStyleSettings = {
        ...(project.timeline.captionStyle || {}),
        ...style,
      };
      const updatedTimeline: MovieExplanationTimeline = {
        ...project.timeline,
        captionStyle: updatedStyle,
      };
      set((state) => ({
        canUndo: true,
        canRedo: false,
        project: state.project ? { ...state.project, timeline: updatedTimeline } : null,
      }));
      await api.updateMovieTimeline(activeProjectId, { captionStyle: updatedStyle });
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  applyCaptionPreset: async (presetName: string) => {
    const { activeProjectId, project } = get();
    if (!activeProjectId || !project?.timeline) return;
    const preset = CAPTION_PRESETS[presetName] || CAPTION_PRESETS['clean_white'];
    try {
      pushHistory(project.timeline);
      const updatedTimeline: MovieExplanationTimeline = {
        ...project.timeline,
        captionStyle: { ...preset },
      };
      set((state) => ({
        canUndo: true,
        canRedo: false,
        project: state.project ? { ...state.project, timeline: updatedTimeline } : null,
      }));
      await api.updateMovieTimeline(activeProjectId, { captionStyle: preset });
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  updateCaption: async (captionId: string, updates: Partial<TimelineCaptionItem>) => {
    const { activeProjectId, project } = get();
    if (!activeProjectId || !project?.timeline) return;
    try {
      pushHistory(project.timeline);
      const updatedCaptions = (project.timeline.captions || []).map((c) =>
        c.id === captionId ? { ...c, ...updates } : c
      );
      const updatedTimeline: MovieExplanationTimeline = {
        ...project.timeline,
        captions: updatedCaptions,
      };
      set((state) => ({
        canUndo: true,
        canRedo: false,
        project: state.project ? { ...state.project, timeline: updatedTimeline } : null,
      }));
      await api.updateMovieCaptions(activeProjectId, updatedCaptions);
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  splitCaption: async (captionId: string, splitTime?: number) => {
    const { activeProjectId, project, currentTime } = get();
    if (!activeProjectId || !project?.timeline) return;
    const captions = project.timeline.captions || [];
    const targetIdx = captions.findIndex((c) => c.id === captionId);
    if (targetIdx === -1) return;
    const target = captions[targetIdx];
    const splitPoint = splitTime ?? (currentTime > target.startTime && currentTime < target.endTime ? currentTime : (target.startTime + target.endTime) / 2);
    if (splitPoint <= target.startTime + 0.2 || splitPoint >= target.endTime - 0.2) return;

    const words = target.text.split(' ');
    const half = Math.max(1, Math.floor(words.length / 2));
    const text1 = words.slice(0, half).join(' ');
    const text2 = words.slice(half).join(' ');

    const cap1: TimelineCaptionItem = {
      ...target,
      text: text1,
      endTime: Number(splitPoint.toFixed(2)),
    };
    const cap2: TimelineCaptionItem = {
      ...target,
      id: `cap_${Date.now()}`,
      text: text2,
      startTime: Number(splitPoint.toFixed(2)),
    };

    const newCaptions = [...captions];
    newCaptions.splice(targetIdx, 1, cap1, cap2);
    try {
      pushHistory(project.timeline);
      set((state) => ({
        canUndo: true,
        canRedo: false,
        project: state.project?.timeline ? {
          ...state.project,
          timeline: { ...state.project.timeline, captions: newCaptions } as MovieExplanationTimeline,
        } : state.project,
      }));
      await api.updateMovieCaptions(activeProjectId, newCaptions);
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  mergeCaptions: async (captionId1: string, captionId2: string) => {
    const { activeProjectId, project } = get();
    if (!activeProjectId || !project?.timeline) return;
    const captions = project.timeline.captions || [];
    const c1 = captions.find((c) => c.id === captionId1);
    const c2 = captions.find((c) => c.id === captionId2);
    if (!c1 || !c2) return;

    const merged: TimelineCaptionItem = {
      ...c1,
      text: `${c1.text} ${c2.text}`,
      startTime: Math.min(c1.startTime, c2.startTime),
      endTime: Math.max(c1.endTime, c2.endTime),
    };

    const newCaptions = captions.filter((c) => c.id !== captionId1 && c.id !== captionId2);
    newCaptions.push(merged);
    newCaptions.sort((a, b) => a.startTime - b.startTime);

    try {
      pushHistory(project.timeline);
      set((state) => ({
        canUndo: true,
        canRedo: false,
        project: state.project?.timeline ? {
          ...state.project,
          timeline: { ...state.project.timeline, captions: newCaptions } as MovieExplanationTimeline,
        } : state.project,
        selectedCaptionId: merged.id,
      }));
      await api.updateMovieCaptions(activeProjectId, newCaptions);
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  deleteCaption: async (captionId: string) => {
    const { activeProjectId, project } = get();
    if (!activeProjectId || !project?.timeline) return;
    const captions = (project.timeline.captions || []).filter((c) => c.id !== captionId);
    try {
      pushHistory(project.timeline);
      set((state) => ({
        canUndo: true,
        canRedo: false,
        project: state.project?.timeline ? {
          ...state.project,
          timeline: { ...state.project.timeline, captions } as MovieExplanationTimeline,
        } : state.project,
        selectedCaptionId: null,
      }));
      await api.updateMovieCaptions(activeProjectId, captions);
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  splitShot: async (shotId: string, splitTimestamp: number) => {
    const { activeProjectId, project } = get();
    if (!activeProjectId || !project?.timeline) return;
    try {
      pushHistory(project.timeline);
      const res = await api.splitMovieShot(activeProjectId, shotId, splitTimestamp);
      if (res.success) {
        set((state) => ({
          canUndo: true,
          canRedo: false,
          project: state.project ? {
            ...state.project,
            timelineRevision: res.timelineRevision,
            exportStatus: 'outdated',
            timeline: res.timeline,
          } : null,
          selectedShotId: res.splitShots[0]?.shotId || shotId,
        }));
      }
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  reorderShots: async (shotIds: string[]) => {
    const { activeProjectId, project } = get();
    if (!activeProjectId || !project?.timeline) return;
    try {
      pushHistory(project.timeline);
      const res = await api.reorderMovieShots(activeProjectId, shotIds);
      if (res.success) {
        set((state) => ({
          canUndo: true,
          canRedo: false,
          project: state.project ? {
            ...state.project,
            timelineRevision: res.timelineRevision,
            exportStatus: 'outdated',
            timeline: res.timeline,
          } : null,
        }));
      }
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  updateShotTransform: async (shotId: string, data: any) => {
    const { activeProjectId, project } = get();
    if (!activeProjectId || !project?.timeline) return;
    try {
      pushHistory(project.timeline);
      const res = await api.updateMovieShotTransform(activeProjectId, shotId, data);
      if (res.success) {
        set((state) => {
          if (!state.project?.timeline) return state;
          const updatedShots = state.project.timeline.shots.map((s) =>
            s.shotId === shotId ? res.shot : s
          );
          return {
            canUndo: true,
            canRedo: false,
            project: {
              ...state.project,
              timelineRevision: res.timelineRevision,
              exportStatus: 'outdated',
              timeline: {
                ...state.project.timeline,
                shots: updatedShots,
                revision: res.timelineRevision,
              },
            },
          };
        });
      }
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  batchUpdateShots: async (updates: any, shotIds?: string[], all?: boolean) => {
    const { activeProjectId, project } = get();
    if (!activeProjectId || !project?.timeline) return;
    try {
      pushHistory(project.timeline);
      const res = await api.batchUpdateMovieShots(activeProjectId, updates, shotIds, all);
      if (res.success) {
        await get().loadProject(activeProjectId);
        set({ canUndo: true, canRedo: false });
      }
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  duplicateShot: async (shotId: string) => {
    const { activeProjectId, project } = get();
    if (!activeProjectId || !project?.timeline) return;
    try {
      pushHistory(project.timeline);
      const res = await api.duplicateMovieShot(activeProjectId, shotId);
      if (res.success) {
        set((state) => ({
          canUndo: true,
          canRedo: false,
          project: state.project ? {
            ...state.project,
            timelineRevision: res.timelineRevision,
            exportStatus: 'outdated',
            timeline: res.timeline,
          } : null,
          selectedShotId: res.duplicatedShot?.shotId || shotId,
        }));
      }
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  deleteShot: async (shotId: string) => {
    const { activeProjectId, project } = get();
    if (!activeProjectId || !project?.timeline) return;
    try {
      pushHistory(project.timeline);
      const res = await api.deleteMovieShot(activeProjectId, shotId);
      if (res.success) {
        set((state) => ({
          canUndo: true,
          canRedo: false,
          project: state.project ? {
            ...state.project,
            timelineRevision: res.timelineRevision,
            exportStatus: 'outdated',
            timeline: res.timeline,
          } : null,
          selectedShotId: null,
        }));
      }
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  updateTimelineState: async (data: any) => {
    const { activeProjectId, project } = get();
    if (!activeProjectId || !project?.timeline) return;
    try {
      pushHistory(project.timeline);
      const res = await api.updateMovieTimeline(activeProjectId, data);
      if (res.success) {
        set((state) => ({
          canUndo: true,
          canRedo: false,
          project: state.project ? {
            ...state.project,
            timelineRevision: res.timelineRevision,
            exportStatus: 'outdated',
            timeline: res.timeline,
          } : null,
        }));
      }
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  generateCaptions: async () => {
    const { activeProjectId } = get();
    if (!activeProjectId) return;
    try {
      const res = await api.generateMovieCaptions(activeProjectId);
      if (res.success) {
        set((state) => ({
          project: state.project && state.project.timeline ? {
            ...state.project,
            timeline: {
              ...state.project.timeline,
              captions: res.captions,
            },
          } : state.project,
        }));
      }
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  updateCaptions: async (captions: any[]) => {
    const { activeProjectId } = get();
    if (!activeProjectId) return;
    try {
      const res = await api.updateMovieCaptions(activeProjectId, captions);
      if (res.success) {
        set((state) => ({
          project: state.project && state.project.timeline ? {
            ...state.project,
            timeline: {
              ...state.project.timeline,
              captions: res.captions,
            },
          } : state.project,
        }));
      }
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  undo: () => {
    const { project, activeProjectId } = get();
    if (!project?.timeline || pastTimelines.length === 0) return;
    const previous = pastTimelines.pop()!;
    futureTimelines.push(JSON.parse(JSON.stringify(project.timeline)));
    set((state) => ({
      canUndo: pastTimelines.length > 0,
      canRedo: true,
      project: state.project ? {
        ...state.project,
        timeline: previous,
        timelineRevision: (state.project.timelineRevision || 1) + 1,
        exportStatus: 'outdated',
      } : null,
    }));
    if (activeProjectId) {
      api.updateMovieTimeline(activeProjectId, previous).catch(() => {});
    }
  },

  redo: () => {
    const { project, activeProjectId } = get();
    if (!project?.timeline || futureTimelines.length === 0) return;
    const next = futureTimelines.pop()!;
    pastTimelines.push(JSON.parse(JSON.stringify(project.timeline)));
    set((state) => ({
      canUndo: true,
      canRedo: futureTimelines.length > 0,
      project: state.project ? {
        ...state.project,
        timeline: next,
        timelineRevision: (state.project.timelineRevision || 1) + 1,
        exportStatus: 'outdated',
      } : null,
    }));
    if (activeProjectId) {
      api.updateMovieTimeline(activeProjectId, next).catch(() => {});
    }
  },

  seekTo: (time: number) => {
    set({ currentTime: Math.max(0, time) });
  },

  togglePlay: () => {
    set((state) => ({ isPlaying: !state.isPlaying }));
  },

  clearInOutPoints: () => {
    set({ inPoint: null, outPoint: null });
  },

  replaceShotScene: async (shotId: string, sceneId: string) => {
    await get().replaceShot(shotId, sceneId);
  },

  addSceneToTimeline: async (sceneId: string, insertAfterShotId?: string, duration?: number) => {
    const { activeProjectId, project } = get();
    if (!activeProjectId || !project?.timeline) return;
    try {
      pushHistory(project.timeline);
      const res = await api.addMovieSceneToTimeline(activeProjectId, sceneId, insertAfterShotId, duration);
      if (res.success) {
        set((state) => ({
          canUndo: true,
          canRedo: false,
          project: state.project ? {
            ...state.project,
            timelineRevision: res.timelineRevision,
            exportStatus: 'outdated',
            timeline: res.timeline,
          } : null,
          selectedShotId: res.shot?.shotId,
        }));
      }
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  autoGenerateCaptions: async () => {
    await get().generateCaptions();
  },

  splitShotAtPlayhead: async () => {
    const { project, currentTime, selectedShotId, splitShot } = get();
    if (!project?.timeline || !project.timeline.shots?.length) return;
    const shots = project.timeline.shots;
    const shot = shots.find((s) => currentTime >= s.timelineStart && currentTime < s.timelineEnd)
      || shots.find((s) => s.shotId === selectedShotId)
      || shots[0];
    if (!shot) return;

    const offsetInShot = (currentTime - shot.timelineStart) * (shot.speedMultiplier || 1.0);
    const splitTimestamp = Math.max(
      shot.sourceStart + 0.15,
      Math.min(shot.sourceEnd - 0.15, shot.sourceStart + offsetInShot)
    );
    await splitShot(shot.shotId, splitTimestamp);
  },

  addTextOverlay: async (overlay: Partial<TimelineTextOverlay>) => {
    const { project, activeProjectId, currentTime } = get();
    if (!project?.timeline) return;

    const newId = `txt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const newOverlay: TimelineTextOverlay = {
      id: newId,
      trackId: 'track_text_1',
      timelineStart: overlay.timelineStart ?? currentTime,
      timelineEnd: overlay.timelineEnd ?? (currentTime + (overlay.duration ?? 3.0)),
      duration: overlay.duration ?? 3.0,
      text: overlay.text || 'Add Title Here',
      fontFamily: overlay.fontFamily || 'Inter, sans-serif',
      fontSize: overlay.fontSize || 36,
      fontColor: overlay.fontColor || '#ffffff',
      fontWeight: overlay.fontWeight || '700',
      positionX: overlay.positionX ?? 50,
      positionY: overlay.positionY ?? 25,
      scale: overlay.scale ?? 1.0,
      rotation: overlay.rotation ?? 0,
      opacity: overlay.opacity ?? 1.0,
      alignment: overlay.alignment || 'center',
      ...overlay,
    };

    pushHistory(project.timeline);
    const updatedOverlays = [...(project.timeline.textOverlays || []), newOverlay];
    const newRev = (project.timelineRevision || 1) + 1;
    const updatedTimeline = {
      ...project.timeline,
      textOverlays: updatedOverlays,
      timelineRevision: newRev,
    };

    set((state) => ({
      selectedTextOverlayId: newId,
      canUndo: true,
      canRedo: false,
      project: state.project ? {
        ...state.project,
        timelineRevision: newRev,
        exportStatus: 'outdated',
        timeline: updatedTimeline,
      } : null,
    }));

    if (activeProjectId) {
      api.updateMovieTimeline(activeProjectId, updatedTimeline).catch(() => {});
    }
  },

  updateTextOverlay: async (id: string, updates: Partial<TimelineTextOverlay>) => {
    const { project, activeProjectId } = get();
    if (!project?.timeline?.textOverlays) return;

    const updatedOverlays = project.timeline.textOverlays.map((t) =>
      t.id === id ? { ...t, ...updates } : t
    );

    const updatedTimeline = {
      ...project.timeline,
      textOverlays: updatedOverlays,
    };

    set((state) => ({
      project: state.project ? {
        ...state.project,
        timeline: updatedTimeline,
      } : null,
    }));

    if (activeProjectId) {
      api.updateMovieTimeline(activeProjectId, updatedTimeline).catch(() => {});
    }
  },

  deleteTextOverlay: async (id: string) => {
    const { project, activeProjectId, selectedTextOverlayId } = get();
    if (!project?.timeline?.textOverlays) return;

    pushHistory(project.timeline);
    const updatedOverlays = project.timeline.textOverlays.filter((t) => t.id !== id);
    const newRev = (project.timelineRevision || 1) + 1;
    const updatedTimeline = {
      ...project.timeline,
      textOverlays: updatedOverlays,
      timelineRevision: newRev,
    };

    set((state) => ({
      selectedTextOverlayId: selectedTextOverlayId === id ? null : selectedTextOverlayId,
      canUndo: true,
      canRedo: false,
      project: state.project ? {
        ...state.project,
        timelineRevision: newRev,
        exportStatus: 'outdated',
        timeline: updatedTimeline,
      } : null,
    }));

    if (activeProjectId) {
      api.updateMovieTimeline(activeProjectId, updatedTimeline).catch(() => {});
    }
  },

  setActiveTab: (tab) => set({ activeTab: tab }),
  setAspectRatio: (ratio) => set({ aspectRatio: ratio }),
  setSelectedShotId: (shotId) => set({ selectedShotId: shotId }),
  setIsWhyModalOpen: (open) => set({ isWhyModalOpen: open }),
  setIsAlternativesModalOpen: (open) => set({ isAlternativesModalOpen: open }),
  setIsQualityModalOpen: (open) => set({ isQualityModalOpen: open }),
  setCurrentTime: (time) => set({ currentTime: time }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setError: (err) => set({ error: err }),

  listenToProgress: (projectId: string) => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws?projectId=${projectId}`;
    let ws: WebSocket | null = null;
    let isDisposed = false;

    try {
      ws = new WebSocket(wsUrl);
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as WSMovieExplanationProgress;
          if (msg.type === 'movie_explanation_progress' && msg.payload.projectId === projectId) {
            const { progress, stage, detail, status, analysisJob, timelineRevision, lastExportedRevision, exportStatus } = msg.payload;
            set((state) => ({
              renderProgress: progress,
              renderStage: stage,
              renderDetail: detail || '',
              isIndexing: status === 'indexing_episode',
              isAligning: status === 'aligning_script',
              isRendering: status === 'rendering',
              analysisJob: analysisJob || state.analysisJob,
              project: state.project ? {
                ...state.project,
                timelineRevision: timelineRevision ?? state.project.timelineRevision,
                lastExportedRevision: lastExportedRevision ?? state.project.lastExportedRevision,
                exportStatus: exportStatus ?? state.project.exportStatus,
              } : null,
            }));

            if (status === 'completed' || status === 'timeline_ready') {
              get().loadProject(projectId);
            }
          }
        } catch {}
      };

      ws.onerror = () => {};
    } catch {}

    return () => {
      isDisposed = true;
      try {
        if (!ws) return;
        if (ws.readyState === WebSocket.CONNECTING) {
          ws.onopen = () => {
            try {
              ws?.close();
            } catch {}
          };
        } else if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      } catch {}
    };
  },
}));

