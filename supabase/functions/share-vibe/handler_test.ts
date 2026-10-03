import { strict as assert } from 'node:assert';
import { createShareVibeHandler } from './handler.ts';
type Row = Record<string, unknown>;
function fixture(change: {vibe?: Row|null;author?: Row|null;auth?: Row|null;failure?: string;sign?: string|null} = {}) {
 const calls: string[]=[];
 const vibe={id:1,event_id:null,user_id:120,visibility:'public',caption:'Synthetic public moment',media_type:'photo',media_url:'owner/qa/image.png',...change.vibe};
 const author={id:120,fullname:'Example Creator',username:'example',is_active:1,is_delete:0,deactivated_at:null,auth_user_id:'auth-owner',email:'secret@example.com',phone:'private-phone',...change.author};
 const auth={id:'auth-owner',banned_until:null,deleted_at:null,...change.auth};
 const handler=createShareVibeHandler({
  loadVibe:async()=>{calls.push('vibe');if(change.failure==='throw')throw Error('secret-server-detail');return{data:change.vibe===null?null:vibe,error:change.failure==='vibe'};},
  loadAuthor:async()=>{calls.push('author');return{data:change.author===null?null:author,error:change.failure==='author'};},
  loadAuthUser:async()=>{calls.push('auth');return{data:change.auth===null?null:auth,error:change.failure==='auth'};},
  signImage:async path=>{calls.push(`sign:${path}`);return 'sign'in change?change.sign!: 'https://storage.example/signed-image.png?token=test';},
  now:()=>Date.parse('2026-10-04T00:00:00Z'),
 });
 return {calls,request:async(id='1')=>{const response=await handler(new Request(`https://example.com/share-vibe?id=${id}`));return{response,body:await response.text()};}};
}
Deno.test('Active standalone public photo publishes only safe escaped metadata and authorized signed image',async()=>{
 const f=fixture();const{response,body}=await f.request();assert.equal(response.status,200);assert.match(body,/og:image/);assert.match(body,/Synthetic public moment/);assert.match(body,/share\/vibe\/1/);assert.match(body,/#\/vibe\/1/);assert.match(body,/signed-image.png/);assert.deepEqual(f.calls,['vibe','author','auth','sign:owner/qa/image.png']);assert.equal(response.headers.get('cache-control'),'no-store');for(const secret of ['secret@example.com','private-phone','auth-owner'])assert(!body.includes(secret));
});
for(const id of ['0','-1','abc','1.5','9007199254740992'])Deno.test(`Invalid ID ${id} fails before lookup`,async()=>{const f=fixture();assert.equal((await f.request(id)).response.status,404);assert.deepEqual(f.calls,[]);});
for(const[name,change]of Object.entries({missing:{vibe:null},private:{vibe:{visibility:'private'}},activity:{vibe:{visibility:'activity'}},'public parent forged public':{vibe:{event_id:203}},'private parent forged public':{vibe:{event_id:300}},'wrong row':{vibe:{id:2}},'missing author':{author:null},'inactive author':{author:{is_active:0}},'deleted author':{author:{is_delete:1}},'deactivated author':{author:{deactivated_at:'2026-01-01'}},'missing auth binding':{author:{auth_user_id:null}},'missing Auth user':{auth:null},'deleted Auth user':{auth:{deleted_at:'2026-01-01'}},'banned Auth user':{auth:{banned_until:'2099-01-01'}},'malformed ban fails closed':{auth:{banned_until:'invalid'}},'mismatched Auth user':{auth:{id:'another'}},'wrong author':{author:{id:121}},'vibe error':{failure:'vibe'},'author error':{failure:'author'},'Auth error':{failure:'auth'},'backend exception':{failure:'throw'}}))Deno.test(`${name}: no metadata or media capability`,async()=>{const f=fixture(change);const{response,body}=await f.request();assert.equal(response.status,404);assert.equal(body,'Vibe not found');assert.equal(response.headers.get('cache-control'),'no-store');assert(!f.calls.some(x=>x.startsWith('sign:')));});
Deno.test('Expired ban allows current active author',async()=>{assert.equal((await fixture({auth:{banned_until:'2020-01-01'}}).request()).response.status,200);});
Deno.test('Author fallback is escaped and exposes no private identity',async()=>{const {body}=await fixture({vibe:{caption:''},author:{fullname:'<Creator & "Friend">'}}).request();assert(body.includes('&lt;Creator &amp; &quot;Friend&quot;&gt;'));assert(!body.includes('<Creator'));});
Deno.test('Caption markup is escaped',async()=>{const{body}=await fixture({vibe:{caption:'<img src=x onerror="alert(1)">'}}).request();assert(!body.includes('<img src=x'));assert(body.includes('&lt;img'));});
for(const[name,vibe]of Object.entries({'video without poster':{media_type:'video',media_url:'owner/movie.mp4'},'video mistaken for thumbnail':{media_type:'video',thumbnail_url:'owner/movie.MP4'},'signed video mistaken for photo':{media_url:'https://example.com/movie.mp4?token=test'},'unsafe URL':{media_url:'javascript:alert(1)'},'protocol relative URL':{media_url:'//example.com/image.png'}}))Deno.test(`${name} uses branded image without signing video`,async()=>{const f=fixture({vibe});const {response,body}=await f.request();assert.equal(response.status,200);assert.match(body,/og:image" content="https:\/\/wenitro-app.vercel.app\/wenitro-share.png/);assert(!f.calls.some(x=>x.startsWith('sign:')));});
Deno.test('Real video poster is signed, while source video is never signed',async()=>{const f=fixture({vibe:{media_type:'video',media_url:'owner/movie.mp4',thumbnail_url:'owner/poster.jpg'}});assert.equal((await f.request()).response.status,200);assert(f.calls.includes('sign:owner/poster.jpg'));assert(!f.calls.includes('sign:owner/movie.mp4'));});
Deno.test('Failed image signing falls back to brand without leaking storage path',async()=>{const{body}=await fixture({sign:null}).request();assert.match(body,/wenitro-share.png/);assert(!body.includes('owner/qa/image.png'));});
