import { useContext } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { SignedUrlContext } from '../context/signedUrlContext';
import { useSignedPhotoUrl } from './useSignedPhotoUrl';

const SIGNED_URL_TTL_SECONDS = 60 * 60;       // 60 min — bucket signed-URL expiry
const STALE_TIME_MS = 50 * 60 * 1000;         // 50 min — refetch before it expires

interface ResolvedSignedUrl {
  url: string | null | undefined;
  isLoading: boolean;
  error: unknown;
}

/**
 * Batch-signs many storage paths in a SINGLE request. The cache key is the
 * sorted, de-duped path list so render order never changes the key and two
 * trees with the same photos share one cached result. Returns a
 * Map<storage_path, signedUrl>.
 */
export function useSignedPhotoUrls(paths: string[]) {
  const sorted = Array.from(new Set(paths.filter(Boolean))).sort();
  const key = sorted.join('|');

  return useQuery({
    queryKey: ['signed-urls-batch', key],
    queryFn: async () => {
      const map = new Map<string, string>();
      if (sorted.length === 0) return map;

      const { data, error } = await supabase.storage
        .from('site-photos')
        .createSignedUrls(sorted, SIGNED_URL_TTL_SECONDS);

      if (error) throw error;
      for (const item of data ?? []) {
        if (item.path && item.signedUrl) map.set(item.path, item.signedUrl);
      }
      return map;
    },
    enabled: sorted.length > 0,
    staleTime: STALE_TIME_MS,
  });
}

/**
 * Resolves a single signed URL. When a SignedPhotoUrlProvider is present, reads
 * from its batched map (zero extra requests); otherwise falls back to a per-path
 * signed-URL request. This lets <SignedPhoto> keep its existing public API.
 */
export function useResolvedSignedUrl(storage_path: string | undefined): ResolvedSignedUrl {
  const ctx = useContext(SignedUrlContext);
  // Disable the per-path request entirely when a batch provider is supplying URLs.
  const single = useSignedPhotoUrl(ctx ? undefined : storage_path);

  if (ctx) {
    const url = storage_path ? ctx.map.get(storage_path) ?? null : null;
    return {
      url,
      isLoading: ctx.isLoading && !url,
      error: !ctx.isLoading && !url ? new Error('Signed URL not found in batch') : null,
    };
  }
  return single;
}
