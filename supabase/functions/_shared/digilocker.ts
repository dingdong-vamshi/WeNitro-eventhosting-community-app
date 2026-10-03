export const CONSENT_VERSION = 'wenitro-aadhaar-digilocker-v1';
type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function providerUuid(value: unknown) {
 if (typeof value !== 'string' || !uuidPattern.test(value)) throw new Error('Provider returned an invalid verification reference.');
 return value;
}
export type DigiLockerConfig = { environment: 'test' | 'production'; key: string; secret: string; redirectUrl: string };
export function digilockerConfiguration(env: (name: string) => string | undefined): DigiLockerConfig | null {
 if (env('AADHAAR_DIGILOCKER_ENABLED') !== 'true') return null;
 const environment = env('SANDBOX_ENVIRONMENT');
 if (environment !== 'test' && environment !== 'production') return null;
 if (environment === 'production' && env('AADHAAR_DIGILOCKER_PRODUCTION_APPROVED') !== 'true') return null;
 const key = env('SANDBOX_API_KEY')?.trim(), secret = env('SANDBOX_API_SECRET')?.trim();
 const redirectUrl = env('AADHAAR_DIGILOCKER_REDIRECT_URL')?.trim();
 if (!key || !secret || !redirectUrl) return null;
 try { const url = new URL(redirectUrl); if (url.protocol !== 'https:' || url.username || url.password) return null; } catch { return null; }
 return { environment, key, secret, redirectUrl };
}
export function safeAuthorizationUrl(value: unknown) {
 if (typeof value !== 'string') throw new Error('Provider did not return a verification link.');
 let url: URL;
 try { url = new URL(value); } catch { throw new Error('Provider returned an unsupported verification link.'); }
 if (url.protocol !== 'https:' || url.username || url.password || !['digilocker.meripehchaan.gov.in','digilocker.gov.in'].includes(url.hostname)) throw new Error('Provider returned an unsupported verification link.');
 return value;
}
export function parseSessionStatus(payload: unknown, ownedProviderId: string) {
 const response = record(payload), data = record(response.data);
 if (response.code !== 200 || providerUuid(data.id) !== ownedProviderId || data['@entity'] !== 'in.co.sandbox.kyc.digilocker.session') throw new Error('Provider session does not match this account.');
 const status = String(data.status);
 if (!['created','succeeded','failed','expired'].includes(status)) throw new Error('Provider returned an unsupported session status.');
 const consented = Array.isArray(data.documents_consented) && data.documents_consented.includes('aadhaar');
 return { status: status as 'created'|'succeeded'|'failed'|'expired', consented, transactionId: providerUuid(response.transaction_id) };
}
export function hasIssuedAadhaar(payload: unknown) {
 const response = record(payload), data = record(response.data);
 if (response.code !== 200 || !Array.isArray(data.files)) return false;
 return data.files.some(value => {
  const file = record(value), metadata = record(file.metadata);
  // Inspect only the provider's issued-document metadata. Never download, store
  // or forward the document URL/content, demographics or number to the client.
  return file['@entity'] === 'org.quicko.drive.file' && metadata.issuer_id === 'in.gov.uidai'
   && metadata.ContentType === 'application/xml' && Number(file.size) > 0;
 });
}
export function createDigiLockerProvider(config: DigiLockerConfig, fetcher: typeof fetch = fetch) {
 const base = config.environment === 'production' ? 'https://api.sandbox.co.in' : 'https://test-api.sandbox.co.in';
 const request = async (path: string, method: string, body?: unknown, token?: string) => {
  let response: Response;
  try {
   response = await fetcher(base+path, { method, redirect: 'error', signal: AbortSignal.timeout(15_000), headers: {
    'Content-Type':'application/json','x-api-key':config.key,'x-api-version':'1.0.0',
    ...(token ? {Authorization:token} : {'x-api-secret':config.secret}),
   }, ...(body === undefined ? {} : {body:JSON.stringify(body)}) });
  } catch { throw new Error('Identity provider could not be reached. Please try again.'); }
  // Provider error bodies can contain identity data; do not expose or log them.
  if (!response.ok) throw new Error(response.status === 429 ? 'Verification is busy. Please wait and retry.' : 'Identity provider could not complete this request.');
  try { return record(await response.json()); } catch { throw new Error('Identity provider returned an invalid response.'); }
 };
 const authenticate = async () => {
  const response = await request('/authenticate','POST');
  const token = record(response.data).access_token;
  if (response.code !== 200 || typeof token !== 'string' || !token) throw new Error('Identity provider authentication failed.');
  return token;
 };
 return {
  async initiate() {
   const token = await authenticate();
   const response = await request('/kyc/digilocker/sessions/init','POST',{
    '@entity':'in.co.sandbox.kyc.digilocker.session.request',flow:'signin',redirect_url:config.redirectUrl,doc_types:['aadhaar'],
   },token);
   const data = record(response.data);
   if (response.code !== 200 || data['@entity'] !== 'in.co.sandbox.kyc.digilocker.session.response') throw new Error('Identity provider could not start verification.');
   return {providerId:providerUuid(data.session_id),authorizationUrl:safeAuthorizationUrl(data.authorization_url),transactionId:providerUuid(response.transaction_id)};
  },
  async refresh(providerId: string) {
   providerUuid(providerId);
   const token = await authenticate();
   const status = parseSessionStatus(await request(`/kyc/digilocker/sessions/${providerId}/status`,'GET',undefined,token),providerId);
   if (status.status !== 'succeeded' || !status.consented) return {...status,issuedAadhaar:false};
   const document = await request(`/kyc/digilocker/sessions/${providerId}/documents/aadhaar`,'GET',undefined,token);
   return {...status,issuedAadhaar:hasIssuedAadhaar(document)};
  },
 };
}
