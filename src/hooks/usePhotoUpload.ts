import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import * as Sentry from '@sentry/react';
import type { SiteDetailData, SitePhoto } from '../types/site.types';

export function usePhotoUpload(siteId: string, site: SiteDetailData | undefined, profileId: string | undefined) {
  const queryClient = useQueryClient();
  const [uploadingCheckId, setUploadingCheckId] = useState<string | null>(null);

  const handleUploadPhoto = async (e: React.ChangeEvent<HTMLInputElement>, checkId: string) => {
    const file = e.target.files?.[0];
    if (!file || !profileId || !site) return;

    setUploadingCheckId(checkId);
    
    // TODO: Client-side compression will go here (Fix #9)

    const fileExt = file.name.split('.').pop();
    const fileName = `${site.id}/${checkId}/${Date.now()}.${fileExt}`;
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
          installer_id: profileId,
          storage_path: filePath
        });

      if (dbError) throw dbError;

      // 3. Mark the checklist item as completed automatically
      await supabase
        .from('site_checklists')
        .update({ is_completed: true })
        .eq('id', checkId);

      void queryClient.invalidateQueries({ queryKey: ['site', siteId] });
      alert('Nuotrauka sėkmingai įkelta!');
    } catch (error) {
      console.error('Upload error:', error);
      Sentry.captureException(error, { extra: { context: 'Upload error:' } });
      alert('Klaida įkeliant nuotrauką.');
    } finally {
      setUploadingCheckId(null);
    }
  };

  const handleDeletePhoto = async (selectedPhoto: { photo: SitePhoto; checkId: string } | null, onResetSelection: () => void) => {
    if (!selectedPhoto) return;
    const confirmDelete = window.confirm('Ar tikrai norite ištrinti šią nuotrauką?');
    if (!confirmDelete) return;

    try {
      // 1. Delete physical file from Storage
      await supabase.storage
        .from('site-photos')
        .remove([selectedPhoto.photo.storage_path]);

      // 2. Delete record from `photos` table
      await supabase
        .from('photos')
        .delete()
        .eq('id', selectedPhoto.photo.id);

      // 3. Reset the checklist item to not completed
      await supabase
        .from('site_checklists')
        .update({ is_completed: false })
        .eq('id', selectedPhoto.checkId);

      // 4. Refresh UI and close modal
      void queryClient.invalidateQueries({ queryKey: ['site', siteId] });
      onResetSelection();
    } catch (error) {
      console.error('Delete error:', error);
      Sentry.captureException(error, { extra: { context: 'Delete error:' } });
      alert('Nepavyko ištrinti nuotraukos.');
    }
  };

  return {
    uploadingCheckId,
    handleUploadPhoto,
    handleDeletePhoto
  };
}
