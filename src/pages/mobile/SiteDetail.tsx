import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import FullPageSpinner from '../../components/ui/FullPageSpinner';
import LiveTimer from '../../components/mobile/LiveTimer';

export default function SiteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuthStore();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('Apžvalga');
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [uploadingCheckId, setUploadingCheckId] = useState<string | null>(null);

  const { data: site, isLoading } = useQuery({
    queryKey: ['site', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sites')
        .select('*, site_assignments(*, user_profiles(full_name)), time_entries(*), site_checklists(*), photos(*)')
        .eq('id', id as string)
        .single();
      if (error) throw error;
      return data as any;
    },
    enabled: !!id,
  });

  // Timer is now handled by LiveTimer component

  const handleCheckIn = async () => {
    if (!profile?.id || !site?.id) return;
    
    setIsCheckingIn(true);
    try {
      // 1. Get GPS Coords
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        });
      });

      const startLat = pos.coords.latitude;
      const startLng = pos.coords.longitude;
      const startTime = new Date().toISOString();

      // Close any hanging open sessions to prevent duplicate ticking
      await (supabase
        .from('time_entries') as any)
        .update({ end_time: new Date().toISOString() })
        .eq('site_id', site.id)
        .eq('installer_id', profile?.id)
        .is('end_time', null);

      // 2. Insert into time_entries
      const { error: timeError } = await (supabase
        .from('time_entries') as any)
        .insert({
          site_id: site.id,
          installer_id: profile.id,
          start_time: startTime,
          start_lat: startLat,
          start_lng: startLng,
        });

      if (timeError) throw timeError;

      // 3. Update sites table
      const { error: siteError } = await (supabase
        .from('sites') as any)
        .update({
          status: 'in_progress',
          actual_start: startTime,
        })
        .eq('id', site.id);

      if (siteError) throw siteError;

      // 4. Refresh data
      await queryClient.invalidateQueries({ queryKey: ['site', id] });
      
    } catch (error) {
      console.error('Check-in error:', error);
      alert('Klaida gaunant lokaciją arba išsaugant duomenis.');
    } finally {
      setIsCheckingIn(false);
    }
  };

  const handleResume = async () => {
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => 
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 })
      );
      
      // Close any hanging open sessions to prevent duplicate ticking
      await (supabase
        .from('time_entries') as any)
        .update({ end_time: new Date().toISOString() })
        .eq('site_id', site.id)
        .eq('installer_id', profile?.id)
        .is('end_time', null);

      // Insert new time entry segment (DO NOT overwrite actual_start on the site)
      await (supabase.from('time_entries') as any).insert({
        site_id: site.id,
        installer_id: profile?.id,
        start_time: new Date().toISOString(),
        start_lat: pos.coords.latitude,
        start_lng: pos.coords.longitude,
      });

      // Update status to in_progress
      await (supabase.from('sites') as any).update({ status: 'in_progress' }).eq('id', site.id);
      
      queryClient.invalidateQueries({ queryKey: ['site', id] });
      queryClient.invalidateQueries({ queryKey: ['my-sites-today'] });
    } catch (error) {
      alert('Klaida gaunant lokaciją arba atnaujinant duomenis.');
    }
  };

  const handlePause = async () => {
    try {
      const now = new Date();
      
      // 1. Close active time entry
      const { data: openEntry } = await supabase
        .from('time_entries')
        .select('id, start_time')
        .eq('site_id', site.id)
        .eq('installer_id', profile?.id as string)
        .is('end_time', null)
        .order('start_time', { ascending: false })
        .limit(1)
        .single();

      if (openEntry) {
        const entry = openEntry as any;
        const durationMins = Math.floor((now.getTime() - new Date(entry.start_time).getTime()) / 60000);
        await (supabase.from('time_entries') as any)
          .update({ end_time: now.toISOString(), duration_minutes: durationMins })
          .eq('id', entry.id);
      }

      // 2. Update site status
      await (supabase.from('sites') as any)
        .update({ status: 'paused' })
        .eq('id', site.id);

      // 3. Refresh UI
      queryClient.invalidateQueries({ queryKey: ['site', id] });
      queryClient.invalidateQueries({ queryKey: ['my-sites-today'] });
    } catch (error) {
      console.error("Pause error:", error);
      alert('Įvyko klaida stabdant laiką.');
    }
  };

  const handleComplete = async () => {
    const ok = window.confirm('Ar tikrai norite užbaigti šį objektą?');
    if (!ok) return;

    try {
      const now = new Date();
      
      // 1. Close active time entry
      const { data: openEntry } = await supabase
        .from('time_entries')
        .select('id, start_time')
        .eq('site_id', site.id)
        .eq('installer_id', profile?.id as string)
        .is('end_time', null)
        .order('start_time', { ascending: false })
        .limit(1)
        .single();

      if (openEntry) {
        const entry = openEntry as any;
        const durationMins = Math.floor((now.getTime() - new Date(entry.start_time).getTime()) / 60000);
        await (supabase.from('time_entries') as any)
          .update({ end_time: now.toISOString(), duration_minutes: durationMins })
          .eq('id', entry.id);
      }

      // 2. Update site status
      await (supabase.from('sites') as any)
        .update({ status: 'completed', actual_end: now.toISOString() })
        .eq('id', site.id);

      // 3. Refresh & Navigate
      queryClient.invalidateQueries({ queryKey: ['site', id] });
      queryClient.invalidateQueries({ queryKey: ['my-sites-today'] });
      navigate('/m'); // Return to today's list
    } catch (error) {
      console.error("Complete error:", error);
      alert('Įvyko klaida užbaigiant objektą.');
    }
  };

  const handleToggleChecklist = async (checkId: string, currentStatus: boolean) => {
    try {
      await supabase
        .from('site_checklists')
        .update({ is_completed: !currentStatus })
        .eq('id', checkId);

      queryClient.invalidateQueries({ queryKey: ['site', id] });
    } catch (error) {
      console.error("Error updating checklist:", error);
      alert("Nepavyko atnaujinti užduoties statuso.");
    }
  };

  const handleUploadPhoto = async (e: React.ChangeEvent<HTMLInputElement>, checkId: string) => {
    const file = e.target.files?.[0];
    if (!file || !profile?.id || !site) return;

    setUploadingCheckId(checkId);
    const fileExt = file.name.split('.').pop();
    const fileName = `${site.id}/${checkId}/${Math.random()}.${fileExt}`;
    const filePath = fileName;

    try {
      // 1. Upload to Supabase Storage bucket 'site-photos'
      const { error: uploadError } = await supabase.storage
        .from('site-photos')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // 2. Insert record into 'photos' table
      const { error: dbError } = await supabase
        .from('photos')
        .insert({
          site_id: site.id,
          checklist_id: checkId,
          installer_id: profile.id,
          storage_path: filePath
        });

      if (dbError) throw dbError;

      // 3. Mark the checklist item as completed automatically
      await supabase
        .from('site_checklists')
        .update({ is_completed: true })
        .eq('id', checkId);

      queryClient.invalidateQueries({ queryKey: ['site', id] });
      alert("Nuotrauka sėkmingai įkelta!");
    } catch (error) {
      console.error("Upload error:", error);
      alert("Klaida įkeliant nuotrauką.");
    } finally {
      setUploadingCheckId(null);
    }
  };

  const openMaps = () => {
    if (site?.address) {
      window.open(`https://maps.google.com/?q=${encodeURIComponent(site.address)}`, '_blank');
    }
  };

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (!site) {
    return <div className="p-4 text-center mt-10">Objektas nerastas.</div>;
  }

  const tabs = ['Apžvalga', 'Pre-checklist', 'Post-checklist', 'Foto'];

  return (
    <div className="fixed inset-0 z-[60] bg-app-bg overflow-y-auto pb-[100px]">
      {/* TOP BAR */}
      <header className="fixed top-0 left-0 right-0 h-[56px] bg-surface-bright border-b border-outline-variant flex items-center justify-between px-4 z-[70]">
        <button onClick={() => navigate(-1)} className="min-w-[44px] min-h-[44px] flex items-center justify-center -ml-2">
          <span className="material-symbols-outlined text-primary">arrow_back</span>
        </button>
        <span className="text-primary-light text-sm font-bold">{site.code}</span>
        <button onClick={openMaps} className="min-w-[44px] min-h-[44px] flex items-center justify-center -mr-2">
          <span className="material-symbols-outlined text-primary">map</span>
        </button>
      </header>

      {/* HERO SECTION */}
      <div className="bg-white rounded-b-2xl px-6 py-5 shadow-sm mt-[56px]">
        <h2 className="text-on-surface font-bold text-2xl">{site.client_name}</h2>
        
        <div className="flex items-center gap-1 mt-1">
          <span className="material-symbols-outlined text-primary-light text-sm">location_on</span>
          <span className="text-primary-light text-sm">{site.address}</span>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <span className="bg-primary text-white rounded-full px-3 py-1 text-xs font-semibold">
            {site.system_type}
          </span>
          
          {site.status === 'in_progress' && (
            <span className="bg-success-bg text-success px-3 py-1 rounded-full text-xs font-semibold flex items-center">
              <span className="w-2 h-2 rounded-full bg-success animate-pulse mr-1.5 inline-block"></span>
              Vykdomas
            </span>
          )}
          {site.status === 'pending' && (
            <span className="bg-app-bg text-on-surface-variant px-3 py-1 rounded-full text-xs font-semibold">
              Laukia
            </span>
          )}
        </div>
      </div>

      {/* TABS */}
      <div className="sticky top-[56px] bg-app-bg z-[65] border-b border-outline-variant overflow-x-auto whitespace-nowrap flex scrollbar-hide">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`transition-colors ${
              activeTab === tab
                ? 'border-b-4 border-primary text-primary font-bold px-4 py-3'
                : 'text-on-surface-variant px-4 py-3'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* TAB CONTENT */}
      {activeTab === 'Apžvalga' && (
        <div className="px-4 pb-[120px] pt-4">
          <h3 className="text-on-surface font-bold mb-3">Sistemos informacija</h3>
          
          <div className="bg-white rounded-xl p-4 mb-2 flex items-center gap-4 shadow-sm border border-outline-variant/30">
            <div className="w-10 h-10 bg-[#f6e9ff] text-primary rounded-lg flex items-center justify-center">
              <span className="material-symbols-outlined">grid_4x4</span>
            </div>
            <div>
              <p className="font-semibold text-on-surface">PV Moduliai</p>
              <p className="text-xs text-on-surface-variant">Informacija ruošiama</p>
            </div>
          </div>

          <div className="bg-white rounded-xl p-4 mb-2 flex items-center gap-4 shadow-sm border border-outline-variant/30">
            <div className="w-10 h-10 bg-[#f6e9ff] text-primary rounded-lg flex items-center justify-center">
              <span className="material-symbols-outlined">electric_meter</span>
            </div>
            <div>
              <p className="font-semibold text-on-surface">Inverteris</p>
              <p className="text-xs text-on-surface-variant">Informacija ruošiama</p>
            </div>
          </div>

          <div className="bg-white rounded-xl p-4 mb-2 flex items-center gap-4 shadow-sm border border-outline-variant/30">
            <div className="w-10 h-10 bg-[#f6e9ff] text-primary rounded-lg flex items-center justify-center">
              <span className="material-symbols-outlined">battery_charging_full</span>
            </div>
            <div>
              <p className="font-semibold text-on-surface">BESS</p>
              <p className="text-xs text-on-surface-variant">Informacija ruošiama</p>
            </div>
          </div>

          <h3 className="text-on-surface font-bold mt-6 mb-3">Komanda</h3>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-outline-variant/30 flex flex-col gap-3">
            {site.site_assignments?.map((assignment: any) => (
              <div key={assignment.installer_id} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary-fixed flex items-center justify-center text-primary font-bold text-xs">
                  {assignment.user_profiles?.full_name?.charAt(0) || 'U'}
                </div>
                <span className="text-on-surface font-medium text-sm">
                  {assignment.user_profiles?.full_name || 'Nežinomas vartotojas'}
                  {assignment.is_lead ? ' (Vadovas)' : ''}
                </span>
              </div>
            ))}
            {(!site.site_assignments || site.site_assignments.length === 0) && (
              <p className="text-sm text-on-surface-variant">Nėra priskirtų montuotojų.</p>
            )}
          </div>
        </div>
      )}

      {activeTab === 'Pre-checklist' && (
        <div className="px-4 pb-[120px] pt-4">
          {site.site_checklists?.filter((c: any) => c.phase === 'pre').map((item: any) => (
            <div 
              key={item.id} 
              className="bg-white rounded-xl p-4 shadow-sm mb-3 flex items-center justify-between"
            >
              <div className="flex items-center" onClick={() => handleToggleChecklist(item.id, item.is_completed)}>
                <div className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${
                  item.is_completed ? 'bg-[#10B981] border-[#10B981]' : 'border-outline-variant/50 bg-white'
                }`}>
                  {item.is_completed && <span className="material-symbols-outlined text-white text-[16px]">check</span>}
                </div>
                <span className="text-[#1d033a] font-semibold text-sm ml-3">{item.task_name}</span>
              </div>
              {item.requires_photo && (
                <div className="relative">
                  {uploadingCheckId === item.id ? (
                    <span className="material-symbols-outlined text-[#8052b2] animate-spin">progress_activity</span>
                  ) : site.photos?.some((p: any) => p.checklist_id === item.id) ? (
                    <span className="material-symbols-outlined text-success text-[24px]">check_circle</span>
                  ) : (
                    <label 
                      className="cursor-pointer flex items-center justify-center w-9 h-9 rounded-full bg-[#f6e9ff] active:bg-[#e4cbf8] transition-colors"
                    >
                      <span className="material-symbols-outlined text-[#8052b2] text-[20px]">photo_camera</span>
                      <input 
                        type="file" 
                        accept="image/*" 
                        capture="environment" 
                        className="hidden" 
                        onChange={(e) => handleUploadPhoto(e, item.id)}
                      />
                    </label>
                  )}
                </div>
              )}
            </div>
          ))}
          {(!site.site_checklists || site.site_checklists.filter((c: any) => c.phase === 'pre').length === 0) && (
            <div className="text-center text-on-surface-variant py-8">Pre-checklist užduočių nėra.</div>
          )}
        </div>
      )}

      {/* BOTTOM ACTION BAR */}
      <div className="fixed bottom-0 left-0 right-0 z-[70] drop-shadow-2xl">
        {site.status === 'pending' && (
          <button
            onClick={handleCheckIn}
            disabled={isCheckingIn}
            className="h-[80px] w-full bg-success text-white flex flex-col items-center justify-center disabled:opacity-80 disabled:cursor-not-allowed transition-transform active:bg-[#0f9e6d]"
          >
            {isCheckingIn ? (
              <span className="material-symbols-outlined animate-spin mb-1 text-2xl">progress_activity</span>
            ) : (
              <>
                <span className="material-symbols-outlined mb-1 text-2xl">location_on</span>
                <span className="font-bold text-lg leading-tight">ATVYKAU</span>
              </>
            )}
          </button>
        )}

        {site.status === 'in_progress' && (
          <div className="flex flex-col">
            <div className="h-[40px] bg-gradient-to-r from-success to-[#059669] flex items-center justify-center">
              <span className="material-symbols-outlined text-white mr-2 text-sm">timer</span>
              <span className="text-white font-semibold text-sm">
                <LiveTimer entries={site.time_entries || []} installerId={profile?.id as string} />
              </span>
            </div>
            <div className="h-[80px] bg-white flex gap-3 px-4 py-4 border-t border-outline-variant pb-6">
              <button onClick={handlePause} className="flex-1 rounded-xl text-on-surface font-semibold border-2 border-outline-variant flex items-center justify-center transition-transform active:bg-gray-50 h-[48px]">
                PERTRAUKA
              </button>
              <button onClick={handleComplete} className="flex-1 rounded-xl bg-success text-white font-semibold flex items-center justify-center transition-transform active:bg-[#0f9e6d] h-[48px]">
                BAIGTI
              </button>
            </div>
          </div>
        )}

        {site.status === 'paused' && (
          <div className="flex flex-col">
            <div className="h-[40px] bg-[#F59E0B] flex items-center justify-center">
              <span className="text-white font-semibold text-sm">⏸️ Pertrauka</span>
            </div>
            <div className="h-[80px] bg-white flex gap-3 px-4 py-4 border-t border-outline-variant pb-6">
              <button onClick={handleResume} className="flex-1 rounded-xl bg-success text-white font-semibold flex items-center justify-center transition-transform active:bg-[#0f9e6d] h-[48px]">
                TĘSTI
              </button>
              <button onClick={handleComplete} className="flex-1 rounded-xl text-on-surface font-semibold border-2 border-outline-variant flex items-center justify-center transition-transform active:bg-gray-50 h-[48px]">
                BAIGTI
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
