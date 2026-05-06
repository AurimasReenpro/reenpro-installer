import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '../../lib/supabase';

const loginSchema = z.object({
  email: z.string().email('Neteisingas el. pašto formatas'),
  password: z.string().min(6, 'Slaptažodis turi būti bent 6 simbolių ilgio'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function Login() {
  const navigate = useNavigate();
  const [authError, setAuthError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  useEffect(() => {
    // Redirect if already logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate('/');
      }
    });
  }, [navigate]);

  const onSubmit = async (data: LoginFormValues) => {
    setAuthError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });

    if (error) {
      setAuthError(error.message);
    } else {
      navigate('/');
    }
  };

  return (
    <div className="min-h-screen bg-app-bg flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full">
        {/* Logo Section */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center gap-2">
            <span
              className="material-symbols-outlined"
              style={{ color: '#fc391d', fontSize: '40px' }}
            >
              sunny
            </span>
            <h1 className="text-on-surface font-bold text-xl">InstallerApp</h1>
          </div>
          <p className="text-primary-light text-sm mt-1">
            Montuotojų platforma
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-on-surface">
              El. paštas
            </label>
            <input
              type="email"
              {...register('email')}
              className="w-full rounded-xl border border-outline-variant px-4 py-3 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-on-surface bg-white"
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
              className="w-full rounded-xl border border-outline-variant px-4 py-3 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-on-surface bg-white"
            />
            {errors.password && (
              <span className="text-error text-xs">
                {errors.password.message}
              </span>
            )}
          </div>

          {authError && (
            <div className="bg-[#ffdad6] text-[#ba1a1a] rounded-xl px-4 py-3 text-sm">
              {authError}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full h-[52px] bg-primary text-white rounded-xl font-semibold text-[15px] hover:bg-[#330666] active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-4 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <span
                  className="material-symbols-outlined animate-spin"
                  style={{ fontSize: '20px' }}
                >
                  progress_activity
                </span>
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
