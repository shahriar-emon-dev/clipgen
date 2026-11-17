// ============================================================
// Voiceover Store — State & Editorial Actions for Voiceover Studio
// Controls voiceover audio, footage library, synchronized timeline,
// locked shots, alternatives modal, and master render pipeline.
// ============================================================

import { create } from 'zustand';
import { api } from '../services/api.js';
import { wsService } from '../services/websocket.js';
import type {
  VoiceoverProjectState,
  VoiceoverTimeline,
  VoiceoverQualityReport,
  VoiceoverMatchingMode,
  VoiceoverOutputAspectRatio,
  VoiceoverTimelineShot,
  VisualMatchCandidate,
  WSMessage,
} from '@shared/types.js';

interface VoiceoverStore {
  project: VoiceoverProjectState | null;
  activeProjectId: string | null;
  isLoading: boolean;
  isAnalyzingVoice: boolean;
  isAnalyzingFootage: boolean;
  isGeneratingTimeline: boolean;
  isRendering: boolean;
  renderProgress: number;
  renderStage: string;
  renderDetail: string;
  error: string | null;

  // Timeline & Playback
  selectedShotId: string | null;
  currentTime: number;
  isPlaying: boolean;

  // Editorial Settings
  matchingMode: VoiceoverMatchingMode;
  outputAspectRatio: VoiceoverOutputAspectRatio;
  captionsEnabled: boolean;

  // Alternatives Modal
  alternativesModalShotId: string | null;
  alternativesModalCurrentShot: VoiceoverTimelineShot | null;
  alternatives: VisualMatchCandidate[];
  isLoadingAlternatives: boolean;

  // Quality Report Modal
  qualityReportModalOpen: boolean;

