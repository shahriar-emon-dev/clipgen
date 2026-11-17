// ============================================================
// Processing Store — Real-time Pipeline Execution & Logs
// ============================================================

import { create } from 'zustand';
import { api } from '../services/api.js';
import { wsService } from '../services/websocket.js';
import type { ProcessingJob, ProcessingStage, ProcessingLog, WSMessage } from '@shared/types.js';

interface ProcessingStore {
  job: ProcessingJob | null;
  currentStage: ProcessingStage | null;
  progress: number;
  stageProgress: number;
  stageDetail: string;
  message: string;
  stagesCompleted: ProcessingStage[];
  isProcessing: boolean;
  logs: ProcessingLog[];
  loading: boolean;
  error: string | null;

  startProcessing: (projectId: string, preferredFramingMode?: 'blur_fill' | 'action') => Promise<void>;
  checkStatus: (projectId: string) => Promise<void>;
  cancelProcessing: (projectId: string) => Promise<void>;
  loadLogs: (projectId: string) => Promise<void>;
  listenToUpdates: (projectId: string) => () => void;
  reset: () => void;
}

export const useProcessingStore = create<ProcessingStore>((set, get) => ({
  job: null,
  currentStage: null,
  progress: 0,
  stageProgress: 0,
  stageDetail: '',
  message: '',
  stagesCompleted: [],
  isProcessing: false,
  logs: [],
  loading: false,
  error: null,

  startProcessing: async (projectId: string, preferredFramingMode: 'blur_fill' | 'action' = 'blur_fill') => {
    set({
      isProcessing: true,
      progress: 0,
      stageProgress: 0,
      stageDetail: '',
      error: null,
      message: 'Initializing pipeline...',
    });
    try {
      await api.startProcessing(projectId, preferredFramingMode);
      await get().checkStatus(projectId);
    } catch (err: any) {
      set({ isProcessing: false, error: err.message });
      throw err;
    }
  },

  checkStatus: async (projectId: string) => {
    try {
      const job = await api.getProcessingStatus(projectId);
      if (job) {
        set({
          job,
          currentStage: job.currentStage,
          progress: job.progress,
          stageProgress: job.stageProgress || 0,
          stageDetail: job.stageDetail || '',
          stagesCompleted: job.stagesCompleted,
          isProcessing: job.status === 'running' || job.status === 'pending',
          error: job.error,
        });
      }
    } catch (err: any) {
      console.warn('Failed to check status:', err);
    }
  },

  cancelProcessing: async (projectId: string) => {
    try {
      await api.cancelProcessing(projectId);
      set({ isProcessing: false, message: 'Processing cancelled' });
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  loadLogs: async (projectId: string) => {
    try {
      const logs = await api.getLogs(projectId);
      set({ logs });
    } catch (err: any) {
      console.warn('Failed to load logs:', err);
    }
  },

  listenToUpdates: (projectId: string) => {
    wsService.connect(projectId);

    const unsubscribe = wsService.subscribe((msg: WSMessage) => {
      if (msg.type === 'processing_update') {
        const update = msg.payload as any;
        set({
          currentStage: update.stage,
          progress: update.progress,
          stageProgress: update.stageProgress ?? 0,
          stageDetail: update.stageDetail ?? '',
          message: update.message,
          stagesCompleted: update.stagesCompleted,
          isProcessing: update.stage !== 'completed' && update.stage !== 'failed',
        });

        if (update.stage === 'completed') {
          // Re-fetch project/highlights
          get().loadLogs(projectId);
        }
      }
    });

    return () => {
      unsubscribe();
      wsService.disconnect();
    };
  },

  reset: () => {
    set({
      job: null,
      currentStage: null,
      progress: 0,
      stageProgress: 0,
      stageDetail: '',
      message: '',
      stagesCompleted: [],
      isProcessing: false,
      logs: [],
      error: null,
    });
  },
}));
