// ============================================================
// Long-Form Studio Store — State & Actions for Long-Form Mode
// ============================================================

import { create } from 'zustand';
import { api } from '../services/api.js';
import { wsService } from '../services/websocket.js';
import type {
  LongFormCompilation,
  LongFormSettings,
  TimelineSegment,
  GenerateTimelineRequest,
  LongFormQualityReport,
  WSMessage,
  WSLongFormProgress,
} from '@shared/types.js';
import { DEFAULT_LONG_FORM_SETTINGS } from '@shared/constants.js';

interface LongFormStore {
  compilation: LongFormCompilation | null;
  settings: LongFormSettings;
  timeline: TimelineSegment[];
  isLoading: boolean;
  isRendering: boolean;
  renderProgress: number;
  renderStage: string;
  renderDetail: string;
  error: string | null;
  selectedSegmentId: string | null;
  qualityReport: LongFormQualityReport | null;

  loadCompilation: (projectId: string) => Promise<void>;
  generateTimeline: (projectId: string, req?: GenerateTimelineRequest) => Promise<void>;
  updateTimeline: (segments: TimelineSegment[]) => Promise<void>;
  updateSettings: (partial: Partial<LongFormSettings>) => Promise<void>;
  toggleSegment: (segmentId: string) => Promise<void>;
  reorderSegments: (sourceIndex: number, destIndex: number) => Promise<void>;
  trimSegment: (segmentId: string, newStart: number, newEnd: number) => Promise<void>;
  updateSegmentTransition: (segmentId: string, transition: any) => Promise<void>;
  renderCompilation: () => Promise<void>;
  downloadCompilation: () => Promise<void>;
  setSelectedSegmentId: (id: string | null) => void;
  listenToLongFormUpdates: (projectId: string) => () => void;
  reset: () => void;
}

