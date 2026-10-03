import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const MAPPINGS = [
  ['docs/chat001-production-ae-qa.json','requirements','owner'],
  ['docs/chat001-production-bc-qa.json','checks','owner'],
  ['docs/chat001-admin-canonical-production-evidence.json','requirements','owner'],
  ['docs/chat001-backend-canonical-coverage.json','canonicalCoverage','technical'],
  ['docs/chat001-backend-canonical-coverage.json','profileBadgeTrustBackendContribution','technical'],
  ['docs/chat001-ae-technical-supplement.json','requirements','technical'],
];
const TERMINAL = new Set(['PASS','PARTIAL_EXTERNAL_DEPENDENCY','NOT_IMPLEMENTED_EXTERNAL_DEPENDENCY','NOT_IMPLEMENTED_CLIENT_DECISION']);
const arr = value => value == null ? [] : Array.isArray(value) ? value : [value];
const unique = values => [...new Map(values.map(v=>[JSON.stringify(v),v])).values()];
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const meaningful = value => typeof value==='string' && value.trim() && !/^(TO_RECONCILE|TODO|TBD|NOT_RECONCILED)$/i.test(value.trim());
const reference = value => typeof value==='string' ? (/^(docs\/|scripts\/|qa-evidence\/|\/)/.test(value)?value:null) : value?.path||value?.file||value?.proof||null;
const count = (rows,fn) => rows.reduce((out,r)=>{const k=fn(r);out[k]=(out[k]||0)+1;return out;},{});
const idOf = row => row?.id||row?.canonicalId;

