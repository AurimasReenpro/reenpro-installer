import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database.types';
import * as Sentry from "@sentry/react";

const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '');
const supabaseAnonKey = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '');

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables'); Sentry.captureException('Missing Supabase environment variables');
}

export const supabase = createClient<Database>(
  supabaseUrl ?? '',
  supabaseAnonKey ?? ''
);
