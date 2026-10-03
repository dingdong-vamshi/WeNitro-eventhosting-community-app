import React,{useEffect,useRef,useState} from 'react';
import {Linking,Pressable,Text,View} from 'react-native';
import {aadhaarVerificationService,type AadhaarVerificationState} from '../services/aadhaar-verification';
import {captureShareScope} from '../services/internal-share';
import {Button,ErrorLine,usePalette} from './reconstruction/ui';
export function AadhaarVerificationCard({verified,onVerified}:{verified:boolean;onVerified:()=>Promise<void>}) {
 const c=usePalette(),alive=useRef(true),locked=useRef(false);
 const [state,setState]=useState<AadhaarVerificationState|null>(null),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const available=state?.available===true,complete=verified||state?.verified===true;
 const run=async(action:'availability'|'begin'|'refresh')=>{
  if(locked.current)return;locked.current=true;setBusy(true);setError('');const current=captureShareScope();
  try {
   const next=action==='begin'?await aadhaarVerificationService.begin(consent):await aadhaarVerificationService[action]();
   if(!alive.current||!current())return;setState(next);
   if(next.authorizationUrl)await Linking.openURL(next.authorizationUrl);
   if(!alive.current||!current())return;
   if(next.verified)await onVerified();
  }catch(error){if(alive.current&&current())setError(error instanceof Error?error.message:'Verification could not continue.');}
  finally{locked.current=false;if(alive.current&&current())setBusy(false);}
 };
 useEffect(()=>{alive.current=true;void run('availability');return()=>{alive.current=false;};},[]);
 return <View style={{backgroundColor:c.card,borderRadius:16,padding:17,borderWidth:1,borderColor:c.border,gap:10}}>
  <View style={{flexDirection:'row'}}><Text style={{color:c.text,fontWeight:'700',fontSize:15,flex:1}}>Aadhaar Verification</Text><Text style={{color:complete?'#198457':c.muted,fontSize:12,fontWeight:'700'}}>+20</Text></View>
  <Text style={{color:c.muted,fontSize:12,lineHeight:18}}>{complete?'Aadhaar verified · +20 Trust Score.':state===null?'Checking Aadhaar verification availability…':available?'Verify through Sandbox DigiLocker. Enter Aadhaar details and OTP only on DigiLocker’s secure page.':'Aadhaar verification is not enabled yet. Provider onboarding and authorized configuration are required.'}</Text>
  {state?.testMode?<Text style={{color:c.muted}}>Test mode: completion does not verify your real identity or add Trust Score.</Text>:null}
  {available&&!complete?<>
   <Text style={{color:c.muted,fontSize:12,lineHeight:18}}>WeNitro retains your verification result and provider reference, not your Aadhaar number, OTP, document or photo. Continue only to verify your own identity.</Text>
   <Pressable accessibilityRole="checkbox" accessibilityLabel="Consent to Aadhaar verification through DigiLocker" accessibilityState={{checked:consent}} onPress={()=>setConsent(value=>!value)} disabled={busy} style={{minHeight:48,justifyContent:'center'}}><Text style={{color:c.text}}>{consent?'☑':'☐'} I consent to share my Aadhaar verification result with WeNitro through Sandbox DigiLocker.</Text></Pressable>
   <Button label="Continue to DigiLocker" busy={busy} disabled={!consent||busy} onPress={()=>void run('begin')}/>
   {state?.authorizationUrl?<Button label="Reopen DigiLocker" disabled={busy} onPress={()=>void Linking.openURL(state.authorizationUrl!).catch(()=>setError('DigiLocker could not open. Please try again.'))}/>:null}
   {state?.status&&state.status!=='not_started'?<Button label="Check verification status" busy={busy} disabled={busy} onPress={()=>void run('refresh')}/>:null}
   <Text style={{color:c.muted,fontSize:12}}>After completing or declining consent, return here and check the status. A redirect alone never marks you verified.</Text>
  </>:null}
  {state?.message?<Text style={{color:c.muted}}>{state.message}</Text>:null}
  {!complete&&state&&['failed','expired'].includes(state.status)?<Text style={{color:c.muted}}>This session ended. Start again when you are ready.</Text>:null}
  <ErrorLine text={error}/>{error?<Button label="Retry verification availability" busy={busy} onPress={()=>void run('availability')}/>:null}
 </View>;
}
