import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion, AnimatePresence } from 'framer-motion';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { X, Loader2 } from 'lucide-react';
import { createInstaller } from '../../api/installers';

const addInstallerSchema = z.object({
  firstName: z.string().min(1, 'Vardas yra privalomas'),
  lastName: z.string().min(1, 'Pavardė yra privalom'),
  email: z.string().email('Neteisingas el. pašto formatas'),
  phone: z.string().optional().or(z.literal('')),
  password: z
    .string()
    .min(6, 'Laikinas slaptažodis turi būti bent 6 simbolių ilgio'),
});

type AddInstallerFormValues = z.infer<typeof addInstallerSchema>;

interface AddInstallerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AddInstallerModal({
  isOpen,
  onClose,
}: AddInstallerModalProps) {
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AddInstallerFormValues>({
    resolver: zodResolver(addInstallerSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      password: '',
    },
  });

  const mutation = useMutation({
    mutationFn: async (values: AddInstallerFormValues) => {
      return createInstaller({
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        email: values.email.trim(),
        phone: values.phone?.trim() || undefined,
        password: values.password,
      });
    },
  });

  const onSubmit = async (values: AddInstallerFormValues) => {
    try {
      await mutation.mutateAsync(values);
      toast.success('Montuotojas sėkmingai pridėtas!');
      void queryClient.invalidateQueries({ queryKey: ['admin_installers'] });
      reset();
      onClose();
    } catch (error: unknown) {
      console.error('Error creating installer:', error);
      const message =
        error instanceof Error ? error.message : 'Įvyko klaida kuriant montuotoją';
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

  // Clean form when modal closes/opens
  useEffect(() => {
    if (isOpen) {
      reset();
    }
  }, [isOpen, reset]);

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
            className="bg-white rounded-2xl max-w-md w-full overflow-hidden shadow-2xl flex flex-col"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#cdc3d4]/30">
              <h3 className="text-[18px] font-bold text-[#1d033a]">
                Pridėti naują montuotoją
              </h3>
              <button
                type="button"
                onClick={onClose}
                disabled={mutation.isPending}
                className="text-[#7c7484] hover:text-[#1d033a] transition-colors cursor-pointer disabled:opacity-50"
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
                  <label className="text-[13px] font-semibold text-[#4b4452] uppercase tracking-wider">
                    Vardas
                  </label>
                  <input
                    type="text"
                    disabled={mutation.isPending}
                    {...register('firstName')}
                    placeholder="Jonas"
                    className="w-full h-[44px] px-3 bg-[#f6f5fa] border border-[#cdc3d4] rounded-[8px] text-[14px] text-[#1d033a] focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-60"
                  />
                  {errors.firstName && (
                    <span className="text-red-500 text-xs mt-0.5">
                      {errors.firstName.message}
                    </span>
                  )}
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[13px] font-semibold text-[#4b4452] uppercase tracking-wider">
                    Pavardė
                  </label>
                  <input
                    type="text"
                    disabled={mutation.isPending}
                    {...register('lastName')}
                    placeholder="Jonaitis"
                    className="w-full h-[44px] px-3 bg-[#f6f5fa] border border-[#cdc3d4] rounded-[8px] text-[14px] text-[#1d033a] focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-60"
                  />
                  {errors.lastName && (
                    <span className="text-red-500 text-xs mt-0.5">
                      {errors.lastName.message}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[13px] font-semibold text-[#4b4452] uppercase tracking-wider">
                  El. Paštas
                </label>
                <input
                  type="email"
                  disabled={mutation.isPending}
                  {...register('email')}
                  placeholder="jonas.jonaitis@imone.lt"
                  className="w-full h-[44px] px-3 bg-[#f6f5fa] border border-[#cdc3d4] rounded-[8px] text-[14px] text-[#1d033a] focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-60"
                />
                {errors.email && (
                  <span className="text-red-500 text-xs mt-0.5">
                    {errors.email.message}
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[13px] font-semibold text-[#4b4452] uppercase tracking-wider">
                  Telefonas (neprivalomas)
                </label>
                <input
                  type="tel"
                  disabled={mutation.isPending}
                  {...register('phone')}
                  placeholder="+37060000000"
                  className="w-full h-[44px] px-3 bg-[#f6f5fa] border border-[#cdc3d4] rounded-[8px] text-[14px] text-[#1d033a] focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-60"
                />
                {errors.phone && (
                  <span className="text-red-500 text-xs mt-0.5">
                    {errors.phone.message}
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[13px] font-semibold text-[#4b4452] uppercase tracking-wider">
                  Laikinas Slaptažodis
                </label>
                <input
                  type="password"
                  disabled={mutation.isPending}
                  {...register('password')}
                  placeholder="••••••"
                  className="w-full h-[44px] px-3 bg-[#f6f5fa] border border-[#cdc3d4] rounded-[8px] text-[14px] text-[#1d033a] focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-60"
                />
                {errors.password && (
                  <span className="text-red-500 text-xs mt-0.5">
                    {errors.password.message}
                  </span>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={mutation.isPending}
                  className="flex-1 h-[44px] font-semibold text-[14px] rounded-[8px] border border-[#cdc3d4] text-[#4b4452] hover:bg-[#f6f5fa] transition-colors disabled:opacity-60 cursor-pointer"
                >
                  Atšaukti
                </button>
                <button
                  type="submit"
                  disabled={mutation.isPending}
                  className="flex-1 h-[44px] font-semibold text-[14px] rounded-[8px] bg-primary text-white hover:bg-primary/80 transition-colors flex items-center justify-center gap-2 disabled:opacity-75 cursor-pointer"
                >
                  {mutation.isPending ? (
                    <>
                      <Loader2 className="animate-spin w-4 h-4" />
                      Pridedama...
                    </>
                  ) : (
                    'Pridėti'
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
