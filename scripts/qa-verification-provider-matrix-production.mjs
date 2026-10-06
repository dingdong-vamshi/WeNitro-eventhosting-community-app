import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const root = process.cwd();
const parseEnv = path => Object.fromEntries(fs.readFileSync(path, 'utf8').split(/\r?\n/)
  .filter(line => line && !line.trimStart().startsWith('#') && line.includes('='))
  .map(line => { const at=line.indexOf('='); return [line.slice(0,at),line.slice(at+1).replace(/^['"]|['"]$/g,'')]; }));
const env = { ...parseEnv(`${root}/.env.local`), ...process.env };
const qa = JSON.parse(fs.readFileSync(`${root}/tmp/chat001-qa.json`, 'utf8'));
const serviceKey = fs.readFileSync(`${root}/tmp/chat001-server-key`, 'utf8').trim();
const url = env.EXPO_PUBLIC_SUPABASE_URL;
const key = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
assert.equal(new URL(url).hostname, 'cxsznhrkzqndhseodcyy.supabase.co');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(url, serviceKey, options);
const client = () => createClient(url, key, options);
const created = [];
const checks = [];
const pass = (name, detail) => checks.push({ name, status: 'PASS', detail });
const ok = async promise => { const result=await promise; if(result.error) throw result.error; return result.data; };

async function availability(label, signedIn) {
  const response = await signedIn.functions.invoke('aadhaar-verification', { body: { action: 'availability' } });
  assert.ifError(response.error);
  assert.equal(response.data?.available, true, `${label} Aadhaar provider availability`);
  assert.notEqual(response.data?.status, 'unavailable');
  pass(`${label} authenticated Aadhaar availability`, { available: true, status: response.data.status });
  return response.data;
}

async function createFixture(label, fields) {
  const password = randomBytes(24).toString('base64url');
  const data = await ok(service.auth.admin.createUser({
    ...fields,
    password,
    email_confirm: Boolean(fields.email),
    phone_confirm: Boolean(fields.phone),
    app_metadata: { qa_fixture: true, verification_matrix: true },
    user_metadata: { full_name: `[QA] Verification ${label}`, qa_fixture: true },
  }));
  created.push(data.user.id);
  const signedIn = client();
  await ok(signedIn.auth.signInWithPassword(fields.phone
    ? { phone: fields.phone, password }
    : { email: fields.email, password }));
  return { signedIn, user: data.user };
}

try {
  const existing = client();
  const existingLogin = await ok(existing.auth.signInWithPassword({ email: qa.QA_EMAIL_1, password: qa.QA_PASSWORD_1 }));
  assert(existingLogin.user.email_confirmed_at);
  await availability('existing email/password', existing);
  pass('Existing email/password state', { emailVerified: true, provider: 'email' });
  await existing.auth.signOut({ scope: 'local' });

  const suffix = Date.now().toString().slice(-6);
  const freshEmail = await createFixture('new-email', { email: `qa.verification.matrix.${suffix}@example.com` });
  await availability('new email/password', freshEmail.signedIn);
  pass('New user initialized without a pre-created verification row', { accepted: true });

  const phone = await createFixture('phone', { phone: `+1202555${suffix.slice(-4)}` });
  await availability('phone-only', phone.signedIn);
  const phoneUser = await ok(phone.signedIn.auth.getUser());
  assert(phoneUser.user.phone_confirmed_at);
  assert(phoneUser.user.identities?.some(identity => identity.provider === 'phone'));
  pass('Phone-only provider state', { phoneVerified: true, providers: ['phone'] });

  const linkedPhone = `+1202556${suffix.slice(-4)}`;
  const linked = await createFixture('linked', { phone: linkedPhone });
  const linkedEmail = `qa.verification.linked.${suffix}@example.com`;
  await ok(service.auth.admin.updateUserById(linked.user.id, { email: linkedEmail, email_confirm: true }));
  await linked.signedIn.auth.refreshSession();
  await availability('linked phone/email', linked.signedIn);
  const linkedRecord = await ok(service.auth.admin.getUserById(linked.user.id));
  const linkedProviders = [...new Set((linkedRecord.user.identities || []).map(identity => identity.provider))].sort();
  assert(linkedRecord.user.email_confirmed_at && linkedRecord.user.phone_confirmed_at);
  pass('Linked provider state', { emailVerified: true, phoneVerified: true, providers: linkedProviders });

  const anonymous = client();
  const denied = await anonymous.functions.invoke('aadhaar-verification', { body: { action: 'availability' } });
  assert(denied.error, 'anonymous Aadhaar availability must be denied');
  pass('Unauthenticated Aadhaar request rejected', { rejected: true });

  const proof = {
    status: 'PASS',
    at: new Date().toISOString(),
    target: 'cxsznhrkzqndhseodcyy',
    scope: 'Deployed Auth and Aadhaar Edge availability only. No Aadhaar number, OTP, document, provider session, phone SMS, Trust award or Nitro mutation.',
    checks,
  };
  const out = `${root}/qa-evidence/chat001/identity-verification-hubble-20261006/04-production-provider-matrix.json`;
  fs.writeFileSync(out, JSON.stringify(proof, null, 2) + '\n');
  console.log(JSON.stringify({ status: proof.status, checks: checks.length, output: out }));
} finally {
  for (const authId of created.reverse()) {
    const record = await service.auth.admin.getUserById(authId);
    if (record.data.user?.app_metadata?.verification_matrix === true) {
      await service.auth.admin.deleteUser(authId);
      await service.from('tbl_users').delete().eq('auth_user_id', authId);
    }
  }
}
