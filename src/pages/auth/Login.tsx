import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { Sun, Loader2 } from 'lucide-react';

const loginSchema = z.object({
  email: z.string().email('Neteisingas el. pašto formatas'),
  password: z.string().min(6, 'Slaptažodis turi būti bent 6 simbolių ilgio'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function Login() {
  const navigate = useNavigate();
  const { user, profile, loading } = useAuthStore();
  const [authError, setAuthError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  // Redirect if already logged in
  useEffect(() => {
    if (!loading && user && profile) {
      if (profile.role === 'admin') {
        void navigate('/admin', { replace: true });
      } else if (profile.role === 'installer') {
        void navigate('/m', { replace: true });
      }
    }
  }, [user, profile, loading, navigate]);

  const onSubmit = async (data: LoginFormValues) => {
    setAuthError(null);
    const { data: authData, error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });

    if (error) {
      setAuthError(error.message);
    } else if (authData.user) {
      // Immediately fetch profile for fast redirection
      const { data: profileData, error: profileError } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', authData.user.id)
        .single();
        
      if (!profileError && profileData) {
        if (profileData.role === 'admin') {
          void navigate('/admin', { replace: true });
        } else if (profileData.role === 'installer') {
          void navigate('/m', { replace: true });
        } else {
          void navigate('/', { replace: true });
        }
      } else {
        void navigate('/', { replace: true });
      }
    }
  };

  return (
    <div className="min-h-screen bg-app-bg flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-[20px] shadow-card p-8 max-w-sm w-full">
        {/* Logo Section */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center gap-2">
            <Sun className="text-primary w-10 h-10 fill-primary" />
            <h1 className="text-on-surface font-bold text-xl">InstallerApp</h1>
          </div>
          <p className="text-primary-ink text-sm mt-1">
            Montuotojų platforma
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={(e) => { void handleSubmit(onSubmit)(e); }} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-on-surface">
              El. paštas
            </label>
            <input
              type="email"
              {...register('email')}
              className="w-full rounded-input border border-outline-variant px-4 py-3 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-on-surface bg-surface"
            />
            {errors.email && (
              <span className="text-error text-xs">{errors.email.message}</span>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-on-surface">
              Slaptažodis
            </label>
            <input
              type="password"
              {...register('password')}
              className="w-full rounded-input border border-outline-variant px-4 py-3 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-on-surface bg-surface"
            />
            {errors.password && (
              <span className="text-error text-xs">
                {errors.password.message}
              </span>
            )}
          </div>

          {authError && (
            <div className="bg-warning-bg text-danger rounded-input px-4 py-3 text-sm">
              {authError}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full h-[52px] bg-primary text-white rounded-btn font-semibold text-[15px] shadow-primary hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-4 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="animate-spin w-5 h-5" />
                Jungiamasi...
              </>
            ) : (
              'Prisijungti'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
