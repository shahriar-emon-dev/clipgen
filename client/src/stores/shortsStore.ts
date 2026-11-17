import { create } from 'zustand';
import { api } from '../services/api.js';
import { wsService } from '../services/websocket.js';
import type {
  HighlightCandidate,
  Short,
  Transcript,
  GenerateShortRequest,
  UpdateShortRequest,
  UpdateHighlightRequest,
  AudioWaveformData,
  CaptionStyle,
  ReframeMode,
  CopyrightCheck,
} from '@shared/types.js';

export const DEFAULT_CAPTION_STYLE: CaptionStyle = {
  fontFamily: 'Outfit, sans-serif',
  fontSize: 28,
  fontColor: '#FFFFFF',
  backgroundColor: '#000000',
  backgroundOpacity: 0.8,
  outlineColor: '#000000',
  outlineWidth: 3,
  position: 'bottom',
  maxWordsPerLine: 3,
  uppercase: true,
};

interface ShortsStore {
  highlights: HighlightCandidate[];
  currentHighlightIndex: number;
  shorts: Short[];
  transcript: Transcript | null;
  copyright: CopyrightCheck | null;
  waveform: AudioWaveformData | null;
  selectedHighlight: HighlightCandidate | null;
  activeShort: Short | null;
  activeReviewMode: boolean;
  captionsEnabled: boolean;
  captionStyle: CaptionStyle;
  reframeMode: ReframeMode;
  loading: boolean;
  waveformLoading: boolean;
  generatingShortId: string | null;
  isBatchExporting: boolean;
  batchExportTotal: number;
  batchExportProgress: number;
  asIsExportingId: string | null;
  isBatchExportingAsIs: boolean;
  exportedAsIsIds: Set<string>;
  isDownloadingZip: 'asis' | 'shorts' | null;
  error: string | null;

  loadHighlights: (projectId: string, all?: boolean) => Promise<void>;
  loadShorts: (projectId: string) => Promise<void>;
  loadTranscript: (projectId: string) => Promise<void>;
  loadCopyright: (projectId: string) => Promise<void>;
  loadWaveform: (projectId: string) => Promise<void>;
  generateShort: (highlightId: string, req?: Partial<GenerateShortRequest>) => Promise<Short>;
  generateAllShorts: (projectId: string, req?: Partial<GenerateShortRequest>) => Promise<void>;
  downloadShort: (shortId: string, filename?: string) => Promise<void>;
  downloadAllShorts: (projectId: string, explicitShortIds?: string[]) => Promise<void>;
  exportHighlightAsIs: (highlightId: string) => Promise<void>;
  downloadHighlightAsIs: (highlightId: string, filename?: string) => Promise<void>;
  exportAllHighlightsAsIs: (projectId: string) => Promise<void>;
  downloadAllHighlightsAsIs: (projectId: string, explicitHighlightIds?: string[]) => Promise<void>;
  listenToShortsUpdates: (projectId: string) => () => void;
  updateShort: (id: string, req: UpdateShortRequest) => Promise<void>;
  deleteShort: (id: string) => Promise<void>;
  exportShort: (id: string) => Promise<void>;
  updateHighlightCandidate: (id: string, req: UpdateHighlightRequest) => Promise<void>;
  autoFrameHighlight: (id: string) => Promise<HighlightCandidate>;
  deleteHighlightCandidate: (id: string) => Promise<void>;
  selectHighlight: (highlight: HighlightCandidate | null) => void;
  setCurrentHighlightIndex: (index: number) => void;
  nextHighlight: () => void;
  previousHighlight: () => void;
  setActiveShort: (short: Short | null) => void;
  setActiveReviewMode: (active: boolean) => void;
  setCaptionsEnabled: (enabled: boolean) => void;
  setCaptionStyle: (style: Partial<CaptionStyle>) => void;
  setReframeMode: (mode: ReframeMode) => void;
  setError: (error: string | null) => void;
}

