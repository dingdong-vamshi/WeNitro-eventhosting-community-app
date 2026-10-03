import {useEffect} from 'react';
import {AppState,Platform} from 'react-native';
import {supabase} from '../lib/supabase';
/** One coarse visit per UTC day/platform; errors never block the member's primary action. */
export function useUsageObservation(userId:string|null|undefined,eventId:string|null) {
 useEffect(()=>{
  if(!userId)return;
  let active=true;
  const record=()=>{if(!active)return;void supabase.rpc('record_app_usage',{p_platform:['web','ios','android'].includes(Platform.OS)?Platform.OS:'other',p_event_id:eventId?Number(eventId):null}).then(()=>undefined,()=>undefined);};
  record();const listener=AppState.addEventListener('change',state=>{if(state==='active')record();});
  return()=>{active=false;listener.remove();};
 },[userId,eventId]);
}
