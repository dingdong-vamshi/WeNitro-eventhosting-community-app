const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};
const generic = 'If this email belongs to an email/password WeNitro account, a secure reset link has been sent.';
type Dependencies = {
  hasPasswordIdentity: (email: string) => Promise<boolean>;
  sendReset: (email: string) => Promise<void>;
  wait?: (ms: number) => Promise<void>;
  minimumResponseMs?: number;
};
export function createPasswordRecoveryHandler(dependencies: Dependencies) {
  return async (request: Request) => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed.' }), { status: 405, headers });
    const started = Date.now();
    let email = '';
    try {
      if (Number(request.headers.get('content-length') || 0) > 1024) throw new Error('invalid');
      const raw = await request.text();
      if (raw.length > 1024) throw new Error('invalid');
      const body = JSON.parse(raw);
      email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('invalid');
    } catch {
      return new Response(JSON.stringify({ error: 'Enter a valid email address.' }), { status: 400, headers });
    }
    try {
      if (await dependencies.hasPasswordIdentity(email)) await dependencies.sendReset(email);
    } catch {
      // The public response stays provider- and account-enumeration safe.
    }
    const elapsed = Date.now() - started;
    const remaining = Math.max(0, (dependencies.minimumResponseMs ?? 450) - elapsed);
    if (remaining) await (dependencies.wait ?? (ms => new Promise(resolve => setTimeout(resolve, ms))))(remaining);
    return new Response(JSON.stringify({ message: generic }), { status: 202, headers });
  };
}
