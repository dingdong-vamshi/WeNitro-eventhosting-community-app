import { createClient } from 'npm:@supabase/supabase-js@2.112.4';
import { createGooglePlacesHandler } from './handler.ts';

const admin = () => createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '', { auth: { persistSession: false, autoRefreshToken: false } });
let runtimeSecrets: Record<string, string> = {};
let secretsPromise: Promise<void> | null = null;
async function loadRuntimeSecrets() {
  if (Deno.env.get('GOOGLE_PLACES_ENABLED') === 'true' && Deno.env.get('GOOGLE_PLACES_API_KEY')) return;
  if (!secretsPromise) secretsPromise = (async () => {
    const { data, error } = await admin().rpc('provider_runtime_secrets');
    if (!error && data && typeof data === 'object') runtimeSecrets = data as Record<string, string>;
  })();
  await secretsPromise;
}
const handler = createGooglePlacesHandler({
  env: name => Deno.env.get(name) || runtimeSecrets[name],
  fetch: (input, init) => fetch(input, init),
  cacheCoordinates: async (placeId, latitude, longitude) => {
    const { data, error } = await admin().rpc('cache_google_place_coordinates', { p_place_id: placeId, p_latitude: latitude, p_longitude: longitude });
    if (error || !data?.expiresAt) throw new Error('Venue coordinates could not be refreshed.');
    return { expiresAt: String(data.expiresAt) };
  },
  authenticate: async request => {
    const authorization = request.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) throw new Error('Authentication required.');
    const client = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_ANON_KEY') || '', {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authorization } },
    });
    const { data, error } = await client.auth.getUser(authorization.slice(7));
    if (error || !data.user || data.user.is_anonymous) throw new Error('Authentication required.');
    const { data: appUserId, error: appUserError } = await client.rpc('get_current_app_user_id');
    if (appUserError || !Number.isSafeInteger(Number(appUserId)) || Number(appUserId) <= 0) throw new Error('Active account required.');
  },
});

Deno.serve(async request => {
  await loadRuntimeSecrets();
  return handler(request);
});
