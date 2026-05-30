import { useEffect } from 'react';
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

  useEffect(() => {
    if (settings?.primary_color) {
      document.documentElement.style.setProperty('--color-primary', settings.primary_color);
      
      // Also derive a lighter version for hover states using a simple opacity approach
      // or we can just let Tailwind use /80 on bg-primary. 
      // The old light color #8052b2 was used. We can just rely on Tailwind's /80 opacity modifier 
      // which we already changed in the replace script.
    }
  }, [settings?.primary_color]);

  return { 
    settings, 
    isLoading,
    logoUrl: settings?.logo_url ?? null,
    companyName: settings?.company_name ?? null
  };
}
