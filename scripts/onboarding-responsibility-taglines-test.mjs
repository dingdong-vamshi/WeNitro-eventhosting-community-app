import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const load=(file,require)=>{const exports={};new Function('exports','require',ts.transpile(fs.readFileSync(file,'utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}))(exports,require);return exports;};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
let stored=null,failRead=false,failWrite=false;
const storage={getItem:async()=>{if(failRead)throw Error('Unavailable');return stored;},setItem:async(_,value)=>{if(failWrite)throw Error('Unavailable');stored=value;}};
const selection=()=>load('src/services/splash-taglines.ts',()=>storage);
let rotations=selection();
assert.deepEqual(rotations.SPLASH_TAGLINES.map(s=>s.replaceAll('\n',' ')),['Find your perfect partner for every passion','Anything is possible with a partner',"Don't go solo. Find your partner",'Adventures are better together','From 5 AM runs to late-night study sessions']);
const first=await rotations.nextSplashTagline();const resumed=selection();assert.notEqual(await resumed.nextSplashTagline(),first,'Persisted new module/app launch cannot repeat');
const cycle=await Promise.all(Array.from({length:5},()=>resumed.nextSplashTagline()));assert.equal(new Set(cycle).size,5,'Concurrent requests serialize into all five original taglines');assert.equal(await resumed.nextSplashTagline(),cycle[0],'Rotation wraps');
for(const invalid of ['garbage','99','-1','1.5','']){stored=invalid;assert.equal(await selection().nextSplashTagline(),first,'Invalid local preference recovers');}
stored='2';failRead=true;failWrite=true;rotations=selection();const fallback=await rotations.nextSplashTagline();assert.notEqual(await rotations.nextSplashTagline(),fallback,'Unavailable storage does not block or repeat within launch');failRead=false;stored='2';rotations=selection();const stale=await rotations.nextSplashTagline();assert.notEqual(await rotations.nextSplashTagline(),stale,'Stale readable preference cannot override memory after failed write');failWrite=false;
console.log('PASS original PDF slogans, persisted nonrepeat, serialized rotation/wrap, malformed state and storage-failure recovery');

function harness() {
 const values=[],refs=[],effects=[];let stateCursor=0,refCursor=0,effectCursor=0,pending=[],tree;
 let decision,permissions=0,library=0,camera=0,cancelPicker=false;
 const react={createElement:(type,props,...children)=>({type,props:{...props,children}}),useState(initial){const i=stateCursor++;if(!(i in values))values[i]=typeof initial==='function'?initial():initial;return[values[i],v=>{values[i]=typeof v==='function'?v(values[i]):v;}];},useRef(initial){const i=refCursor++;return refs[i]??(refs[i]={current:initial});},useEffect(fn,deps){const i=effectCursor++;if(!effects[i]||deps.some((d,n)=>d!==effects[i][n])){effects[i]=deps;pending.push(fn);}}};
 const permission=async()=>{permissions++;return{granted:true};};const photo=()=>({canceled:cancelPicker,assets:[{uri:'file:///synthetic-selected-photo.png'}]});
 const api=load('src/components/onboarding/reference-screens.tsx',name=>{
  if(name==='react')return react;
  if(name==='react-native')return Object.fromEntries(['ActivityIndicator','Animated','Image','KeyboardAvoidingView','Modal','Pressable','ScrollView','Text','TextInput','View'].map(x=>[x,x]).concat([['StyleSheet',{create:x=>x}],['Platform',{OS:'ios'}],['useWindowDimensions',()=>({width:390,height:800})]]));
  if(name==='react-native-safe-area-context')return{SafeAreaView:'SafeAreaView',useSafeAreaInsets:()=>({top:0,bottom:0})};
  if(name==='expo-image-picker')return{requestCameraPermissionsAsync:permission,requestMediaLibraryPermissionsAsync:permission,launchCameraAsync:async()=>{camera++;return photo();},launchImageLibraryAsync:async()=>{library++;return photo();}};
  if(name.includes('responsible-upload'))return{useResponsibleUpload:()=>({confirmUpload:()=>new Promise(resolve=>{decision=resolve;}),uploadNotice:'Warning'})};
  if(name.includes('reconstruction/ui'))return{usePalette:()=>({})};
  if(name.includes('mobile-app-shell'))return{MOBILE_APP_MAX_WIDTH:430,MobileOverlayFrame:'Frame'};
  if(name==='expo-linear-gradient')return{LinearGradient:'Gradient'};
  if(name==='@expo/vector-icons')return{Ionicons:'Icon'};
  if(name.includes('splash-taglines'))return{nextSplashTagline:async()=>first};
  return{};
 });
 const render=()=>{stateCursor=refCursor=effectCursor=0;tree=api.ProfileCompletionScreen({initial:{fullName:'QA Member',username:'qa_member',dateOfBirth:'2000-01-01',gender:'',avatarUrl:'https://original.invalid/photo.png'},onSubmit:async()=>{},onAcceptPolicies:async()=>{},checkUsername:async()=>({available:true})});const run=pending;pending=[];run.forEach(fn=>fn());return tree;};
 function nodes(node=tree){if(!node||typeof node!=='object')return[];if(Array.isArray(node))return node.flatMap(n=>nodes(n));if(node.type==='Modal'&&!node.props.visible)return[];return[node,...nodes(node.props?.children)];}
 const label=x=>nodes().find(n=>n.props.accessibilityLabel===x);
 const button=text=>nodes().find(n=>n.type==='Pressable'&&JSON.stringify(n.props.children).includes(text));
 const choose=kind=>{label('Choose or take profile photo').props.onPress();render();button(kind==='camera'?'Take a photo':'Choose from library').props.onPress();render();};
 return{render,label,choose,resolve:v=>decision(v),get permissions(){return permissions;},get library(){return library;},get camera(){return camera;},set cancelPicker(v){cancelPicker=v;}};
}
const h=harness();h.render();h.choose('library');assert.equal(h.permissions,0,'Warning must precede permission request');assert.equal(h.library,0);h.resolve(false);await flush();h.render();assert.equal(h.permissions,0);assert.equal(h.label('Selected profile photo').props.source.uri,'https://original.invalid/photo.png','Cancel preserves photo draft');assert.equal(h.label('Choose or take profile photo').props.disabled,false,'Cancel releases busy state');
h.choose('library');assert.equal(h.library,0);h.resolve(true);await flush();h.render();assert.equal(h.library,1);assert.equal(h.permissions,1);assert.equal(h.label('Selected profile photo').props.source.uri,'file:///synthetic-selected-photo.png');
h.cancelPicker=true;h.choose('camera');assert.equal(h.camera,0);h.resolve(true);await flush();h.render();assert.equal(h.camera,1);assert.equal(h.label('Selected profile photo').props.source.uri,'file:///synthetic-selected-photo.png','OS cancellation retains prior chosen photo');
console.log('PASS actual signup photo handler: warning precedes permissions/library/camera, cancel preserves draft and resets busy, Continue opens selected picker, OS cancellation preserves previous photo');