export const useLongFormStore = create<LongFormStore>((set, get) => ({
  compilation: null,
  settings: { ...DEFAULT_LONG_FORM_SETTINGS },
  timeline: [],
  isLoading: false,
  isRendering: false,
  renderProgress: 0,
  renderStage: '',
  renderDetail: '',
  error: null,
  selectedSegmentId: null,
  qualityReport: null,

  loadCompilation: async (projectId: string) => {
    set({ isLoading: true, error: null });
    try {
      const compilation = await api.getLongFormCompilation(projectId);
      if (compilation) {
        set({
          compilation,
          settings: compilation.settings || { ...DEFAULT_LONG_FORM_SETTINGS },
          timeline: compilation.timeline || [],
          isRendering: compilation.status === 'rendering',
          renderProgress: compilation.progress || 0,
          renderStage: compilation.stage || '',
          renderDetail: compilation.error ? `Render failed: ${compilation.error}` : (compilation.stage || ''),
          error: compilation.error || null,
          qualityReport: compilation.qualityReport || null,
          selectedSegmentId: compilation.timeline?.[0]?.id || null,
        });
      }
    } catch (err: any) {
      set({ error: err.message });
    } finally {
      set({ isLoading: false });
    }
  },

  generateTimeline: async (projectId: string, req?: GenerateTimelineRequest) => {
    set({ isLoading: true, error: null });
    try {
      const currentSettings = get().settings;
      const compilation = await api.generateLongFormTimeline(projectId, {
        targetDuration: currentSettings.targetDuration,
        customDurationSeconds: currentSettings.customDurationSeconds,
        editStyle: currentSettings.editStyle,
        safeEdgeCleanup: currentSettings.safeEdgeCleanup,
        maxScaleFactor: currentSettings.maxScaleFactor,
        smartScaling: currentSettings.smartScaling,
        captionsEnabled: currentSettings.captionsEnabled,
        transitionType: currentSettings.transitionType,
        audioEnhancement: currentSettings.audioEnhancement,
        includeIntro: currentSettings.includeIntro,
        introTitle: currentSettings.introTitle,
        includeOutro: currentSettings.includeOutro,
        ...req,
      });

      set({
        compilation,
        settings: compilation.settings,
        timeline: compilation.timeline,
        qualityReport: compilation.qualityReport || null,
        selectedSegmentId: compilation.timeline?.[0]?.id || null,
      });
    } catch (err: any) {
      set({ error: err.message });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  updateTimeline: async (segments: TimelineSegment[]) => {
    const { compilation } = get();
    set({ timeline: segments });
    if (!compilation) return;

    try {
      const updated = await api.updateLongFormTimeline(compilation.id, {
        timeline: segments,
      });
      set({ compilation: updated });
    } catch (err: any) {
      console.error('Failed to sync timeline update:', err);
    }
  },

  updateSettings: async (partial: Partial<LongFormSettings>) => {
    const current = get().settings;
    const updated = { ...current, ...partial };
    set({ settings: updated });

    const { compilation } = get();
    if (compilation) {
      try {
        const res = await api.updateLongFormTimeline(compilation.id, {
          settings: updated,
        });
        set({ compilation: res });
      } catch (err) {
        console.error('Failed to save settings:', err);
      }
    }
  },

  toggleSegment: async (segmentId: string) => {
    const { timeline, updateTimeline } = get();
    const updated = timeline.map(s => {
      if (s.id === segmentId) {
        return { ...s, isEnabled: s.isEnabled === false ? true : false };
      }
      return s;
    });
    await updateTimeline(updated);
  },

  reorderSegments: async (sourceIndex: number, destIndex: number) => {
    const { timeline, updateTimeline } = get();
    const copy = [...timeline];
    const [moved] = copy.splice(sourceIndex, 1);
    copy.splice(destIndex, 0, moved);
    copy.forEach((s, idx) => { s.order = idx + 1; });
    await updateTimeline(copy);
  },

  trimSegment: async (segmentId: string, newStart: number, newEnd: number) => {
    const { timeline, updateTimeline } = get();
    const duration = Math.max(1, newEnd - newStart);
    const updated = timeline.map(s => {
      if (s.id === segmentId) {
        return {
          ...s,
          sourceStart: Number(newStart.toFixed(2)),
          sourceEnd: Number(newEnd.toFixed(2)),
          duration: Number(duration.toFixed(2)),
        };
      }
      return s;
    });
    await updateTimeline(updated);
  },

  updateSegmentTransition: async (segmentId: string, transition: any) => {
    const { timeline, updateTimeline } = get();
    const updated = timeline.map(s => {
      if (s.id === segmentId) {
        return { ...s, transitionIn: transition, transitionOut: transition };
      }
      return s;
    });
    await updateTimeline(updated);
  },

  renderCompilation: async () => {
    const { compilation } = get();
    if (!compilation) return;

    set({
      isRendering: true,
      renderProgress: 0,
      renderStage: 'initializing',
      renderDetail: 'Initializing 16:9 render engine...',
      error: null,
    });

    try {
      await api.renderLongFormCompilation(compilation.id);

      // Active status polling fallback alongside WebSocket subscription
      const pollTimer = setInterval(async () => {
        try {
          const statusRes = await api.getLongFormStatus(compilation.id);
          if (statusRes) {
            if (statusRes.status === 'rendering') {
              set({
                isRendering: true,
                renderProgress: statusRes.progress || 0,
                renderStage: statusRes.stage || '',
                renderDetail: statusRes.detail || statusRes.stage || '',
              });
            } else if (statusRes.status === 'completed' || statusRes.status === 'failed') {
              clearInterval(pollTimer);
              set({
                isRendering: false,
                renderProgress: statusRes.status === 'completed' ? 100 : 0,
                renderStage: statusRes.status,
                renderDetail: statusRes.error ? `Render failed: ${statusRes.error}` : '',
                error: statusRes.error || null,
              });
              get().loadCompilation(compilation.projectId);
            }
          }
        } catch {
          // Retry on next tick
        }
      }, 2000);
    } catch (err: any) {
      set({ isRendering: false, error: err.message });
      throw err;
    }
  },

  downloadCompilation: async () => {
    const { compilation } = get();
    if (!compilation) return;
    await api.downloadLongFormCompilation(compilation.id, `${compilation.title || 'compilation'}.mp4`);
  },

  setSelectedSegmentId: (id: string | null) => {
    set({ selectedSegmentId: id });
  },

  listenToLongFormUpdates: (projectId: string) => {
    wsService.connect(projectId);
    return wsService.subscribe((msg: WSMessage) => {
      if (msg.type === 'longform_progress') {
        const payload = (msg as WSLongFormProgress).payload;
        set({
          isRendering: payload.status === 'rendering',
          renderProgress: payload.progress,
          renderStage: payload.stage,
          renderDetail: payload.detail || '',
          error: payload.status === 'failed' ? (payload.detail || 'Rendering failed') : null,
        });

        if (payload.status === 'completed' || payload.status === 'failed') {
          // Re-fetch latest compilation details
          get().loadCompilation(projectId);
        }
      }
    });
  },

  reset: () => {
    set({
      compilation: null,
      settings: { ...DEFAULT_LONG_FORM_SETTINGS },
      timeline: [],
      isLoading: false,
      isRendering: false,
      renderProgress: 0,
      renderStage: '',
      renderDetail: '',
      error: null,
      selectedSegmentId: null,
      qualityReport: null,
    });
  },
}));