export function buildReport({sourceRoot, releaseFile='docs/chat001-integrated-release.json', assessmentFile, screenshotFiles=[], expectedCount, final=false}) {
 sourceRoot=path.resolve(sourceRoot);const warnings=[],inputs=[],loaded=new Map();
 const absolute=ref=>path.isAbsolute(ref)?ref:path.resolve(sourceRoot,ref);
 function read(ref,required=false){const file=absolute(ref);if(loaded.has(file))return loaded.get(file);if(!fs.existsSync(file)){if(required)throw Error(`Required input missing: ${ref}`);warnings.push(`Optional input missing: ${ref}`);return null;}const bytes=fs.readFileSync(file);const data=JSON.parse(bytes);inputs.push({path:ref,sha256:sha(bytes)});loaded.set(file,data);return data;}
 const canonical=read('docs/chat001-canonical-requirements.json',true);const requirements=canonical.canonicalRequirements;
 expectedCount=expectedCount??canonical.counts?.distinctImplementationRequirementsIncludingBadges;
 if(!Number.isSafeInteger(expectedCount)||expectedCount<1)throw Error('Canonical declared requirement count is missing; supply --expected-count explicitly.');
 if(!Array.isArray(requirements)||requirements.length!==expectedCount)throw Error(`Expected exactly ${expectedCount} canonical requirements; got ${requirements?.length}`);
 const ids=new Set();for(const r of requirements){if(!r.id||ids.has(r.id))throw Error(`Missing or duplicate canonical ID: ${r.id}`);ids.add(r.id);}
 const release=read(releaseFile,true),target=canonical.targetSupabaseProject||'cxsznhrkzqndhseodcyy';
 if(release.projectId&&release.projectId!==target)throw Error('Release target differs from canonical Supabase target');
 const contributions=new Map(requirements.map(r=>[r.id,[]]));
 for(const [file,key,kind]of MAPPINGS){const data=read(file);if(!data)continue;const rows=data[key]||[];const seen=new Set();for(const row of rows){const id=idOf(row);if(!ids.has(id))throw Error(`Unknown canonical ID ${id} in ${file}#/${key}`);if(seen.has(id))throw Error(`Duplicate ID ${id} in ${file}#/${key}`);seen.add(id);contributions.get(id).push({file,key,kind,row});}}
 const assessment=assessmentFile?read(assessmentFile,true):null;const assessments=new Map();
 for(const row of assessment?.requirements||[]){const id=idOf(row);if(!ids.has(id)||assessments.has(id))throw Error(`Unknown or duplicate coordinator assessment ID: ${id}`);assessments.set(id,row);}
 const baseMetadata=['qa-evidence/chat001/integrated-ae-screenshots.json','qa-evidence/chat001/integrated-iab-admin-screenshots.json','qa-evidence/chat001/production-admin-integrated-screenshots.json','docs/chat001-admin-screenshot-validation.json'];
 const metadata=[];for(const file of unique([...baseMetadata,...screenshotFiles])){const data=read(file);if(!data)continue;for(const row of Array.isArray(data)?data:(data.screenshots||[]))if(row.path)metadata.push({...row,metadataFile:file});}
 const normalizedRef=ref=>absolute(ref.split('#')[0]);
 const proofObject=value=>{const ref=reference(value);return{detail:value,...(ref?{reference:ref,exists:fs.existsSync(normalizedRef(ref))}:{})};};
 const shotObject=(value,source)=>{const ref=reference(value);if(!ref)return{...proofObject(value),source,validation:'UNRECOGNIZED_SCREENSHOT_REFERENCE'};const file=normalizedRef(ref),exists=fs.existsSync(file),hash=exists?sha(fs.readFileSync(file)):null;const matches=metadata.filter(m=>normalizedRef(m.path)===file);const invalid=matches.find(m=>/INVALID|REJECTED/.test(m.status||'')&&(!m.sha256||m.sha256===hash));const good=matches.filter(m=>!(/INVALID|REJECTED/.test(m.status||'')));return{...proofObject(value),source,sha256:hash,validation:!exists?'MISSING_FILE':invalid?'EXCLUDED_INVALID_CAPTURE':'RECORDED_SCOPE_REQUIRES_RELEASE_REVIEW',exclusionReason:invalid?.reason||null,metadata:good.map(({path:_,...m})=>m)};};
 const rows=requirements.map(req=>{
  const records=contributions.get(req.id),owners=records.filter(r=>r.kind==='owner'),decision=assessments.get(req.id);
  if(owners.length>1)warnings.push(`${req.id}: multiple owner mappings; all retained without last-write-wins acceptance`);
  const ownersWithStatus=owners.map(r=>({file:r.file,status:r.row.status||'UNASSESSED'}));
  const from=(...keys)=>unique(records.flatMap(({row})=>keys.flatMap(k=>arr(row[k]))));
  const chosen=key=>decision&&key in decision?decision[key]:owners.map(r=>r.row[key]).find(meaningful);
  const local=decision?.localVerification??from('localVerification','localProof');
  const production=decision?.productionVerification??from('productionVerification');
  const technical=decision?.technicalProof??from('technicalProof','acceptedTechnicalProof');
  const candidateShots=decision?.screenshotProof??unique(records.flatMap(({row})=>['screenshotProof','screenshots','acceptedScreenshotProof','acceptedScreenshots'].flatMap(k=>arr(row[k]))));
  const supplementary=metadata.filter(m=>arr(m.requirements||m.canonicalIds).includes(req.id));
  const shots=unique([...candidateShots,...supplementary.map(m=>({path:m.path,scope:m.outcome||m.scope||'Captured requirement state',metadataFile:m.metadataFile}))]).map(s=>shotObject(s,decision?'coordinator assessment':'owner mapping or screenshot metadata'));
  const invalidShots=shots.filter(s=>s.validation==='EXCLUDED_INVALID_CAPTURE');
  const validShots=shots.filter(s=>s.validation==='RECORDED_SCOPE_REQUIRES_RELEASE_REVIEW');
  const assessedCaptureRefs=new Set(arr(decision?.screenshotProof).map(reference).filter(Boolean).map(normalizedRef));
  const explicitCaptureReview=decision?.screenshotsReviewed===true&&decision?.releaseReviewed===true&&decision.release?.appDeploymentId===release.appDeploymentId&&decision.release?.adminDeploymentId===release.adminDeploymentId;
  for(const shot of validShots)if(explicitCaptureReview&&assessedCaptureRefs.has(normalizedRef(shot.reference))){shot.reviewStatus='REVIEWED_SCOPED_CAPTURE';shot.reviewedForRelease=decision.release;shot.reviewScope=decision.acceptanceScope;shot.reviewBasis=decision.releaseReviewBasis||decision.evidenceCompatibility||decision.releaseCompatibilityReview||'Explicit coordinator screenshot and selected-release review.';}
  const before=chosen('before')||'Not yet reconciled by the requirement owner.';
  const implemented=chosen('implemented')||'Implementation narrative not yet reconciled by the requirement owner.';
  const ownerStatus=ownersWithStatus.map(s=>s.status);
  const scopeStatus=ownerStatus.some(s=>s==='PASS'||/^VERIFIED_/.test(s))?'OWNER_VERIFIED_WITH_RECORDED_SCOPE':ownerStatus.some(s=>/EXTERNAL|PROVIDER_NOT_IMPLEMENTED/.test(s))?'OWNER_REPORTED_EXTERNAL_DEPENDENCY':records.some(r=>r.kind==='technical')?'TECHNICAL_CONTRIBUTION_WITH_ACCEPTANCE_PENDING':'ACCEPTANCE_PENDING';
  const acceptanceStatus=decision?.status||'PENDING_FINAL_RECONCILIATION';
  const missing=[];
  if(!decision)missing.push('Coordinator has not issued a final requirement-level assessment.');
  if(!meaningful(chosen('before')))missing.push('Concrete before-state narrative is missing.');
  if(!meaningful(chosen('implemented')))missing.push('Concrete implementation narrative is missing.');
  if(decision&&!TERMINAL.has(decision.status))missing.push('Assessment is not a final terminal outcome.');
  const reasons=decision?.reason??unique(from('remaining','resultAndLimits','missingEvidence','evidenceNotes'));
  if(decision&&decision.status!=='PASS'&&!meaningful(decision.reason))missing.push('A non-pass outcome needs an exact reason.');
  if(decision?.status==='PASS'){
   if(!arr(local).length)missing.push('PASS lacks local verification.');
   if(!arr(production).length)missing.push('PASS lacks production verification.');
   if(!meaningful(decision.acceptanceScope))missing.push('PASS lacks its explicit acceptance scope.');
   const requiresVisual=req.requiredEvidence?.some(e=>/screenshot|deployed_interaction/.test(e));
   if(requiresVisual&&!validShots.length)missing.push('PASS lacks an existing, non-excluded deployed screenshot.');
   if(invalidShots.length)missing.push('PASS still cites an excluded invalid screenshot.');
   if(requiresVisual&&decision.screenshotsReviewed!==true)missing.push('Coordinator must explicitly mark screenshotsReviewed true.');
   if(decision.releaseReviewed!==true)missing.push('Coordinator must explicitly mark releaseReviewed true.');
   if(decision.release?.appDeploymentId!==release.appDeploymentId||decision.release?.adminDeploymentId!==release.adminDeploymentId)missing.push('Assessment release IDs do not match the selected final release.');
   if(req.qaOwner==='F_BACKEND_SECURITY'&&!arr(technical).some(v=>{const ref=reference(v);return ref&&!ref.startsWith('scripts/')&&fs.existsSync(normalizedRef(ref));}))missing.push('Backend PASS requires existing current-target technical proof, not only a test source file.');
  }
  for(const v of [...arr(local),...arr(technical)]){const ref=reference(v);if(ref&&!fs.existsSync(normalizedRef(ref)))missing.push(`Referenced artifact missing: ${ref}`);}
  return{id:req.id,owner:req.qaOwner,kind:req.kind,sourceClauseIds:req.sourceClauseIds||[],requestedChange:req.requestedOutcome,acceptanceCriteria:req.acceptanceCriteria||[],before,implemented,localVerification:arr(local).map(proofObject),productionVerification:arr(production),screenshotProof:shots,technicalProof:arr(technical).map(proofObject),reason:reasons,acceptanceScope:decision?.acceptanceScope||'Use the exact owner observations and limits below; no wider acceptance is inferred.',ownerAssessments:ownersWithStatus,scopedEvidenceStatus:scopeStatus,requestedAssessmentStatus:decision?.status||null,finalAcceptanceStatus:missing.length?(decision?'PENDING_EVIDENCE_VALIDATION':'PENDING_FINAL_RECONCILIATION'):acceptanceStatus,remainingValidation:unique([...missing,...(!TERMINAL.has(acceptanceStatus)?arr(decision?.remainingValidation):[])]),contributions:records.map(({file,key,kind,row})=>({file,key,kind,status:row.status||row.technicalStatus||null,limits:row.resultAndLimits||row.scope||null})),coordinatorAssessment:decision||null};
 });
 const sourceDocumentCoverage=['A','B'].map(key=>({key,title:key==='A'?'Must changesimplementations.pdf':'Issues with App (1).pdf',pageCount:canonical.counts?.sourcePages?.[key]||0,pages:Array.from({length:canonical.counts?.sourcePages?.[key]||0},(_,index)=>({page:index+1,clauses:(canonical.sourceClauseMappings||[]).filter(clause=>clause.sourceClauseId.startsWith(`${key}${String(index+1).padStart(2,'0')}-`))}))}));
 const badgeRequirementIds=canonical.badgeDocumentMapping?.canonicalRequirementIds||rows.filter(r=>r.kind==='badge').map(r=>r.id);
 const evidenceCoverageCounts={acceptedRequirements:rows.filter(r=>r.finalAcceptanceStatus==='PASS').length,acceptedRequirementsWithReviewedScreenshot:rows.filter(r=>r.finalAcceptanceStatus==='PASS'&&r.screenshotProof.some(s=>s.reviewStatus==='REVIEWED_SCOPED_CAPTURE')).length,requirementsWithReviewedScreenshotState:rows.filter(r=>r.screenshotProof.some(s=>s.reviewStatus==='REVIEWED_SCOPED_CAPTURE')).length,acceptedRequirementsWithExistingTechnicalArtifact:rows.filter(r=>r.finalAcceptanceStatus==='PASS'&&r.technicalProof.some(p=>p.exists===true)).length,requirementsWithExistingTechnicalArtifact:rows.filter(r=>r.technicalProof.some(p=>p.exists===true)).length};
 const unresolved=rows.filter(r=>r.remainingValidation.length||!TERMINAL.has(r.finalAcceptanceStatus));
 const hashGroups=new Map();for(const row of metadata){const file=normalizedRef(row.path);if(!fs.existsSync(file))continue;const hash=sha(fs.readFileSync(file));const g=hashGroups.get(hash)||{paths:new Set(),urls:new Set()};g.paths.add(row.path);if(row.url)g.urls.add(row.url);hashGroups.set(hash,g);}
 for(const [hash,g]of hashGroups)if(g.urls.size>1)warnings.push(`Screenshot SHA ${hash.slice(0,12)} repeats across ${g.urls.size} URLs; contents require scoped visual review (${g.paths.size} paths).`);
 const processEntries=(canonical.processEntries||[]).map(g=>({...g,...(assessment?.processEntries||[]).find(a=>a.id===g.id)}));
 const unresolvedGates=processEntries.filter(g=>g.kind!=='separator'&&g.status!=='PASS'&&!(g.status==='EXTERNAL_DEPENDENCY'&&meaningful(g.reason)));
 if(final&&(unresolved.length||unresolvedGates.length))throw Error(`Final report refused: ${unresolved.length}/${expectedCount} requirements and ${unresolvedGates.length} process gates still have unresolved assessment/evidence fields. Generate draft to inspect remainingValidation.`);
 return{schemaVersion:1,reportStatus:final?'FINAL_REQUIREMENT_RECONCILIATION':'DRAFT_INCOMPLETE_NOT_CLIENT_ACCEPTANCE',generatedAt:new Date().toISOString(),target,sourceRoot,releaseSource:releaseFile,release,canonicalCount:rows.length,uniqueCanonicalIds:ids.size,ownerCounts:count(rows,r=>r.owner),scopedEvidenceCounts:count(rows,r=>r.scopedEvidenceStatus),scopedEvidenceCountsBasis:'Historical input-mapping statuses, retained for provenance. They are not current acceptance or remaining-work totals.',sourceDocumentCoverage,badgeRequirementIds,evidenceCoverageCounts,finalOutcomeCounts:count(rows,r=>r.finalAcceptanceStatus),requirementsNeedingReconciliation:unresolved.length,countsRule:`Each canonical ID counts once. Tests, screenshots, threshold assertions and overlapping owner contributions do not inflate the ${expectedCount} requirements. Scoped technical/UI evidence does not become final acceptance automatically.`,screenshotRule:'Invalid/stale captures are excluded even when an owner mapping references them. Files and metadata establish provenance, not visual truth; final PASS requires explicit coordinator review of scope and release.',warnings:unique(warnings),inputSnapshots:inputs,requirements:rows,processEntries,unresolvedProcessGates:unresolvedGates.map(g=>g.id)};
}
function prose(value){if(value==null)return 'Not recorded.';if(typeof value==='string')return value;return JSON.stringify(value);}
function proofText(value,root){const detail=value.detail??value;if(value.reference){const ref=value.reference.split('#')[0];const full=path.isAbsolute(ref)?ref:path.resolve(root,ref);return `[${value.reference}](<${full}>)${typeof detail==='object'?' — '+prose(detail):''}${value.exists===false?' — MISSING FILE':''}`;}return prose(detail);}
const requirementAnchor=id=>'requirement-'+id.toLowerCase();
export function renderMarkdown(report){
 const out=[`# WeNitro client acceptance ${report.reportStatus.startsWith('DRAFT')?'draft':'report'}`,'',`**${report.reportStatus}**`,'',`This report covers exactly **${report.canonicalCount} distinct requirements**. ${report.requirementsNeedingReconciliation} still need final reconciliation. A scoped test result is not a claim that every client requirement passed.`,'',`Supabase: \`${report.target}\`. App: \`${report.release.appDeploymentId||'not supplied'}\`. Admin: \`${report.release.adminDeploymentId||'not supplied'}\`.`, '',report.reportStatus.startsWith('DRAFT')?'Not ready for final client acceptance. Current outcomes, exact evidence and outstanding interactions are kept separate below.':'Every canonical requirement has an explicit disposition within its recorded acceptance scope.','',report.countsRule,'',report.screenshotRule,''];
 const rendered=new Set(),byId=new Map(report.requirements.map(r=>[r.id,r]));
 const link=id=>`[${id}](#${requirementAnchor(id)})`;
 const renderRequirement=row=>{
  if(rendered.has(row.id)){out.push(`See ${link(row.id)} for the full evidence and disposition.`,'');return;}
  rendered.add(row.id);out.push(`<a id="${requirementAnchor(row.id)}"></a>`,'',`#### ${row.id} — ${row.finalAcceptanceStatus}`,'',`**Requested change:** ${row.requestedChange}`,'',`**Before:** ${row.before}`,'',`**Implemented:** ${row.implemented}`,'',`**Acceptance scope:** ${row.acceptanceScope}`,'',`**Owner / source:** ${row.owner}; ${row.sourceClauseIds.join(', ')||'Newer explicit requirement'}. Historical input status: ${row.ownerAssessments.map(x=>x.status).join(', ')||'Technical contribution only'}. Current disposition is the heading above.`,'');
  for(const [title,values]of[['Local verification',row.localVerification.map(v=>proofText(v,report.sourceRoot))],['Production verification',row.productionVerification.map(v=>{const ref=reference(v);return proofText(ref?{detail:v,reference:ref}:v,report.sourceRoot);})],['Deployed screenshot proof',row.screenshotProof.map(s=>`${proofText(s,report.sourceRoot)} — ${s.reviewStatus||s.validation}${s.exclusionReason?' — '+s.exclusionReason:''}`)],['Backend / technical proof',row.technicalProof.map(v=>proofText(v,report.sourceRoot))]])out.push(`**${title}:**`,'',...(values.length?values.map(v=>`- ${v.replace(/\n/g,' ')}`):['- Not recorded in the supplied owner evidence.']),'');
  out.push(`**Anything not implemented / exact reason:** ${arr(row.reason).map(prose).map(value=>value.trim()).filter(Boolean).join(' ')||(row.finalAcceptanceStatus==='PASS'?'None within the accepted scope.':'No separate reason supplied; see outstanding acceptance fields.')}`,'');
  if(row.remainingValidation.length)out.push('**Still required before final acceptance:**','',...row.remainingValidation.map(v=>`- ${prose(v)}`),'');
 };
 const reserved=row=>row.kind==='badge'||row.owner==='D_ADMIN'||row.owner==='F_BACKEND_SECURITY';
 for(const [index,key]of ['A','B'].entries()){
  const document=report.sourceDocumentCoverage?.find(d=>d.key===key)||{title:key==='A'?'40-page PDF':'39-page PDF',pages:[]};
  out.push(`## Section ${index+1} — ${document.title}`,'','Every source page is listed. Repeated requests cross-reference a single canonical requirement; references do not add to the total.','');
  for(const page of document.pages){
   out.push(`### ${key} page ${page.page}`,'');
   if(!page.clauses.length)out.push('No separately indexed implementation clause on this page.','');
   for(const clause of page.clauses){out.push(`- **${clause.sourceClauseId}** — ${clause.requested} → ${[...(clause.canonicalRequirementIds||[]).map(link),...(clause.processEntryIds||[]).map(id=>`Process note ${id} (Section 7)`)].join(', ')}`);}
   out.push('');
   for(const id of unique(page.clauses.flatMap(c=>c.canonicalRequirementIds||[]))){const row=byId.get(id);if(row&&!reserved(row)&&!rendered.has(id))renderRequirement(row);}
  }
 }
 out.push('## Section 3 — All badge requirements','',`The ${report.badgeRequirementIds?.length||0} badge rules count once each; threshold cases and repeated badge-grid images are supporting evidence.`,'');
 for(const id of report.badgeRequirementIds||[])if(byId.has(id))renderRequirement(byId.get(id));
 out.push('## Section 4 — Admin','');for(const row of report.requirements.filter(r=>r.owner==='D_ADMIN'))renderRequirement(row);
 out.push('## Section 5 — Security, backend, Partner and newer requirements','');
 const partner=report.requirements.filter(r=>r.owner==='E_PARTNER_CASHFREE');if(partner.length)out.push('Partner requirements already covered on source pages retain the same canonical identity: '+partner.map(r=>link(r.id)).join(', ')+'.','');
 for(const row of report.requirements.filter(r=>r.owner==='F_BACKEND_SECURITY'))renderRequirement(row);
 for(const row of report.requirements)if(!rendered.has(row.id))renderRequirement(row);
 if(rendered.size!==report.canonicalCount)throw Error('Markdown omitted a canonical requirement');
 out.push('## Section 6 — External dependencies and client decisions','','These dispositions are separate from ordinary pending production checks. A partial external disposition retains its implemented and tested scope.','');
 const holds=report.requirements.filter(r=>/EXTERNAL_DEPENDENCY|CLIENT_DECISION/.test(r.finalAcceptanceStatus));
 if(!holds.length)out.push('None recorded.','');
 for(const row of holds)out.push(`- ${link(row.id)} — **${row.finalAcceptanceStatus}**: ${arr(row.reason).map(prose).join(' ')}`);
 out.push('','## Section 7 — Final numbers and acceptance gates','','| Current outcome | Requirements |','|---|---:|',...Object.entries(report.finalOutcomeCounts).map(([status,n])=>`| ${status} | ${n} |`),'');
 const coverage=report.evidenceCoverageCounts||{};const pages=(report.sourceDocumentCoverage||[]).reduce((n,d)=>n+d.pages.length,0);const clauses=(report.sourceDocumentCoverage||[]).flatMap(d=>d.pages.flatMap(p=>p.clauses));
 out.push(`Source coverage: **${pages} PDF pages**, **${new Set(clauses.map(c=>c.sourceClauseId)).size} source clauses**, **${report.badgeRequirementIds?.length||0} badge rules**, **${report.canonicalCount} unique requirements**.`,'',`Accepted requirements with reviewed screenshot evidence: **${coverage.acceptedRequirementsWithReviewedScreenshot??'not counted'}**. Requirements with a reviewed screenshot state, including incomplete interactions: **${coverage.requirementsWithReviewedScreenshotState??'not counted'}**.`,'',`Accepted requirements with an existing technical artifact linked: **${coverage.acceptedRequirementsWithExistingTechnicalArtifact??'not counted'}**. Requirements with technical artifacts linked across all dispositions: **${coverage.requirementsWithExistingTechnicalArtifact??'not counted'}**. These overlapping counts describe evidence coverage; a local test or artifact link alone is not a production or provider certification.`,'','No already-correct versus fixed-during-this-run split is asserted because a complete comparable baseline is not recorded.','','| Historical input-mapping scope (not current acceptance totals) | Requirements |','|---|---:|',...Object.entries(report.scopedEvidenceCounts).map(([status,n])=>`| ${status} | ${n} |`),'',report.scopedEvidenceCountsBasis||'Historical input evidence only.','','### Process gates','',...report.processEntries.filter(g=>g.kind!=='separator').map(g=>`- ${g.id}: ${g.status||'Unassessed'} — ${g.reason||g.description||''}`),'','Source separators and end markers do not count as implementation requirements or acceptance gates.','','### Evidence integrity notes','',...(report.warnings.length?report.warnings.map(w=>`- ${w}`):['No file/reference integrity warning was generated; this does not certify untested behavior.']),'');
 return out.join('\n');
}

