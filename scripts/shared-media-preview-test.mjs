import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const compile=(source,deps={})=>{const exports={};new Function('exports',...Object.keys(deps),ts.transpile(source,{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}))(exports,...Object.values(deps));return exports;};
let state=null;const React={createElement:(type,props,...children)=>typeof type==='function'?type(props):({type,props:props||{},children})};
const api=compile(fs.readFileSync('src/components/shared-media-preview.tsx','utf8'),{require:name=>name==='react'?{...React,default:React,__esModule:true,useState:()=>[state,value=>state=value]}:{Image:'Image',View:'View',Text:'Text',StyleSheet:{create:x=>x}}});
const video='https://project.supabase.co/storage/v1/object/sign/vibes/owner/clip.MP4?token=signed-private-capability';
const poster='https://project.supabase.co/storage/v1/object/sign/vibes/owner/poster.jpg?token=original%2Bcapability';
for(const uri of [video,'https://host/clip%2Emp4?token=x','https://host/stream?content-type=video%2Fmp4','https://host/stream?response-content-type=video%2Fwebm','owner/movie.mov','https://host/stream.m3u8']){
 eq(api.isSharedVideoUrl(uri),true);state=null;const tree=api.SharedMediaPreview({uri,kind:'vibe'});eq(tree.type,'View');eq(tree.props.accessibilityLabel,'Video preview');
}
for(const uri of [poster,'https://host/poster.jpg?movie=clip.mp4','https://host/opaque-image?token=x']){eq(api.isSharedVideoUrl(uri),false);state=null;const tree=api.SharedMediaPreview({uri,kind:'vibe'});eq(tree.type,'Image');eq(tree.props.source.uri,uri);}
state=null;const image=api.SharedMediaPreview({uri:poster,kind:'vibe'});image.props.onError();let tree=api.SharedMediaPreview({uri:poster,kind:'vibe'});eq(tree.type,'View');eq(tree.props.accessibilityLabel,'Preview unavailable');
const refreshed=poster+'&refresh=1';tree=api.SharedMediaPreview({uri:refreshed,kind:'vibe'});eq(tree.type,'Image');eq(tree.props.source.uri,refreshed);image.props.onError();eq(api.SharedMediaPreview({uri:refreshed}).type,'Image');
state=null;eq(api.SharedMediaPreview({kind:'vibe'}).props.accessibilityLabel,'Vibe preview');eq(api.SharedMediaPreview({kind:'activity'}).props.accessibilityLabel,'Shared content');
// Execute each actual mount JSX; verify all three surfaces choose the same safe
// renderer while preserving the authorized signed image URL without rewriting.
for(const file of ['App.tsx','src/components/community/reference-community.tsx','src/components/ShareToChatModal.tsx']){
 const source=fs.readFileSync(file,'utf8'),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let node;
 const walk=n=>{if(ts.isJsxSelfClosingElement(n)&&n.tagName.getText(ast)==='SharedMediaPreview')node=n;ts.forEachChild(n,walk)};walk(ast);assert(node,`${file} shared renderer missing`);checks++;
 for(const uri of [video,poster,null]){
  state=null;const payload={kind:'vibe',thumbnailUrl:uri,entityId:'135'};
  const mount=compile(`exports.render=()=>${node.getText(ast)}`,{React,SharedMediaPreview:api.SharedMediaPreview,message:{share:payload,share_payload:payload},entity:payload,data:{vibes:[]}}).render;
  const result=mount();eq(result.type,uri===poster?'Image':'View');if(uri===poster)eq(result.props.source.uri,poster);if(uri===video)eq(result.props.accessibilityLabel,'Video preview');
 }
}
console.log(JSON.stringify({status:'PASS',checks,scope:'Actual renderer and all3 mount JSX; signed/encoded/stream video never fed to Image; image posters retain exact authorized URL; failed images show explicit fallback; stale image errors do not hide refreshed URL; no media lookup/download/public-URL conversion.'}));