  // Actions
  createProject: () => Promise<string>;
  loadProject: (projectId: string) => Promise<void>;
  uploadVoiceover: (file: File) => Promise<void>;
  uploadFootage: (files: File[]) => Promise<void>;
  startVoiceoverAnalysis: () => Promise<void>;
  startFootageAnalysis: () => Promise<void>;
  generateTimeline: () => Promise<void>;
  regenerateTimeline: () => Promise<void>;
  openAlternativesModal: (shotId: string) => Promise<void>;
  closeAlternativesModal: () => void;
  replaceShotWithAlternative: (candidate: VisualMatchCandidate) => Promise<void>;
  toggleShotLock: (shotId: string) => Promise<void>;
  setMatchingMode: (mode: VoiceoverMatchingMode) => void;
  setOutputAspectRatio: (ratio: VoiceoverOutputAspectRatio) => void;
  setCaptionsEnabled: (enabled: boolean) => void;
  startRender: () => Promise<void>;
  setCurrentTime: (time: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setSelectedShotId: (shotId: string | null) => void;
  setQualityReportModalOpen: (open: boolean) => void;
  listenToProgress: (projectId: string) => () => void;
  reset: () => void;
}

export const useVoiceoverStore = create<VoiceoverStore>((set, get) => ({
  project: null,
  activeProjectId: null,
  isLoading: false,
  isAnalyzingVoice: false,
  isAnalyzingFootage: false,
  isGeneratingTimeline: false,
  isRendering: false,
  renderProgress: 0,
  renderStage: '',
  renderDetail: '',
  error: null,

  selectedShotId: null,
  currentTime: 0,
  isPlaying: false,

  matchingMode: 'balanced',
  outputAspectRatio: '16:9',
  captionsEnabled: true,

  alternativesModalShotId: null,
  alternativesModalCurrentShot: null,
  alternatives: [],
  isLoadingAlternatives: false,

  qualityReportModalOpen: false,

  createProject: async () => {
    set({ isLoading: true, error: null });
    try {
      const state = await api.createVoiceoverProject();
      set({
        project: state,
        activeProjectId: state.projectId,
        matchingMode: 'balanced',
        outputAspectRatio: '16:9',
      });
      return state.projectId;
    } catch (err: any) {
      set({ error: err.message });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  loadProject: async (projectId: string) => {
    set({ isLoading: true, activeProjectId: projectId, error: null });
    try {
      const state = await api.getVoiceoverState(projectId);
      set({
        project: state,
        matchingMode: state.timeline?.matchingMode || get().matchingMode,
        outputAspectRatio: state.timeline?.outputAspectRatio || get().outputAspectRatio,
        captionsEnabled: state.timeline?.captionsEnabled ?? get().captionsEnabled,
        isRendering: state.status === 'rendering',
        renderProgress: state.renderProgress || 0,
        renderStage: state.renderStage || '',
        renderDetail: state.renderDetail || '',
      });
    } catch (err: any) {
      set({ error: err.message });
    } finally {
      set({ isLoading: false });
    }
  },

  uploadVoiceover: async (file: File) => {
    const projectId = get().activeProjectId;
    if (!projectId) return;

    set({ isLoading: true, error: null });
    try {
      await api.uploadVoiceoverAudio(projectId, file);
      // Reload project state
      await get().loadProject(projectId);
    } catch (err: any) {
      set({ error: err.message });
    } finally {
      set({ isLoading: false });
    }
  },

  uploadFootage: async (files: File[]) => {
    const projectId = get().activeProjectId;
    if (!projectId) return;

    set({ isLoading: true, error: null });
    try {
      await api.uploadVoiceoverFootage(projectId, files);
      await get().loadProject(projectId);
    } catch (err: any) {
      set({ error: err.message });
    } finally {
      set({ isLoading: false });
    }
  },

  startVoiceoverAnalysis: async () => {
    const projectId = get().activeProjectId;
    if (!projectId) return;

    set({ isAnalyzingVoice: true, error: null });
    try {
      await api.analyzeVoiceover(projectId);
    } catch (err: any) {
      set({ error: err.message, isAnalyzingVoice: false });
    }
  },

  startFootageAnalysis: async () => {
    const projectId = get().activeProjectId;
    if (!projectId) return;

    set({ isAnalyzingFootage: true, error: null });
    try {
      await api.analyzeFootage(projectId);
    } catch (err: any) {
      set({ error: err.message, isAnalyzingFootage: false });
    }
  },

  generateTimeline: async () => {
    const projectId = get().activeProjectId;
    if (!projectId) return;

    set({ isGeneratingTimeline: true, error: null });
    try {
      const res = await api.generateVoiceoverTimeline(projectId, {
        matchingMode: get().matchingMode,
        outputAspectRatio: get().outputAspectRatio,
        captionsEnabled: get().captionsEnabled,
      });

      const current = get().project;
      if (current) {
        set({
          project: {
            ...current,
            timeline: res.timeline,
            qualityReport: res.qualityReport,
            status: 'timeline_ready',
          },
        });
      }
    } catch (err: any) {
      set({ error: err.message });
    } finally {
      set({ isGeneratingTimeline: false });
    }
  },

  regenerateTimeline: async () => {
    const projectId = get().activeProjectId;
    if (!projectId) return;

    set({ isGeneratingTimeline: true, error: null });
    try {
      const res = await api.regenerateVoiceoverTimeline(projectId, {
        matchingMode: get().matchingMode,
        outputAspectRatio: get().outputAspectRatio,
      });

      const current = get().project;
      if (current) {
        set({
          project: {
            ...current,
            timeline: res.timeline,
            qualityReport: res.qualityReport,
          },
        });
      }
    } catch (err: any) {
      set({ error: err.message });
    } finally {
      set({ isGeneratingTimeline: false });
    }
  },

  openAlternativesModal: async (shotId: string) => {
    const projectId = get().activeProjectId;
    if (!projectId) return;

    set({
      alternativesModalShotId: shotId,
      isLoadingAlternatives: true,
      alternatives: [],
      error: null,
    });

    try {
      const data = await api.getClipAlternatives(projectId, shotId);
      set({
        alternativesModalCurrentShot: data.currentShot,
        alternatives: data.alternatives,
      });
    } catch (err: any) {
      set({ error: err.message });
    } finally {
      set({ isLoadingAlternatives: false });
    }
  },

  closeAlternativesModal: () => {
    set({
      alternativesModalShotId: null,
      alternativesModalCurrentShot: null,
      alternatives: [],
    });
  },

  replaceShotWithAlternative: async (candidate: VisualMatchCandidate) => {
    const projectId = get().activeProjectId;
    const shotId = get().alternativesModalShotId;
    if (!projectId || !shotId) return;

    try {
      const res = await api.updateTimelineShot(projectId, shotId, {
        clipId: candidate.clipId,
        sourceStart: candidate.sourceStart,
        sourceEnd: candidate.sourceEnd,
        isLocked: true, // Manual replacement locks the shot
      });

      // Update shot in current project state
      const project = get().project;
      if (project && project.timeline) {
        const updatedSegments = project.timeline.segments.map((seg) => ({
          ...seg,
          shots: seg.shots.map((sh) => (sh.shotId === shotId ? res.shot : sh)),
        }));

        set({
          project: {
            ...project,
            timeline: {
              ...project.timeline,
              segments: updatedSegments,
            },
            qualityReport: res.qualityReport,
          },
          alternativesModalShotId: null,
          alternativesModalCurrentShot: null,
        });
      }
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  toggleShotLock: async (shotId: string) => {
    const projectId = get().activeProjectId;
    const project = get().project;
    if (!projectId || !project || !project.timeline) return;

    let targetShot: VoiceoverTimelineShot | null = null;
    for (const seg of project.timeline.segments) {
      for (const sh of seg.shots) {
        if (sh.shotId === shotId) {
          targetShot = sh;
          break;
        }
      }
      if (targetShot) break;
    }

    if (!targetShot) return;
    const nextLockedState = !targetShot.isLocked;

    try {
      const res = await api.updateTimelineShot(projectId, shotId, {
        isLocked: nextLockedState,
      });

      const updatedSegments = project.timeline.segments.map((seg) => ({
        ...seg,
        shots: seg.shots.map((sh) => (sh.shotId === shotId ? res.shot : sh)),
      }));

      set({
        project: {
          ...project,
          timeline: {
            ...project.timeline,
            segments: updatedSegments,
          },
          qualityReport: res.qualityReport,
        },
      });
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  setMatchingMode: (mode: VoiceoverMatchingMode) => {
    set({ matchingMode: mode });
  },

  setOutputAspectRatio: (ratio: VoiceoverOutputAspectRatio) => {
    set({ outputAspectRatio: ratio });
  },

  setCaptionsEnabled: (enabled: boolean) => {
    set({ captionsEnabled: enabled });
  },

  startRender: async () => {
    const projectId = get().activeProjectId;
    if (!projectId) return;

    set({ isRendering: true, renderProgress: 0, renderStage: 'preparing', error: null });
    try {
      await api.renderVoiceoverVideo(projectId);
    } catch (err: any) {
      set({ isRendering: false, error: err.message });
    }
  },

  setCurrentTime: (time: number) => {
    set({ currentTime: Math.max(0, time) });
  },

  setIsPlaying: (playing: boolean) => {
    set({ isPlaying: playing });
  },

  setSelectedShotId: (shotId: string | null) => {
    set({ selectedShotId: shotId });
  },

  setQualityReportModalOpen: (open: boolean) => {
    set({ qualityReportModalOpen: open });
  },

  listenToProgress: (projectId: string) => {
    wsService.connect(projectId);

    const handler = (msg: WSMessage) => {
      if (msg.type === 'voiceover_progress' && (msg as any).payload?.projectId === projectId) {
        const payload = (msg as any).payload;
        set({
          renderProgress: payload.progress,
          renderStage: payload.stage,
          renderDetail: payload.detail || payload.stage,
          isRendering: payload.status === 'rendering',
          isAnalyzingVoice: payload.stage === 'transcribing',
          isAnalyzingFootage: payload.stage === 'indexing_footage',
          isGeneratingTimeline: payload.stage === 'director_planning',
        });

        if (payload.status === 'completed' || payload.stage === 'transcription_complete' || payload.stage === 'indexing_complete') {
          get().loadProject(projectId);
        }
      }
    };

    return wsService.subscribe(handler);
  },

  reset: () => {
    set({
      project: null,
      activeProjectId: null,
      isLoading: false,
      isAnalyzingVoice: false,
      isAnalyzingFootage: false,
      isGeneratingTimeline: false,
      isRendering: false,
      renderProgress: 0,
      renderStage: '',
      renderDetail: '',
      error: null,
      selectedShotId: null,
      currentTime: 0,
      isPlaying: false,
      alternativesModalShotId: null,
      alternativesModalCurrentShot: null,
      alternatives: [],
      qualityReportModalOpen: false,
    });
  },
}));
