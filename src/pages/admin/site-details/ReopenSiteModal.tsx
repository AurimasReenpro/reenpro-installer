import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Loader2, RotateCcw } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

/** Revisit (FTFR) reason categories — value stored in DB, label shown in UI. */
const REVISIT_CATEGORIES: { value: string; label: string }[] = [
  { value: 'Brokas', label: 'Brokas' },
  { value: 'Dokumentacija', label: 'Trūksta dokumentacijos' },
  { value: 'Planavimas', label: 'Planavimo klaida' },
  { value: 'Kliento_uzsakymas', label: 'Kliento papildomas užsakymas' },
];
const DEFAULT_REVISIT_CATEGORY = 'Brokas';

/** Premium "Reopen / Revisit" modal (Apple style) — admin reopens a completed site. */
export default function ReopenSiteModal({
  siteId,
  open,
  onClose,
}: {
  siteId: string;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [revisitCategory, setRevisitCategory] = useState(DEFAULT_REVISIT_CATEGORY);
  const [revisitNotes, setRevisitNotes] = useState('');

  const reopenMutation = useMutation({
    mutationFn: async ({ category, notes }: { category: string; notes: string }) => {
      const { data: userData } = await supabase.auth.getUser();
      // 1. Record the revisit (FTFR tracking)
      const { error: revisitErr } = await supabase
        .from('site_revisits')
        .insert({
          site_id: siteId,
          category,
          notes: notes.trim() || null,
          created_by: userData.user?.id ?? null,
        });
      if (revisitErr) throw new Error(revisitErr.message);
      // 2. Reopen the site
      const { error } = await supabase
        .from('sites')
        .update({ status: 'in_progress', actual_end: null })
        .eq('id', siteId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success('Objektas atidarytas iš naujo.');
      onClose();
      setRevisitNotes('');
      setRevisitCategory(DEFAULT_REVISIT_CATEGORY);
      void queryClient.invalidateQueries({ queryKey: ['admin_site', siteId] });
      void queryClient.invalidateQueries({ queryKey: ['site', siteId] });
      void queryClient.invalidateQueries({ queryKey: ['site_revisits', siteId] });
      void queryClient.invalidateQueries({ queryKey: ['admin_dashboard_stats'] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Klaida'),
  });

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 bg-surface/20 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => { if (!reopenMutation.isPending) onClose(); }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-surface w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden border border-white/40 p-6"
          >
            <h2 className="text-2xl font-extrabold text-text tracking-tight mb-6">
              Atidaryti iš naujo
            </h2>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                reopenMutation.mutate({ category: revisitCategory, notes: revisitNotes });
              }}
            >
              <label className="block text-[11px] font-bold text-subtle uppercase tracking-wider mb-1.5 ml-1">
                Pakartotinio vizito priežastis
              </label>
              <select
                value={revisitCategory}
                onChange={(e) => setRevisitCategory(e.target.value)}
                className="w-full bg-surface-2 border-0 rounded-card px-4 py-3.5 text-sm text-text focus:bg-white focus:ring-2 focus:ring-primary shadow-inner transition-all focus:outline-none appearance-none"
              >
                {REVISIT_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>

              <label className="block text-[11px] font-bold text-subtle uppercase tracking-wider mb-1.5 ml-1 mt-4">
                Pastabos
              </label>
              <textarea
                value={revisitNotes}
                onChange={(e) => setRevisitNotes(e.target.value)}
                rows={3}
                placeholder="Trumpai aprašykite, kodėl objektas atidaromas iš naujo…"
                className="w-full bg-surface-2 border-0 rounded-card px-4 py-3.5 text-sm text-text focus:bg-white focus:ring-2 focus:ring-primary shadow-inner transition-all focus:outline-none resize-none"
              />

              <button
                type="submit"
                disabled={reopenMutation.isPending}
                className="w-full rounded-card py-3.5 font-semibold bg-primary text-white mt-6 flex items-center justify-center gap-2 hover:bg-primary transition-colors disabled:opacity-60"
              >
                {reopenMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
                Atidaryti objektą
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={reopenMutation.isPending}
                className="mt-3 w-full text-sm font-medium text-muted hover:text-text transition-colors disabled:opacity-60"
              >
                Atšaukti
              </button>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
