import { useMemo, type ReactNode } from 'react';
import { SignedUrlContext } from '../context/signedUrlContext';
import { useSignedPhotoUrls } from '../hooks/useSignedPhotoUrls';

// Wrap any subtree that renders a known set of photos. All paths are signed in
// one batched request; descendant <SignedPhoto> components read their URL from
// the shared map instead of each firing its own createSignedUrl call.
export default function SignedPhotoUrlProvider({
  paths,
  children,
}: {
  paths: string[];
  children: ReactNode;
}) {
  const { data, isLoading } = useSignedPhotoUrls(paths);

  const value = useMemo(
    () => ({ map: data ?? new Map<string, string>(), isLoading }),
    [data, isLoading],
  );

  return <SignedUrlContext.Provider value={value}>{children}</SignedUrlContext.Provider>;
}
