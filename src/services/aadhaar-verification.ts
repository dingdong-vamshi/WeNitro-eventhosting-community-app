import { supabase } from '../lib/supabase';
export const AADHAAR_CONSENT_VERSION = 'wenitro-aadhaar-digilocker-v1';
export type AadhaarVerificationState = { available:boolean; verified:boolean; status:string; testMode?:boolean; authorizationUrl?:string; message?:string };
async function invoke(action:'availability'|'begin'|'refresh',consent=false):Promise<AadhaarVerificationState> {
 const {data,error} = await supabase.functions.invoke('aadhaar-verification',{body:{action,...(action==='begin'?{consent,consentVersion:AADHAAR_CONSENT_VERSION}:{})}});
 if (error) {
  let message='Aadhaar verification could not continue. Please try again.';
  if ('context' in error && error.context instanceof Response) {try {const body=await error.context.json();if(typeof body.error==='string')message=body.error;}catch { /* fixed fallback */ }}
  throw new Error(message);
 }
 if (!data || typeof data.available!=='boolean' || typeof data.verified!=='boolean' || typeof data.status!=='string') throw new Error('Aadhaar verification returned an invalid result.');
 if (data.authorizationUrl) {
  const url=new URL(data.authorizationUrl);
  if(url.protocol!=='https:' || url.username || url.password || !['digilocker.meripehchaan.gov.in','digilocker.gov.in'].includes(url.hostname)) throw new Error('Verification link is unavailable.');
 }
 return data as AadhaarVerificationState;
}
export const aadhaarVerificationService={availability:()=>invoke('availability'),begin:(consent:boolean)=>invoke('begin',consent),refresh:()=>invoke('refresh')};
