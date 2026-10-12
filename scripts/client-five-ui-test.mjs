import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

let authUser = { phone: null, phone_confirmed_at: null };
let verifyMode = 'success';
const rpcCalls = [];
const auth = {
  getUser: async () => ({ data: { user: { ...authUser } }, error: null }),
  updateUser: async ({ phone }) => ({ data: { user: { ...authUser, phone } }, error: null }),
  resend: async () => ({ data: {}, error: null }),
  verifyOtp: async ({ phone }) => {
    if (verifyMode === 'wrong') return { data: {}, error: { message: 'Token has expired or is invalid' } };
    if (verifyMode === 'timeout-after-commit') {
      authUser = { phone, phone_confirmed_at: '2026-10-06T12:00:00Z' };
      return { data: {}, error: { message: 'Network request failed' } };
    }
    authUser = { phone, phone_confirmed_at: '2026-10-06T12:00:00Z' };
    return { data: { user: { ...authUser } }, error: null };
  },
};
const supabase = {
  auth,
  rpc: async name => {
    rpcCalls.push(name);
    if (name === 'sync_my_phone_verification') return { data: null, error: { message: 'projection unavailable' } };
    return { data: null, error: null };
  },
  storage: { from: () => ({ getPublicUrl: path => ({ data: { publicUrl: path } }) }) },
};
// Exercise today's direct Auth transport; the old fixture mocked an SDK path
// that the production service no longer calls.
const phoneModule = {};
const response = (body, status=200) => new Response(JSON.stringify(body), {status});
const transport = async (url, init={}) => {
  const endpoint = new URL(url).pathname;
  const body = init.body ? JSON.parse(init.body) : {};
  if (endpoint.endsWith('/user') && init.method === 'PUT') return response({id:'qa-user',...authUser,phone:body.phone});
  if (endpoint.endsWith('/user')) return response({id:'qa-user',...authUser});
  if (endpoint.endsWith('/verify')) {
    const result = await auth.verifyOtp(body);
    return result.error ? response(result.error, result.error.message.includes('Network') ? 503 : 422) : response({user:{id:'qa-user',...authUser}});
  }
  if (endpoint.includes('/rpc/')) { const result=await supabase.rpc(endpoint.split('/').at(-1));return response(result.error || {},result.error?503:200); }
  if (endpoint.endsWith('/resend')) return response({});
  throw Error('Unexpected transport '+endpoint);
};
new Function('exports','require','process','fetch',ts.transpile(fs.readFileSync('src/services/phone-change.ts','utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}))(phoneModule,name=>{
  if(name==='../lib/supabase')return {supabase:{auth:{getSession:async()=>({data:{session:{access_token:'fixture',user:{id:'qa-user'}}},error:null})}}};
  if(name==='./auth-production')return {phoneOtpErrorMessage:error=>error.message};
  if(name==='./request-deadline')return {withRequestDeadline:task=>task(new AbortController().signal)};
  throw Error(name);
},{env:{EXPO_PUBLIC_SUPABASE_URL:'https://qa.invalid',EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'fixture'}},transport);
const exports = {};
new Function('exports', 'require', ts.transpile(fs.readFileSync('src/services/reference-delta.ts', 'utf8'), {
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2022,
}))(exports, name => {
  if (name === '../lib/supabase') return { supabase };
  if (name === './phone-change') return phoneModule;
  if (name === './auth-production') return {
    normalizeIndianPhone: phone => `+91${phone.replace(/\D/g, '').slice(-10)}`,
    phoneOtpErrorMessage: error => error.message || 'Phone verification failed.',
  };
  if (name === './profile-production') return { profileProductionService: {} };
  if (name === './request-deadline') return { withRequestDeadline: task => task() };
  throw new Error(`Unexpected import: ${name}`);
});

const service = exports.referenceDeltaService;
const phone = '9876543210';

authUser = { phone: null, phone_confirmed_at: null };
await service.requestPhoneChange(phone);
assert.equal(authUser.phone_confirmed_at, null, 'sending an OTP must not verify the phone');

verifyMode = 'wrong';
await assert.rejects(() => service.verifyPhoneChange(phone, '111111'), /expired|invalid/i);
assert.equal(authUser.phone_confirmed_at, null, 'wrong OTP must not mutate verified state');

verifyMode = 'success';
assert.equal(await service.verifyPhoneChange(phone, '123456'), '+919876543210');
assert.ok(authUser.phone_confirmed_at, 'valid OTP must produce server-confirmed state');
assert.deepEqual(rpcCalls.slice(-2), ['sync_my_phone_verification', 'sync_my_verification']);

authUser = { phone: null, phone_confirmed_at: null };
verifyMode = 'timeout-after-commit';
assert.equal(await service.verifyPhoneChange(phone, '123456'), '+919876543210', 'a client timeout after server commit is reconciled safely');

authUser = { phone: '+919876543210', phone_confirmed_at: '2026-10-06T12:00:00Z' };
verifyMode = 'wrong';
assert.equal(await service.verifyPhoneChange(phone, '111111'), '+919876543210',
  'an already server-confirmed phone reconciles idempotently without a new verification');

const app = fs.readFileSync('App.tsx', 'utf8');
assert.match(app, /selected\.type === ['"]Groups['"][\s\S]{0,500}Create Poll/,
  'the personal chat action menu must not expose Poll');
assert.match(app, /pollOpen && selected\.type === ['"]Groups['"]/,
  'the personal chat route must not mount the poll composer');

const messages = fs.readFileSync('src/components/reconstruction/messages.tsx', 'utf8');
assert.match(messages, /listEligibleGroupMembers\(/);
assert.match(messages, /Search Squad members/);
assert.match(messages, /Add people to your Squad to create a group/);
assert.match(messages, /groupMembers\.length < 2/);

const profile = fs.readFileSync('src/components/reconstruction/profile.tsx', 'utf8');
const community = fs.readFileSync('src/components/community/community-info.tsx', 'utf8');
assert.match(profile, /Report User/);
assert.match(community, /Report Community/);

const story = fs.readFileSync('src/services/stories-production.ts', 'utf8');
assert.match(story, /\.gt\(['"]expires_at['"], new Date\(\)\.toISOString\(\)\)/,
  'story reads must exclude expired rows');

const pollCard = fs.readFileSync('src/components/community/reference-community.tsx', 'utf8');
assert.match(pollCard, /votersByOption/);
assert.match(pollCard, /option\.id/);

console.log('PASS: phone send-only/wrong/success/timeout reconciliation, Squad-only group UI, personal-poll removal, reporting entry points, 24-hour Story visibility filter, and option-specific voter display.');
