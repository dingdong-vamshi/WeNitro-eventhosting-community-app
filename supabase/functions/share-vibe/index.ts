import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.112.4';
import { createShareVibeHandler } from './handler.ts';

function secretKey() {
  const modern = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (modern) {
    try { return JSON.parse(modern).default as string; } catch { /* legacy fallback below */ }
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
}
Deno.serve(async request => {
  const admin = createClient(Deno.env.get('SUPABASE_URL') || '', secretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return await createShareVibeHandler({
    loadVibe: async id => await admin.from('tbl_activity_vibes')
      .select('id,event_id,user_id,caption,media_url,thumbnail_url,media_type,visibility')
      .eq('id', id).eq("visibility", "public").is('event_id', null).maybeSingle(),
    loadAuthor: async id => await admin.from('tbl_users')
      .select('id,username,fullname,auth_user_id,is_active,is_delete,deactivated_at').eq('id', id).maybeSingle(),
    loadAuthUser: async id => {
      const { data, error } = await admin.auth.admin.getUserById(id);
      return { data: data?.user as unknown as Record<string, unknown> | null, error };
    },
    signImage: async path => {
      const { data, error } = await admin.storage.from('vibes').createSignedUrl(path, 300);
      return error ? null : data?.signedUrl || null;
    },
  })(request);
});
