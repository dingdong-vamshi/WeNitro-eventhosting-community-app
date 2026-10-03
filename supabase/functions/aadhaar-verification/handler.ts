import { CONSENT_VERSION, createDigiLockerProvider, digilockerConfiguration } from '../_shared/digilocker.ts';

type Session = {id:string;environment:'test'|'production';provider_session_id:string|null;status:string;expires_at:string;verified_at:string|null};
type Dependencies = {
 authenticate:(request:Request)=>Promise<{authId:string;allowed:boolean;syncVerified:()=>Promise<unknown>}>;
 ledger:(authId:string,args:Record<string,unknown>)=>Promise<{data:unknown;error:{message:string}|null}>;
 env:(name:string)=>string|undefined;
 fetcher?:typeof fetch;
};
const corsHeaders={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const jsonResponse=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,'Content-Type':'application/json','Cache-Control':'no-store'}});
export function createAadhaarHandler(deps:Dependencies) { return async function handleAadhaarVerification(request: Request) {
 if (request.method === 'OPTIONS') return new Response('ok',{headers:corsHeaders});
 if (request.method !== 'POST') return jsonResponse({error:'Method not allowed.'},405);
 try {
  const actor = await deps.authenticate(request);
  if (!actor.allowed) return jsonResponse({error:'Account unavailable.'},403);
  let body;
  try { body = await request.json(); } catch { return jsonResponse({error:'Invalid verification request.'},400); }
  const action = body?.action;
  if (!['availability','begin','refresh'].includes(action)) return jsonResponse({error:'Invalid verification action.'},400);
  const config = digilockerConfiguration(deps.env);
  if (!config) return jsonResponse({available:false,verified:false,status:'unavailable',message:'Aadhaar verification is not enabled yet.'});
  const ledger = async (args:Record<string,unknown>):Promise<Session|null> => {
   const {data,error} = await deps.ledger(actor.authId,args);
   if (error) throw new Error(/Please wait/.test(error.message) ? 'Please wait before starting another verification.' : 'Verification session is unavailable. Please start again.');
   return data as Session|null;
  };
  const existing = await ledger({p_action:'read'});
  const publicStatus = (session:Session|null) => ({available:true,testMode:config.environment==='test',verified:Boolean(session?.verified_at),status:session?.verified_at?'verified':session?.status??'not_started'});
  if (action === 'availability' || existing?.verified_at) return jsonResponse(publicStatus(existing));
  const provider = createDigiLockerProvider(config,deps.fetcher);
  if (action === 'begin') {
   if (body.consent !== true || body.consentVersion !== CONSENT_VERSION) return jsonResponse({error:'Your consent is required to continue.'},400);
   const session = await ledger({p_action:'begin',p_environment:config.environment});
   if (!session) throw new Error('Verification session could not start.');
   const result = await provider.initiate();
   await ledger({p_action:'update',p_environment:config.environment,p_session_id:session.id,p_provider_session_id:result.providerId,p_status:'created',p_transaction_id:result.transactionId});
   return jsonResponse({available:true,testMode:config.environment==='test',verified:false,status:'created',authorizationUrl:result.authorizationUrl});
  }
  if (!existing?.provider_session_id || existing.environment!==config.environment) return jsonResponse({error:'Start a new verification session.'},400);
  if (new Date(existing.expires_at).getTime()<=Date.now() || ['failed','expired'].includes(existing.status)) return jsonResponse({...publicStatus(existing),status:'expired',verified:false});
  await ledger({p_action:'claim_refresh',p_session_id:existing.id});
  const result = await provider.refresh(existing.provider_session_id);
  const verified = config.environment==='production' && result.status==='succeeded' && result.consented && result.issuedAadhaar;
  const recorded = await ledger({p_action:'update',p_environment:config.environment,p_session_id:existing.id,p_provider_session_id:existing.provider_session_id,p_status:result.status,p_verified:verified,p_transaction_id:result.transactionId});
  if (verified) await actor.syncVerified();
  return jsonResponse({...publicStatus(recorded),...(result.status==='succeeded'&&!verified?{message:config.environment==='test'?'Test session complete. Test results do not verify your real identity or award Trust.':'A consented UIDAI-issued Aadhaar document was not confirmed. Please start again.'}:{})});
 } catch (error) {
  const candidate = error instanceof Error ? error.message : '';
  const message = /^(Provider |Identity provider |Verification |Please wait |Account unavailable|Authentication required|Missing bearer token)/.test(candidate) ? candidate : 'Verification could not continue.';
  // Only our own fixed messages are emitted; provider bodies are never logged.
  const status = /Authentication required|Missing bearer token/.test(message)?401:400;
  return jsonResponse({error:message},status);
 }
}; }
