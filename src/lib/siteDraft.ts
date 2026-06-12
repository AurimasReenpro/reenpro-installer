// A "draft" site is a freshly blank-slate-created record that hasn't been filled
// in yet. We detect it from data completeness rather than a dedicated DB status:
// the placeholder client name is still set, OR the address is empty.

export const DRAFT_CLIENT_NAME = 'Naujas Objektas';

export function isSiteDraft(site: {
  client_name?: string | null;
  address?: string | null;
}): boolean {
  return (
    site.client_name === DRAFT_CLIENT_NAME ||
    !site.address ||
    site.address.trim() === ''
  );
}
