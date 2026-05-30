import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import type { User } from '@supabase/supabase-js';
import * as Sentry from "@sentry/react";
import { toast } from 'sonner';
import { useSyncStore } from '../stores/useSyncStore';

export function useAuth() {
  const { user, profile, loading, setUser, setLoading, signOut } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    async function fetchProfile(authUser: User) {
      try {
        const { data: profileData, error } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', authUser.id)
          .single();

        if (error) {
          console.error('Error fetching profile:', error); Sentry.captureException(error, { extra: { context: 'Error fetching profile:' } });
          // Still set user even if profile fails, to avoid infinite loading
          setUser(authUser, null);
          return;
        }

        setUser(authUser, { ...profileData, role: (profileData.role as "admin" | "installer") || "installer" });
      } catch (err) {
        console.error('Unexpected error fetching profile:', err); Sentry.captureException(err, { extra: { context: 'Unexpected error fetching profile:' } });
        setUser(authUser, null);
      }
    }

    // Check active session on mount
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        void fetchProfile(session.user);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes.
    // IMPORTANT: this callback runs INSIDE GoTrue's auth lock (navigator.locks).
    // Calling another Supabase method (e.g. .from().select(), which needs the
    // access token) directly here re-acquires the same lock and deadlocks —
    // signInWithPassword then never resolves (UI stuck on "Jungiamasi...").
    // Deferring with setTimeout(…, 0) runs the profile fetch AFTER the lock is
    // released. See https://supabase.com/docs/reference/javascript/auth-onauthstatechange
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          const authUser = session.user;
          setTimeout(() => { void fetchProfile(authUser); }, 0);
        } else if (event === 'SIGNED_OUT') {
          signOut();
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [setUser, setLoading, signOut]);

  const handleLogout = async () => {
    const isSyncing = useSyncStore.getState().isSyncing;
    if (isSyncing) {
      toast.error('Palaukite, dar keliami failai! Atsijungus duomenys bus prarasti.');
      return;
    }

    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error('Logout error during supabase signOut:', error);
      Sentry.captureException(error, { extra: { context: 'Logout error during supabase signOut:' } });
    } finally {
      queryClient.clear();
      signOut();
      toast.success("Sėkmingai atsijungėte");
      void navigate('/login', { replace: true });
    }
  };

  return { user, profile, loading, logout: handleLogout };
}
