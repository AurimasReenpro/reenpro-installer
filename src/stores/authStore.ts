import { create } from 'zustand';
import type { User } from '@supabase/supabase-js';

export interface UserProfile {
  id: string;
  email: string | null;
  full_name: string | null;
  role: 'admin' | 'installer';
  hourly_rate: number | null;
  phone: string | null;
  avatar_url: string | null;
}

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  setUser: (user: User | null, profile: UserProfile | null) => void;
  setLoading: (loading: boolean) => void;
  signOut: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  profile: null,
  loading: true,
  setUser: (user, profile) => set({ user, profile, loading: false }),
  setLoading: (loading) => set({ loading }),
  signOut: () => set({ user: null, profile: null, loading: false }),
}));
