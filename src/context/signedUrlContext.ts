import { createContext } from 'react';

// Shared, batched signed-URL lookup. A SignedPhotoUrlProvider higher in the tree
// signs every photo path in ONE request and exposes the results here, so each
// <SignedPhoto> reads its URL from the map instead of firing its own request.
export interface SignedUrlContextValue {
  /** storage_path → signed URL (only present once the batch has resolved). */
  map: Map<string, string>;
  /** True while the batch request is in flight. */
  isLoading: boolean;
}

export const SignedUrlContext = createContext<SignedUrlContextValue | null>(null);