export const useShortsStore = create<ShortsStore>((set, get) => ({
  highlights: [],
  currentHighlightIndex: 0,
  shorts: [],
  transcript: null,
  copyright: null,
  waveform: null,
  selectedHighlight: null,
  activeShort: null,
  activeReviewMode: false,
  captionsEnabled: true,
  captionStyle: DEFAULT_CAPTION_STYLE,
  reframeMode: 'center',
  loading: false,
  waveformLoading: false,
  generatingShortId: null,
  isBatchExporting: false,
  batchExportTotal: 0,
  batchExportProgress: 0,
  asIsExportingId: null,
  isBatchExportingAsIs: false,
  exportedAsIsIds: new Set<string>(),
  isDownloadingZip: null,
  error: null,

  loadHighlights: async (projectId: string, all = false) => {
    set({ loading: true, error: null });
    try {
      const highlights = await api.getHighlights(projectId, all);
      const currentIdx = get().currentHighlightIndex;
      const validIdx = Math.min(currentIdx, Math.max(0, highlights.length - 1));
      set({
        highlights,
        loading: false,
        selectedHighlight: highlights[validIdx] || null,
        currentHighlightIndex: validIdx,
      });
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  loadShorts: async (projectId: string) => {
    try {
      const shorts = await api.getShorts(projectId);
      set({ shorts });
    } catch (err: any) {
      console.warn('Failed to load shorts:', err);
    }
  },

  loadTranscript: async (projectId: string) => {
    try {
      const transcript = await api.getTranscript(projectId);
      set({ transcript });
    } catch (err: any) {
      console.warn('Failed to load transcript:', err);
    }
  },

  loadCopyright: async (projectId: string) => {
    try {
      const copyright = await api.getCopyrightCheck(projectId);
      set({ copyright });
    } catch (err: any) {
      console.warn('Failed to load copyright check:', err);
    }
  },

  loadWaveform: async (projectId: string) => {
    set({ waveformLoading: true });
    try {
      const waveform = await api.getWaveform(projectId);
      set({ waveform, waveformLoading: false });
    } catch (err: any) {
      console.warn('Failed to load waveform:', err);
      set({ waveformLoading: false });
    }
  },

  generateShort: async (highlightId: string, req) => {
    set({ generatingShortId: highlightId, error: null });
    try {
      const short = await api.generateShort(highlightId, req);
      set((s) => ({
        shorts: [short, ...s.shorts],
        activeShort: short,
        generatingShortId: null,
      }));
      return short;
    } catch (err: any) {
      set({ generatingShortId: null, error: err.message });
      throw err;
    }
  },

  generateAllShorts: async (projectId: string, req) => {
    set({ isBatchExporting: true, error: null });
    try {
      const res = await api.generateAllShorts(projectId, req);
      const latestShorts = await api.getShorts(projectId);
      const completedCount = latestShorts.filter((sh) => sh.status === 'completed').length;
      set({
        shorts: latestShorts,
        batchExportTotal: res.total,
        batchExportProgress:
          res.total > 0 ? Math.round((completedCount / res.total) * 100) : 0,
        isBatchExporting: res.queued > 0,
      });
    } catch (err: any) {
      set({ isBatchExporting: false, error: err.message });
      throw err;
    }
  },

  downloadShort: async (shortId: string, filename?: string) => {
    try {
      await api.downloadShort(shortId, filename);
    } catch (err: any) {
      set({ error: err.message });
      throw err;
    }
  },

  downloadAllShorts: async (projectId: string, explicitShortIds?: string[]) => {
    set({ isDownloadingZip: 'shorts', error: null });
    try {
      let shortIds = explicitShortIds;
      if (!shortIds || shortIds.length === 0) {
        // Collect exact completed unique short IDs from current view in order
        const state = get();
        const seen = new Set<string>();
        const orderedIds: string[] = [];

        // 1. Follow highlight order from current state
        if (state.highlights && state.highlights.length > 0) {
          for (const h of state.highlights) {
            const match = state.shorts.find(
              (s) =>
                (s.highlightId === h.id ||
                  (Math.abs(s.startTime - h.startTime) < 2 && Math.abs(s.endTime - h.endTime) < 2)) &&
                s.status === 'completed' &&
                s.filePath
            );
            if (match && !seen.has(match.id)) {
              seen.add(match.id);
              orderedIds.push(match.id);
            }
          }
        }

        // 2. Append any other completed shorts
        for (const s of state.shorts) {
          if (s.status === 'completed' && s.filePath && !seen.has(s.id)) {
            seen.add(s.id);
            orderedIds.push(s.id);
          }
        }

        shortIds = orderedIds;
      }

      await api.downloadAllShorts(projectId, shortIds);
      set({ isDownloadingZip: null });
    } catch (err: any) {
      set({ isDownloadingZip: null, error: err.message });
      throw err;
    }
  },

  exportHighlightAsIs: async (highlightId: string) => {
    set({ asIsExportingId: highlightId, error: null });
    try {
      await api.exportHighlightAsIs(highlightId);
      set((s) => {
        const nextSet = new Set(s.exportedAsIsIds);
        nextSet.add(highlightId);
        return { asIsExportingId: null, exportedAsIsIds: nextSet };
      });
    } catch (err: any) {
      set({ asIsExportingId: null, error: err.message });
      throw err;
    }
  },

  downloadHighlightAsIs: async (highlightId: string, filename?: string) => {
    try {
      await api.downloadHighlightAsIs(highlightId, filename);
      set((s) => {
        const nextSet = new Set(s.exportedAsIsIds);
        nextSet.add(highlightId);
        return { exportedAsIsIds: nextSet };
      });
    } catch (err: any) {
      set({ error: err.message });
      throw err;
    }
  },

  exportAllHighlightsAsIs: async (projectId: string) => {
    set({ isBatchExportingAsIs: true, error: null });
    try {
      await api.exportAllHighlightsAsIs(projectId);
      const allIds = get().highlights.map((h) => h.id);
      set({
        isBatchExportingAsIs: false,
        exportedAsIsIds: new Set(allIds),
      });
    } catch (err: any) {
      set({ isBatchExportingAsIs: false, error: err.message });
      throw err;
    }
  },

  downloadAllHighlightsAsIs: async (projectId: string, explicitHighlightIds?: string[]) => {
    set({ isDownloadingZip: 'asis', error: null });
    try {
      const state = get();
      const highlightIds = explicitHighlightIds || state.highlights.map((h) => h.id);
      await api.downloadAllHighlightsAsIs(projectId, highlightIds);
      set({ isDownloadingZip: null });
    } catch (err: any) {
      set({ isDownloadingZip: null, error: err.message });
      throw err;
    }
  },

  listenToShortsUpdates: (projectId: string) => {
    wsService.connect(projectId);

    const unsubscribe = wsService.subscribe((msg: any) => {
      if (msg.type === 'short_progress') {
        const { shortId, progress, status } = msg.payload;

        if (status === 'completed') {
          get().loadShorts(projectId);
        }

        set((s) => {
          const updatedShorts = s.shorts.map((sh) =>
            sh.id === shortId ? { ...sh, renderProgress: progress, status } : sh
          );
          const completedCount = updatedShorts.filter((sh) => sh.status === 'completed').length;
          const targetTotal = s.batchExportTotal > 0 ? s.batchExportTotal : s.highlights.length;
          const isDone = targetTotal > 0 && completedCount >= targetTotal;
          return {
            shorts: updatedShorts,
            isBatchExporting: isDone ? false : s.isBatchExporting,
            batchExportProgress:
              targetTotal > 0
                ? Math.round((completedCount / targetTotal) * 100)
                : 0,
          };
        });
      }
    });

    return () => {
      unsubscribe();
    };
  },

  updateShort: async (id: string, req: UpdateShortRequest) => {
    try {
      const updated = await api.updateShort(id, req);
      set((s) => ({
        shorts: s.shorts.map((sh) => (sh.id === id ? updated : sh)),
        activeShort: s.activeShort?.id === id ? updated : s.activeShort,
      }));
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  deleteShort: async (id: string) => {
    try {
      await api.deleteShort(id);
      set((s) => ({
        shorts: s.shorts.filter((sh) => sh.id !== id),
        activeShort: s.activeShort?.id === id ? null : s.activeShort,
      }));
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  exportShort: async (id: string) => {
    try {
      await api.exportShort(id);
      set((s) => ({
        shorts: s.shorts.map((sh) => (sh.id === id ? { ...sh, status: 'rendering', renderProgress: 0 } : sh)),
        activeShort: s.activeShort?.id === id ? { ...s.activeShort, status: 'rendering', renderProgress: 0 } : s.activeShort,
      }));
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  updateHighlightCandidate: async (id: string, req: UpdateHighlightRequest) => {
    try {
      const updated = await api.updateHighlight(id, req);
      set((s) => ({
        highlights: s.highlights.map((h) => (h.id === id ? updated : h)),
        selectedHighlight: s.selectedHighlight?.id === id ? updated : s.selectedHighlight,
      }));
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  autoFrameHighlight: async (id: string) => {
    try {
      const updated = await api.autoFrameHighlight(id);
      set((s) => ({
        highlights: s.highlights.map((h) => (h.id === id ? updated : h)),
        selectedHighlight: s.selectedHighlight?.id === id ? updated : s.selectedHighlight,
      }));
      return updated;
    } catch (err: any) {
      set({ error: err.message });
      throw err;
    }
  },

  deleteHighlightCandidate: async (id: string) => {
    try {
      await api.deleteHighlight(id);
      const newHighlights = get().highlights.filter((h) => h.id !== id);
      const currentIdx = get().currentHighlightIndex;
      const nextIdx = Math.min(currentIdx, Math.max(0, newHighlights.length - 1));
      set({
        highlights: newHighlights,
        currentHighlightIndex: nextIdx,
        selectedHighlight: newHighlights[nextIdx] || null,
      });
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  selectHighlight: (highlight) => {
    const list = get().highlights;
    const idx = highlight ? list.findIndex((h) => h.id === highlight.id) : 0;
    set({
      selectedHighlight: highlight,
      currentHighlightIndex: idx >= 0 ? idx : 0,
    });
  },

  setCurrentHighlightIndex: (index) => {
    const list = get().highlights;
    if (index >= 0 && index < list.length) {
      set({
        currentHighlightIndex: index,
        selectedHighlight: list[index],
      });
    }
  },

  nextHighlight: () => {
    const { highlights, currentHighlightIndex } = get();
    if (highlights.length === 0) return;
    const nextIdx = (currentHighlightIndex + 1) % highlights.length;
    set({
      currentHighlightIndex: nextIdx,
      selectedHighlight: highlights[nextIdx],
    });
  },

  previousHighlight: () => {
    const { highlights, currentHighlightIndex } = get();
    if (highlights.length === 0) return;
    const prevIdx = (currentHighlightIndex - 1 + highlights.length) % highlights.length;
    set({
      currentHighlightIndex: prevIdx,
      selectedHighlight: highlights[prevIdx],
    });
  },

  setActiveShort: (activeShort) => set({ activeShort }),
  setActiveReviewMode: (activeReviewMode) => set({ activeReviewMode }),
  setCaptionsEnabled: (captionsEnabled) => set({ captionsEnabled }),
  setCaptionStyle: (style) => set((s) => ({ captionStyle: { ...s.captionStyle, ...style } })),
  setReframeMode: (reframeMode) => set({ reframeMode }),
  setError: (error) => set({ error }),
}));

