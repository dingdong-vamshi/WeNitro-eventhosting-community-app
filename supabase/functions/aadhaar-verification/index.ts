import {adminClient,authenticatedContext} from '../_shared/cashfree.ts';
import {createAadhaarHandler} from './handler.ts';
Deno.serve(createAadhaarHandler({
 env:name=>Deno.env.get(name),
 authenticate:async request=>{
  const {user,client}=await authenticatedContext(request);
  const identity=await client.rpc('get_current_app_user_id');
  return {authId:user.id,allowed:!identity.error&&Boolean(identity.data)};
 },
 ledger:async(authId,args)=>await adminClient().rpc('aadhaar_otp_session_service',{p_auth_id:authId,...args}),
}));
