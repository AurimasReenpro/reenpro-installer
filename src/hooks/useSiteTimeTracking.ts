import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { startWork, pauseWork, completeWork, resumeWork } from '../api/timeTracking';
import { getCurrentPositionWithTimeout } from '../lib/geolocation';
import * as Sentry from '@sentry/react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { SiteDetailData } from '../types/site.types';

export function useSiteTimeTracking(siteId: string, site: SiteDetailData | undefined, profileId: string | undefined) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [isActionPending, setIsActionPending] = useState(false);

  const handleCheckIn = async () => {
    if (!profileId || !site?.id) return;
    
    setIsCheckingIn(true);
    try {
      const pos = await getCurrentPositionWithTimeout(10000);
      await startWork(site.id, pos?.lat, pos?.lng);
      void queryClient.invalidateQueries({ queryKey: ['site', siteId] });
      void queryClient.invalidateQueries({ queryKey: ['admin_dashboard_stats'] });
      void queryClient.invalidateQueries({ queryKey: ['admin_active_sites_online'] });
      void queryClient.invalidateQueries({ queryKey: ['admin_activity_feed'] });
    } catch (error) {
      console.error('Check-in error:', error);
      Sentry.captureException(error, { extra: { context: 'Check-in error:' } });
      toast.error('Klaida pradedant darbą.');
    } finally {
      setIsCheckingIn(false);
    }
  };

  const handleResume = async () => {
    if (!profileId || !site?.id || isActionPending) return;
    setIsActionPending(true);
    try {
      const pos = await getCurrentPositionWithTimeout(10000);
      await resumeWork(site.id, pos?.lat, pos?.lng);
      void queryClient.invalidateQueries({ queryKey: ['site', siteId] });
      void queryClient.invalidateQueries({ queryKey: ['my-sites-today'] });
      void queryClient.invalidateQueries({ queryKey: ['admin_dashboard_stats'] });
      void queryClient.invalidateQueries({ queryKey: ['admin_active_sites_online'] });
      void queryClient.invalidateQueries({ queryKey: ['admin_activity_feed'] });
    } catch (error) {
      console.error('Resume error:', error);
      Sentry.captureException(error, { extra: { context: 'Resume error:' } });
      toast.error('Klaida pratęsiant darbą.');
    } finally {
      setIsActionPending(false);
    }
  };

  const handlePause = async () => {
    if (!profileId || !site?.id || isActionPending) return;
    setIsActionPending(true);
    try {
      await pauseWork(site.id);
      void queryClient.invalidateQueries({ queryKey: ['site', siteId] });
      void queryClient.invalidateQueries({ queryKey: ['my-sites-today'] });
      void queryClient.invalidateQueries({ queryKey: ['admin_dashboard_stats'] });
      void queryClient.invalidateQueries({ queryKey: ['admin_active_sites_online'] });
      void queryClient.invalidateQueries({ queryKey: ['admin_activity_feed'] });
    } catch (error) {
      console.error('Pause error:', error);
      Sentry.captureException(error, { extra: { context: 'Pause error:' } });
      toast.error('Įvyko klaida stabdant laiką.');
    } finally {
      setIsActionPending(false);
    }
  };

  const handleComplete = async () => {
    if (!profileId || !site?.id || isActionPending) return;

    setIsActionPending(true);
    try {
      await completeWork(site.id);
      void queryClient.invalidateQueries({ queryKey: ['site', siteId] });
      void queryClient.invalidateQueries({ queryKey: ['my-sites-today'] });
      void queryClient.invalidateQueries({ queryKey: ['admin_activity_feed'] });
      void queryClient.invalidateQueries({ queryKey: ['admin_dashboard_stats'] });
      void queryClient.invalidateQueries({ queryKey: ['admin_active_sites_online'] });
      void navigate('/m'); // Return to today's list
    } catch (error) {
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
