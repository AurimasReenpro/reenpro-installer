import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion, AnimatePresence } from 'framer-motion';
import { useQueryClient, useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { X, Loader2 } from 'lucide-react';
import { updateInstaller, getActiveTeams } from '../../api/installers';
import {
  INSTALLER_WORK_ROLE_OPTIONS,
  INSTALLER_WORK_ROLES,
  normalizeInstallerWorkRole,
} from '../../lib/installerWorkRoles';
import type { Database } from '../../types/database.types';

type UserProfile = Database['public']['Tables']['user_profiles']['Row'];

const editInstallerSchema = z.object({
  firstName: z.string().min(1, 'Vardas yra privalomas'),
  lastName: z.string().min(1, 'Pavardė yra privalomas'),
  phone: z.string().optional().or(z.literal('')),
  teamId: z.string().optional().or(z.literal('')),
  workRole: z.enum(INSTALLER_WORK_ROLES),
});

type EditInstallerFormValues = z.infer<typeof editInstallerSchema>;

interface EditInstallerModalProps {
  isOpen: boolean;
  onClose: () => void;
  installer: UserProfile | null;
}

export default function EditInstallerModal({
  isOpen,
  onClose,
  installer,
}: EditInstallerModalProps) {
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EditInstallerFormValues>({
    resolver: zodResolver(editInstallerSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      phone: '',
      teamId: '',
      workRole: 'installer',
    },
  });

  const { data: teams } = useQuery({
    queryKey: ['active_teams'],
    queryFn: getActiveTeams,
    enabled: isOpen,
  });

  const mutation = useMutation({
    mutationFn: async (values: EditInstallerFormValues) => {
      if (!installer) throw new Error('Pasirinktas montuotojas nerastas.');
      return updateInstaller(installer.id, {
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        phone: values.phone?.trim() || undefined,
        teamId: values.teamId || null,
        workRole: values.workRole,
      });
    },
  });

  const onSubmit = async (values: EditInstallerFormValues) => {
    try {
      console.log('Formos pateikiami duomenys:', values);
      await mutation.mutateAsync(values);
      toast.success('Montuotojo duomenys sėkmingai atnaujinti!');
      void queryClient.invalidateQueries({ queryKey: ['admin_installers'] });
      onClose();
    } catch (error: unknown) {
      console.error('Error updating installer:', error);
      const message =
        error instanceof Error ? error.message : 'Įvyko klaida atnaujinant montuotoją';
      toast.error(message);
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !mutation.isPending) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, mutation.isPending]);

  // Load initial installer values into form when opened/changed
  useEffect(() => {
    if (isOpen && installer) {
      const name = installer.full_name || '';
      const parts = name.trim().split(/\s+/);
      const firstName = parts[0] || '';
      const lastName = parts.slice(1).join(' ') || '';
      reset({
        firstName,
        lastName,
        phone: installer.phone || '',
        teamId: installer.team_id || '',
        workRole: normalizeInstallerWorkRole(installer.work_role),
      });
    }
  }, [isOpen, installer, reset]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => {
            if (!mutation.isPending) onClose();
          }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', bounce: 0.3, duration: 0.4 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-surface rounded-[2rem] max-w-md w-full overflow-hidden shadow-2xl flex flex-col"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-border">
              <h3 className="text-[18px] font-extrabold tracking-tight text-text">
                Redaguoti montuotojo duomenis
              </h3>
              <button
                type="button"
                onClick={onClose}
                disabled={mutation.isPending}
                className="text-subtle hover:text-muted dark:hover:text-gray-200 transition-colors cursor-pointer disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body / Form */}
            <form
              onSubmit={(e) => {
                void handleSubmit(onSubmit)(e);
              }}
              className="p-6 space-y-4"
            >
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold text-subtle uppercase tracking-wider ml-1 mb-1">
                    Vardas
                  </label>
                  <input
                    type="text"
                    disabled={mutation.isPending}
                    {...register('firstName')}
                    placeholder="Jonas"
                    className="w-full bg-surface-2 border border-transparent focus:bg-white dark:focus:bg-surface-2 focus:ring-2 focus:ring-primary rounded-xl px-4 py-3 text-sm text-text focus:outline-none transition-all disabled:opacity-60"
                  />
                  {errors.firstName && (
                    <span className="text-red-500 text-xs mt-0.5">
                      {errors.firstName.message}
                    </span>
                  )}
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold text-subtle uppercase tracking-wider ml-1 mb-1">
                    Pavardė
                  </label>
                  <input
                    type="text"
                    disabled={mutation.isPending}
                    {...register('lastName')}
                    placeholder="Jonaitis"
                    className="w-full bg-surface-2 border border-transparent focus:bg-white dark:focus:bg-surface-2 focus:ring-2 focus:ring-primary rounded-xl px-4 py-3 text-sm text-text focus:outline-none transition-all disabled:opacity-60"
                  />
                  {errors.lastName && (
                    <span className="text-red-500 text-xs mt-0.5">
                      {errors.lastName.message}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-subtle uppercase tracking-wider ml-1 mb-1">
                  Telefonas (neprivalomas)
                </label>
                <input
                  type="tel"
                  disabled={mutation.isPending}
                  {...register('phone')}
                  placeholder="+37060000000"
                  className="w-full bg-surface-2 border border-transparent focus:bg-white dark:focus:bg-surface-2 focus:ring-2 focus:ring-primary rounded-xl px-4 py-3 text-sm text-text focus:outline-none transition-all disabled:opacity-60"
                />
                {errors.phone && (
                  <span className="text-red-500 text-xs mt-0.5">
                    {errors.phone.message}
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-subtle uppercase tracking-wider ml-1 mb-1">
                  Komanda
                </label>
                <select
                  disabled={mutation.isPending}
                  {...register('teamId')}
                  className="w-full bg-surface-2 border border-transparent focus:bg-white dark:focus:bg-surface-2 focus:ring-2 focus:ring-primary rounded-xl px-4 py-3 text-sm text-text focus:outline-none transition-all disabled:opacity-60 cursor-pointer"
                >
                  <option value="">Nepriskirta</option>
                  {teams?.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
                {errors.teamId && (
                  <span className="text-red-500 text-xs mt-0.5">
                    {errors.teamId.message}
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-subtle uppercase tracking-wider ml-1 mb-1">
                  Pareigos
                </label>
                <select
                  disabled={mutation.isPending}
                  {...register('workRole')}
                  className="w-full bg-surface-2 border border-transparent focus:bg-white dark:focus:bg-surface-2 focus:ring-2 focus:ring-primary rounded-xl px-4 py-3 text-sm text-text focus:outline-none transition-all disabled:opacity-60 cursor-pointer"
                >
                  {INSTALLER_WORK_ROLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {errors.workRole && (
                  <span className="text-red-500 text-xs mt-0.5">
                    Pasirinkite pareigas.
                  </span>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={mutation.isPending}
                  className="flex-1 py-3 font-medium text-[14px] rounded-xl border border-border text-muted dark:text-subtle hover:bg-surface-2 dark:hover:bg-surface-2 transition-colors disabled:opacity-60 cursor-pointer"
                >
                  Atšaukti
                </button>
                <button
                  type="submit"
                  disabled={mutation.isPending}
                  className="flex-1 py-3 font-medium text-[14px] rounded-xl bg-primary hover:opacity-90 text-white transition-all flex items-center justify-center gap-2 disabled:opacity-75 cursor-pointer"
                >
                  {mutation.isPending ? (
                    <>
                      <Loader2 className="animate-spin w-4 h-4" />
                      Išsaugoma...
                    </>
                  ) : (
                    'Išsaugoti'
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
