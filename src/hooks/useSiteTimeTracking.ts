import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { startWork, pauseWork, completeWork, resumeWork, QcFailedError } from '../api/timeTracking';
import { getCurrentPositionWithTimeout } from '../lib/geolocation';
import * as Sentry from '@sentry/react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { SiteDetailData } from '../types/site.types';

export function useSiteTimeTracking(siteId: string, _site: SiteDetailData | undefined, profileId: string | undefined) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [isActionPending, setIsActionPending] = useState(false);

  const handleCheckIn = async () => {
    if (!profileId || !siteId) return;
    
    setIsCheckingIn(true);
    try {
      let pos = null;
      try {
        pos = await getCurrentPositionWithTimeout(10000);
      } catch (geoError) {
        console.warn('Check-in geolocation warning:', geoError);
      }
      await startWork(siteId, pos?.lat, pos?.lng);
      void queryClient.invalidateQueries({ queryKey: ['site', siteId] });
      void queryClient.invalidateQueries({ queryKey: ['my-sites-today'] });
      void queryClient.invalidateQueries({ queryKey: ['my-sites-all'] });
      void queryClient.invalidateQueries({ queryKey: ['installer_sites'] });
      void queryClient.invalidateQueries({ queryKey: ['admin_dashboard_stats'] });
      void queryClient.invalidateQueries({ queryKey: ['admin_active_sites_online'] });
      void queryClient.invalidateQueries({ queryKey: ['admin_activity_feed'] });
      toast.success('Darbas pradėtas!');
    } catch (error) {
      console.error('Check-in error:', error);
      Sentry.captureException(error, { extra: { context: 'Check-in error:' } });
      toast.error('Klaida pradedant darbą.');
    } finally {
      setIsCheckingIn(false);
    }
  };

  const handleResume = async () => {
    if (!profileId || !siteId || isActionPending) return;
    setIsActionPending(true);
    try {
      let pos = null;
      try {
        pos = await getCurrentPositionWithTimeout(10000);
      } catch (geoError) {
        console.warn('Resume geolocation warning:', geoError);
      }
      await resumeWork(siteId, pos?.lat, pos?.lng);
      void queryClient.invalidateQueries({ queryKey: ['site', siteId] });
      void queryClient.invalidateQueries({ queryKey: ['my-sites-today'] });
      void queryClient.invalidateQueries({ queryKey: ['my-sites-all'] });
      void queryClient.invalidateQueries({ queryKey: ['installer_sites'] });
      void queryClient.invalidateQueries({ queryKey: ['admin_dashboard_stats'] });
      void queryClient.invalidateQueries({ queryKey: ['admin_active_sites_online'] });
      void queryClient.invalidateQueries({ queryKey: ['admin_activity_feed'] });
      toast.success('Darbas pratęstas!');
    } catch (error) {
      console.error('Resume error:', error);
      Sentry.captureException(error, { extra: { context: 'Resume error:' } });
      toast.error('Klaida pratęsiant darbą.');
    } finally {
      setIsActionPending(false);
    }
  };

  const handlePause = async () => {
    if (!profileId || !siteId || isActionPending) return;
    setIsActionPending(true);
    try {
      await pauseWork(siteId);
      void queryClient.invalidateQueries({ queryKey: ['site', siteId] });
      void queryClient.invalidateQueries({ queryKey: ['my-sites-today'] });
      void queryClient.invalidateQueries({ queryKey: ['my-sites-all'] });
      void queryClient.invalidateQueries({ queryKey: ['installer_sites'] });
      void queryClient.invalidateQueries({ queryKey: ['admin_dashboard_stats'] });
      void queryClient.invalidateQueries({ queryKey: ['admin_active_sites_online'] });
      void queryClient.invalidateQueries({ queryKey: ['admin_activity_feed'] });
      toast.success('Darbas pristabdytas!');
    } catch (error) {
      console.error('Pause error:', error);
      Sentry.captureException(error, { extra: { context: 'Pause error:' } });
      toast.error('Įvyko klaida stabdant laiką.');
    } finally {
      setIsActionPending(false);
    }
  };

  const handleComplete = async () => {
    if (!profileId || !siteId || isActionPending) return;

    setIsActionPending(true);
    try {
      await completeWork(siteId);
      void queryClient.invalidateQueries({ queryKey: ['site', siteId] });
      void queryClient.invalidateQueries({ queryKey: ['my-sites-today'] });
      void queryClient.invalidateQueries({ queryKey: ['my-sites-all'] });
      void queryClient.invalidateQueries({ queryKey: ['installer_sites'] });
      void queryClient.invalidateQueries({ queryKey: ['admin_dashboard_stats'] });
      void queryClient.invalidateQueries({ queryKey: ['admin_active_sites_online'] });
      void queryClient.invalidateQueries({ queryKey: ['admin_activity_feed'] });
      toast.success('Montavimo darbai sėkmingai užbaigti!');
      void navigate('/m'); // Return to today's list
    } catch (error) {
      // Server-side QC gate rejected completion (backstop for a bypassed UI gate).
      if (error instanceof QcFailedError) {
        toast.error('Negalima užbaigti: ne visi privalomi punktai atlikti arba trūksta privalomų nuotraukų.');
        return;
      }
      console.error('Complete error:', error);
      Sentry.captureException(error, { extra: { context: 'Complete error:' } });
      toast.error('Įvyko klaida užbaigiant objektą.');
    } finally {
      setIsActionPending(false);
    }
  };

  return {
    isCheckingIn,
    isActionPending,
    handleCheckIn,
    handleResume,
    handlePause,
    handleComplete
  };
}
