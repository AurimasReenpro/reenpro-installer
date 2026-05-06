import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';

export function useAuth() {
  const { user, profile, loading, setUser, setLoading, signOut } = useAuthStore();

  useEffect(() => {
    async function fetchProfile(authUser: any) {
      try {
        const { data: profileData, error } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', authUser.id)
          .single();

        if (error) {
          console.error('Error fetching profile:', error);
          // Still set user even if profile fails, to avoid infinite loading
          setUser(authUser, null);
          return;
        }

        setUser(authUser, profileData);
      } catch (err) {
        console.error('Unexpected error fetching profile:', err);
        setUser(authUser, null);
      }
    }

    // Check active session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        fetchProfile(session.user);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          fetchProfile(session.user);
        } else if (event === 'SIGNED_OUT') {
          signOut();
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [setUser, setLoading, signOut]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  return { user, profile, loading, signOut: handleSignOut };
}