export function runCli(argv=process.argv.slice(2)){let sourceRoot=process.cwd(),outputRoot=process.cwd(),releaseFile,assessmentFile,expectedCount,final=false;const screenshotFiles=[];for(let i=0;i<argv.length;i++){const a=argv[i];if(a==='--source-root')sourceRoot=argv[++i];else if(a==='--output-root')outputRoot=argv[++i];else if(a==='--release')releaseFile=argv[++i];else if(a==='--assessments')assessmentFile=argv[++i];else if(a==='--screenshot-metadata')screenshotFiles.push(argv[++i]);else if(a==='--expected-count')expectedCount=Number(argv[++i]);else if(a==='--final')final=true;else throw Error(`Unknown argument ${a}`);}const report=buildReport({sourceRoot,releaseFile,assessmentFile,screenshotFiles,expectedCount,final});const stem=final?'chat001-client-acceptance-final':'chat001-client-acceptance-draft';const dir=path.resolve(outputRoot,'docs');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,stem+'.json'),JSON.stringify(report,null,2)+'\n');fs.writeFileSync(path.join(dir,stem+'.md'),renderMarkdown(report));console.log(JSON.stringify({status:report.reportStatus,canonicalCount:report.canonicalCount,uniqueCanonicalIds:report.uniqueCanonicalIds,requirementsNeedingReconciliation:report.requirementsNeedingReconciliation,ownerCounts:report.ownerCounts,scopedEvidenceCounts:report.scopedEvidenceCounts,outputs:[path.join(dir,stem+'.md'),path.join(dir,stem+'.json')]}));return report;}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))runCli();
