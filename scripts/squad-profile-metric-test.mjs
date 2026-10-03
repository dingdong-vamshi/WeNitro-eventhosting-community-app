import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wenitro-squad-metric-'));let started=false,checks=0;
const run=(cmd,args,input)=>{const r=spawnSync(cmd,args,{input,encoding:'utf8',maxBuffer:4e6});if(r.error||r.status)throw Error(r.error?.message||r.stderr||r.stdout);return r.stdout;};
const sql=q=>run('psql',['-h',dir,'-p','55459','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'],q).trim();
const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const source=fs.readFileSync('supabase/migrations/20260922184242_client_pdf_security_completion.sql','utf8');
const metric=source.slice(source.indexOf('create or replace function private.my_profile_metrics()'),source.indexOf('-- Other authenticated viewers'));
const current=()=>JSON.parse(sql("select private.my_profile_metrics()"));
const list=()=>JSON.parse(sql('select public.list_my_squad()'));
try{
 run('initdb',['-D',dir+'/db','-A','trust','--no-locale','-E','UTF8']);run('pg_ctl',['-D',dir+'/db','-l',dir+'/log','-o',`-F -h '' -k ${dir} -p 55459`,'-w','start']);started=true;
 sql(`create schema private;create function public.get_current_app_user_id() returns int language sql as $$ select coalesce(nullif(current_setting('qa.user',true),''),'1')::int $$;
 create table public.tbl_users(id int primary key,username text,fullname text,profile_image text,isverified int default 0,points int default 12,rating numeric default 4,is_delete int default 0,is_active int default 1);
 create table public.tbl_friends(user_id int,friend_id int,created_at timestamptz default now());
 create table public.tbl_events(id int,created_by int,is_deleted bool,is_cancelled bool,status text);
 create table public.tbl_event_participants(event_id int,user_id int,status text);
 create function private.trust_score_for(int) returns jsonb language sql as $$select '{"total":20,"rating":4,"activities_joined":3,"email_verified":true,"phone_verified":false,"selfie_verified":false,"aadhaar_verified":false,"social_linked":true}'::jsonb$$;
 ${fs.readFileSync('supabase/migrations/20261001122100_unique_squad_members.sql','utf8')}
 ${metric}
 insert into public.tbl_users(id,fullname) values(1,'Owner'),(2,'Friend'),(3,'Inactive'),(4,'Deleted'),(5,'Other');
 update public.tbl_users set is_active=0 where id=3;update public.tbl_users set is_delete=1 where id=4;
 insert into public.tbl_friends(user_id,friend_id) values(1,2),(2,1),(1,1);`);
 eq(current().squad,2);eq(list().map(u=>u.id),[2]); // Actual previous implementation reproduces self-count defect.
 const old=current();delete old.squad;
 sql(fs.readFileSync('supabase/migrations/20261003194203_squad_metric_excludes_self.sql','utf8'));
 eq(current().squad,1);eq(current().squad,list().length);
 const changed=current();delete changed.squad;eq(changed,old);
 sql('insert into public.tbl_friends(user_id,friend_id) values(1,3),(4,1),(1,2),(2,1),(1,999),(5,5)');
 eq(current().squad,1);eq(current().squad,list().length);
 sql('insert into public.tbl_friends(user_id,friend_id) values(5,1)');eq(current().squad,2);eq(list().map(u=>u.id),[2,5]);
 sql("select set_config('qa.user','2',false)"); // Each psql session is new; scope explicit identity checks in same call.
 eq(sql("select set_config('qa.user','2',false);select private.my_profile_metrics()->>'squad'").split('\n').at(-1),'1');
 eq(sql("select set_config('qa.user','5',false);select private.my_profile_metrics()->>'squad'").split('\n').at(-1),'1');
 sql('delete from public.tbl_friends where user_id<>friend_id');eq(current().squad,0);eq(list(),[]);
 eq(sql("select proconfig @> array['search_path=\"\"'] from pg_proc where oid='private.my_profile_metrics()'::regprocedure"),'t');
 console.log(JSON.stringify({status:'PASS',checks,scope:'Real previous metric reproduces self-link mismatch. Actual migration aligns count with deduplicated non-self active/nondeleted Squad list, ignores missing peers, preserves other metrics and identity scoping.'}));
}finally{if(started)run('pg_ctl',['-D',dir+'/db','-m','immediate','-w','stop']);fs.rmSync(dir,{recursive:true,force:true});}
