import { useQuery } from '@tanstack/react-query';
import * as Sentry from '@sentry/react';
import { getCompanySettings } from '../api/settings';

export function useBranding() {
  const { data: settings, isLoading } = useQuery({
    queryKey: ['company_settings'],
    queryFn: async () => {
      try {
        return await getCompanySettings();
      } catch (err) {
        Sentry.captureException(err, { extra: { context: 'fetch branding' } });
        throw err;
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Note: the company "primary color" override was removed — the Copper Mist
  // theme owns --color-primary via design tokens (src/index.css). Branding now
  // only supplies the logo + company name.

  return {
    settings, 
    isLoading,
    logoUrl: settings?.logo_url ?? null,
    companyName: settings?.company_name ?? null
  };
}
