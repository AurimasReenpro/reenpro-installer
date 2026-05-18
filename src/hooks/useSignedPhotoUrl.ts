import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useSignedPhotoUrl(storage_path: string | undefined) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['signed-url', storage_path],
    queryFn: async () => {
      if (!storage_path) return null;
      const { data, error } = await supabase.storage
        .from('site-photos')
        .createSignedUrl(storage_path, 3600);

      if (error) throw error;
      return data?.signedUrl || null;
    },
    staleTime: 50 * 60 * 1000, // 50 minutes
    retry: 1,
    enabled: !!storage_path,
  });

  return { url: data, isLoading, error };
}
