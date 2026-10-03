import { createClient } from 'npm:@supabase/supabase-js@2.112.4';
import { createGooglePlacesHandler } from './handler.ts';

Deno.serve(createGooglePlacesHandler({
  env: name => Deno.env.get(name),
  fetch: (input, init) => fetch(input, init),
  authenticate: async request => {
    const authorization = request.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) throw new Error('Authentication required.');
    const client = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_ANON_KEY') || '', {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authorization } },
    });
    const { data, error } = await client.auth.getUser(authorization.slice(7));
    if (error || !data.user || data.user.is_anonymous) throw new Error('Authentication required.');
  },
}));
