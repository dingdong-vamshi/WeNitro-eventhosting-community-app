import json, pathlib, subprocess, datetime, time, os
root=pathlib.Path.cwd(); admin=pathlib.Path(os.environ.get('QA_ADMIN_ROOT', '/Users/vamshipendyala/Library/Mobile Documents/com~apple~CloudDocs/Desktop/wenitro-admin-'))
os.environ['QA_ADMIN_ROOT']=str(admin)
prior=json.loads((root/'docs/chat001-integrated-local-verification.json').read_text())
checks=[dict(name=x['name'],command=x['command']) for x in prior['checks']]
known={x['command'][-1] for x in checks if x['command'][-1].startswith('scripts/')}
new=[{'name':x.stem,'command':['node',str(x)]} for x in sorted(pathlib.Path('scripts').glob('*-test.mjs')) if str(x) not in known]
checks=new+checks
admin_existing={x['command'][-1] for x in checks if x['name'].startswith('admin-admin-')}
for script in sorted((admin/'scripts').glob('*-test.mjs')):
 relative='scripts/'+script.name
 if relative not in admin_existing:
  checks.append({'name':'admin-'+script.stem,'command':['node',relative],'workspace':'admin'})
covered_deno={arg for check in checks if check['command'][0]=='deno' for arg in check['command'][1:] if arg.endswith('.ts')}
for source in sorted(pathlib.Path('supabase/functions').rglob('*.ts')):
 relative=str(source)
 is_test=source.name.endswith('_test.ts') or source.name.endswith('.test.ts')
 if (source.name=='index.ts' or is_test) and relative not in covered_deno:
  command=['deno','test','--allow-env','--node-modules-dir=none'] if is_test else ['deno','check','--node-modules-dir=none']
  config=source.parent/'deno.json'
  if config.exists(): command+=['--config',str(config)]
  command.append(relative)
  checks.append({'name':'edge-'+str(source.relative_to('supabase/functions')).replace('/','-').replace('.','-'),'command':command})
logdir=root/('tmp/chat001-production-regression-local-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'));logdir.mkdir(exist_ok=True)
report={'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'appCommit':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'adminCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=admin,text=True).strip(),'status':'RUNNING','scope':'Complete local regression gate after production-discovered fixes; original92 checks plus new executable regression tests. UI production proof remains separate.','checks':[]}
out=root/'docs/chat001-production-regression-local-verification.json'
for item in checks:
 cwd=admin if item.get('workspace')=='admin' or item['name'] in ('admin-admin-review-read-models-test','admin-lint','admin-production-build','admin-typecheck') else root
 log=logdir/(item['name']+'.log');start=time.monotonic()
 with log.open('w') as stream:
  p=subprocess.run(item['command'],cwd=cwd,stdout=stream,stderr=subprocess.STDOUT)
 row={**item,'status':'PASS' if p.returncode==0 else 'FAIL','exitCode':p.returncode,'elapsedMs':round((time.monotonic()-start)*1000),'log':str(log.relative_to(root))}
 report['checks'].append(row);out.write_text(json.dumps(report,indent=2)+'\n')
 print(row['status']+' '+row['name'],flush=True)
report['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();report['status']='PASS' if all(x['status']=='PASS' for x in report['checks']) else 'FAIL';report['counts']={'total':len(checks),'passed':sum(x['status']=='PASS' for x in report['checks'])};out.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report['counts']),flush=True)

raise SystemExit(0 if report["status"] == "PASS" else 1)
