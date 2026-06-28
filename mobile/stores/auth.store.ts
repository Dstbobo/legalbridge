import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import type { UserRole } from '@/constants/roles';
// UserRole is now 'legal_professional' | 'general_user'
import { markOnboardedOnServer } from '@/services/auth.service';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  fullName?: string;
  state?: string;       // Nigerian state (Lagos, Abuja, etc.)
  barNumber?: string;   // for lawyers
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  needsOnboarding: boolean;
  setAuth: (user: User, token: string) => Promise<void>;
  completeOnboarding: () => Promise<void>;
  updateProfile: (patch: Partial<User>) => Promise<void>;
  clearAuth: () => Promise<void>;
  loadFromStorage: () => Promise<void>;
}

const TOKEN_KEY      = 'lb_auth_token';
const USER_KEY       = 'lb_user';
const ONBOARDING_KEY = 'lb_needs_onboarding';

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,
  needsOnboarding: false,

  setAuth: async (user, token) => {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
    await SecureStore.setItemAsync(ONBOARDING_KEY, 'true');
    set({ user, token, isAuthenticated: true, needsOnboarding: true });
  },

  completeOnboarding: async () => {
    await SecureStore.deleteItemAsync(ONBOARDING_KEY);
    set({ needsOnboarding: false });
    try { await markOnboardedOnServer(); } catch {}
  },

  updateProfile: async (patch) => {
    const current = get().user;
    if (!current) return;
    const updated: User = { ...current, ...patch };
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(updated));
    set({ user: updated });
  },

  clearAuth: async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
    await SecureStore.deleteItemAsync(ONBOARDING_KEY);
    set({ user: null, token: null, isAuthenticated: false, needsOnboarding: false });
  },

  loadFromStorage: async () => {
    try {
      const [token, userStr, onboardingFlag] = await Promise.all([
        SecureStore.getItemAsync(TOKEN_KEY),
        SecureStore.getItemAsync(USER_KEY),
        SecureStore.getItemAsync(ONBOARDING_KEY),
      ]);
      if (token && userStr) {
        const user: User = JSON.parse(userStr);
        const needsOnboarding = onboardingFlag === 'true';
        set({ user, token, isAuthenticated: true, needsOnboarding, isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },
}));
