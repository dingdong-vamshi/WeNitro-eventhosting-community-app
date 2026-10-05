import { createClient } from 'npm:@supabase/supabase-js@2.112.4';
import { createPasswordRecoveryHandler } from './handler.ts';

const url = Deno.env.get('SUPABASE_URL') || '';
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const publicAuth = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const redirectTo = `${(Deno.env.get('WEB_APP_URL') || 'https://wenitro-app.vercel.app').replace(/\/$/, '')}/`;

Deno.serve(createPasswordRecoveryHandler({
  hasPasswordIdentity: async email => {
    const { data, error } = await admin.rpc('email_has_password_identity', { p_email: email });
    if (error) throw error;
    return data === true;
  },
  sendReset: async email => {
    const { error } = await publicAuth.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw error;
  },
}));
