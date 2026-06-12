import { supabase } from '../lib/supabase';

export interface CreateInstallerData {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  password?: string;
}

export async function createInstaller(data: CreateInstallerData) {
  // Account creation goes through the admin-only `create-installer` Edge Function,
  // which verifies the caller is an admin (service role) before creating the user.
  // supabase-js automatically attaches the logged-in admin's JWT as the
  // Authorization header, which the function validates.
  const { data: result, error } = (await supabase.functions.invoke('create-installer', {
    body: {
      email: data.email,
      password: data.password || 'TemporaryPassword123!', // 21 chars ≥ 8
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone,
    },
  })) as {
    data: { user?: { id: string } | null; error?: string } | null;
    error: { message?: string; context?: { json?: () => Promise<unknown> } } | null;
  };

  // (1) invoke-level error (network, or a non-2xx that supabase-js flags). The real
  // message from our function lives in the Response body (error.context), so dig it out.
  if (error) {
    let msg = error.message ?? 'Nepavyko sukurti montuotojo.';
    try {
      const body = (await error.context?.json?.()) as { error?: string } | undefined;
      if (body?.error) msg = body.error;
    } catch { /* keep the generic message */ }
    throw new Error(msg);
  }

  // (2) Our function returned its specific error string in the JSON body (e.g.
  // "Forbidden: admin role required." / "Invalid email format.").
  if (result?.error) {
    throw new Error(result.error);
  }

  // (3) Success must include the created user.
  if (!result?.user) {
    throw new Error('Nepavyko sukurti vartotojo.');
  }

  return result;
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
