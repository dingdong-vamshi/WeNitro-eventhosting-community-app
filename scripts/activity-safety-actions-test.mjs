import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';
const app=fs.readFileSync('App.tsx','utf8');const begin=app.indexOf('  const safetyDetails = `'),end=app.indexOf('  const filteredParticipants =',begin);assert(begin>0&&end>begin);
let checks=0;for(const scenario of ['share','copy','call','missing-contact','invalid-contact','failed-contact','failed-share','failed-copy','busy']){
 const calls=[],messages=[],busy=[];const action=scenario.includes('share')?'share':scenario.includes('copy')?'copy':'call';
 const source=ts.transpileModule(app.slice(begin,end)+`\nrunSafetyAction('${action}');`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 await vm.runInNewContext(source,{Error,activity:{title:'Private hike',when:'Tomorrow at 10:00',where:'Meeting point'},safetyBusy:scenario==='busy',setSafetyBusy:v=>busy.push(v),setSafetyMessage:v=>messages.push(v),
 Share:{share:async payload=>{if(scenario==='failed-share')throw Error('Share unavailable');calls.push(['share',payload]);}},Clipboard:{setStringAsync:async text=>{calls.push(['copy',text]);return scenario!=='failed-copy';}},Linking:{openURL:async url=>calls.push(['call',url])},
 referenceDeltaService:{getEmergencyContact:async()=>{if(scenario==='failed-contact')throw Error('Contact unavailable');return scenario==='missing-contact'?{}:{phone_number:scenario==='invalid-contact'?'123;evil()':'9876543210'};}}});
 if(['share','copy'].includes(scenario)){assert.equal(calls.length,1);const text=scenario==='share'?calls[0][1].message:calls[0][1];assert.match(text,/Private hike\nTomorrow at 10:00\nMeeting point/);assert.doesNotMatch(text,/https?:|invite|token/i);assert.match(text,/share my live location separately/);checks+=4;}
 if(scenario==='call'){assert.deepEqual(calls,[['call','tel:+919876543210']]);checks++;}
 if(['missing-contact','invalid-contact','failed-contact','failed-share','busy'].includes(scenario)){assert.equal(calls.length,0);checks++;}
 if(scenario==='busy'){assert.equal(busy.length,0);checks++;}else{assert.equal(busy.at(-1),false);checks++;}
 if(['missing-contact','invalid-contact'].includes(scenario)){assert.match(messages.at(-1),/Add a trusted emergency contact/);checks++;}
 if(scenario==='failed-contact'){assert.equal(messages.at(-1),'Contact unavailable');checks++;}
 if(scenario==='failed-share'){assert.equal(messages.at(-1),'Share unavailable');checks++;}
 if(scenario==='failed-copy'){assert.match(messages.at(-1),/Clipboard unavailable/);checks++;}
}
assert.match(app,/accessibilityLabel="SOS safety actions"/);assert.match(app,/go\("emergency"\)/);assert.match(app,/WeNitro does not track your location or contact emergency services/);checks+=3;
console.log(JSON.stringify({status:'PASS',checks,scope:'Actual Activity SOS actions: explicit share/copy details, private details do not create invitation, validated dialer contact, missing/invalid/failing contact, errors and busy guard; no real contact call, provider send or live tracking'}));
