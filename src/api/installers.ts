import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database.types';
import { supabase } from '../lib/supabase';

const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '');
const supabaseAnonKey = String(
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  ''
);

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables for installers api');
}

export interface CreateInstallerData {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  password?: string;
}

export async function createInstaller(data: CreateInstallerData) {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Trūksta Supabase aplinkos kintamųjų.');
  }

  // Create a separate, non-persisting client so it doesn't affect the admin's logged-in session.
  const tempClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const { data: authData, error } = await tempClient.auth.signUp({
    email: data.email,
    password: data.password || 'TemporaryPassword123!',
    options: {
      data: {
        full_name: `${data.firstName} ${data.lastName}`.trim(),
        phone: data.phone || null,
        role: 'installer',
      },
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!authData?.user) {
    throw new Error('Nepavyko sukurti vartotojo.');
  }

  return authData;
}

export async function deleteInstaller(id: string): Promise<void> {
  const { error } = await supabase.from('user_profiles').delete().eq('id', id);

  if (error) {
    throw new Error(error.message);
  }
}

export async function updateInstaller(
  id: string,
  data: { firstName: string; lastName: string; phone?: string; teamId?: string | null }
): Promise<void> {
  const { data: updatedData, error } = await supabase
    .from('user_profiles')
    .update({
      full_name: `${data.firstName} ${data.lastName}`.trim(),
      phone: data.phone || null,
      team_id: data.teamId,
    })
    .eq('id', id)
    .select();

  if (error) {
    throw new Error(error.message);
  }

  if (!updatedData || updatedData.length === 0) {
    throw new Error('Nepavyko atnaujinti: įrašas nerastas arba blokuoja RLS taisyklės.');
  }
}

export interface Team {
  id: string;
  name: string;
  created_at?: string | null;
}

export async function getTeams(): Promise<Team[]> {
  const { data, error } = await supabase
    .from('teams')
    .select('*')
    .order('name', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

export async function createTeam(name: string): Promise<Team> {
  const { data, error } = await supabase
    .from('teams')
    .insert({ name })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function deleteTeam(id: string): Promise<void> {
  const { error } = await supabase
    .from('teams')
    .delete()
    .eq('id', id);

  if (error) {
    throw new Error(error.message);
  }
}
