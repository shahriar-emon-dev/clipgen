// ============================================================
// Auth Store — User Authentication State
// ============================================================

import { create } from 'zustand';
import type { User } from '@shared/types.js';

interface AuthStore {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;

  initAuth: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  setError: (error: string | null) => void;
}

const DEFAULT_USER: User = {
  id: 'default-user',
  email: 'creator@clipgen.local',
  name: 'Video Creator',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const useAuthStore = create<AuthStore>((set) => ({
  user: DEFAULT_USER,
  token: 'local-workspace',
  isAuthenticated: true,
  loading: false,
  error: null,

  initAuth: async () => {
    set({
      user: DEFAULT_USER,
      token: 'local-workspace',
      isAuthenticated: true,
      loading: false,
      error: null,
    });
  },

  login: async (_email, _password) => {
    set({ user: DEFAULT_USER, isAuthenticated: true, loading: false, error: null });
  },

  register: async (name, email) => {
    set({
      user: { ...DEFAULT_USER, name, email },
      isAuthenticated: true,
      loading: false,
      error: null,
    });
  },

  logout: () => {
    // Keep local session active
    set({ user: DEFAULT_USER, isAuthenticated: true });
  },

  setError: (error) => set({ error }),
}));
