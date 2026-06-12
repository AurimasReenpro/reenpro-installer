import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

// (3) Lock CORS to the app origin; fall back to '*' only if the env var is unset.
const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? '*';
const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
};

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });

// (4) Lightweight manual validation (no external deps in the Deno runtime).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return json({ error: 'Missing Supabase environment variables on backend.' }, 500);
    }

    // (1) Identify the caller from their JWT using an anon-key client.
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!jwt) return json({ error: 'Unauthorized: missing token.' }, 401);

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user: caller }, error: callerErr } = await callerClient.auth.getUser(jwt);
    if (callerErr || !caller) return json({ error: 'Unauthorized: invalid token.' }, 401);

    // Service-role client (bypasses RLS) for the privileged read + create.
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // (2) Require the caller to be an admin.
    const { data: callerProfile, error: profErr } = await admin
      .from('user_profiles').select('role').eq('id', caller.id).single();
    if (profErr || callerProfile?.role !== 'admin') {
      return json({ error: 'Forbidden: admin role required.' }, 403);
    }

    // (4) Validate the payload.
    const { email, password, firstName, lastName, phone } = await req.json();
    if (!email || !password || !firstName || !lastName) {
      return json({ error: 'Missing required fields (email, password, firstName, lastName).' }, 400);
    }
    if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
      return json({ error: 'Invalid email format.' }, 400);
    }
    if (typeof password !== 'string' || password.length < 8) {
      return json({ error: 'Password must be at least 8 characters.' }, 400);
    }

    const fullName = `${firstName} ${lastName}`.trim();

    // Create the confirmed auth user.
    const { data: authData, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, phone: phone || null, role: 'installer' },
    });
    if (error || !authData?.user) {
      return json({ error: error?.message ?? 'Failed to create user.' }, 400);
    }

    // (5) Guarantee the user_profiles row exists. Idempotent upsert — coexists
    // safely with any handle_new_user trigger in the live DB.
    const { error: profileError } = await admin.from('user_profiles').upsert(
      { id: authData.user.id, email, full_name: fullName, phone: phone || null, role: 'installer' },
      { onConflict: 'id' },
    );
    if (profileError) {
      // Don't leave an orphan auth user if the profile write fails.
      await admin.auth.admin.deleteUser(authData.user.id);
      return json({ error: `Profile creation failed: ${profileError.message}` }, 400);
    }

    // Same response shape as before: the createUser result ({ user }).
    return json(authData, 200);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return json({ error: errMsg }, 500);
  }
});
