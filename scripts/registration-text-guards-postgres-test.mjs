import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wenitro-registration-text-'));let started=false,checks=0;
const run=(cmd,args,input)=>{const r=spawnSync(cmd,args,{input,encoding:'utf8',maxBuffer:4e6});if(r.error||r.status)throw Error(r.error?.message||r.stderr||r.stdout);return r.stdout;};
const sql=q=>run('psql',['-h',dir,'-p','55462','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'],q).trim();
const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const literal=value=>"'"+value.replaceAll("'","''")+"'";
const attempt=q=>sql(`select qa_attempt(${literal(q)})`);
const questionSource=fs.readFileSync('supabase/migrations/20260907055314_partner_registration_phase1.sql','utf8');
const categorySource=fs.readFileSync('supabase/migrations/20260929095859_partner_entry_categories.sql','utf8');
const partnerSource=fs.readFileSync('supabase/migrations/20260907064925_partner_optional_business_profile_alignment.sql','utf8');
const guardSource=fs.readFileSync('supabase/migrations/20261001110210_acceptance_text_content_guards.sql','utf8');
try {
 run('initdb',['-D',dir+'/db','-A','trust','--no-locale','-E','UTF8']);run('pg_ctl',['-D',dir+'/db','-l',dir+'/log','-o',`-F -h '' -k ${dir} -p 55462`,'-w','start']);started=true;
 sql(`create schema private;create role anon;create role authenticated;create table public.tbl_events(id int primary key);insert into public.tbl_events values(1);create table public.tbl_users(id int primary key);insert into public.tbl_users values(1),(2);
 ${questionSource.slice(questionSource.indexOf('create table public.tbl_activity_registration_questions ('),questionSource.indexOf('create table public.tbl_activity_registration_answers ('))}
 ${questionSource.slice(questionSource.indexOf('create table public.tbl_activity_registration_answers ('),questionSource.indexOf('create index registration_answers_event_user'))}
 ${partnerSource.slice(partnerSource.indexOf('create table public.tbl_partner_profiles ('),partnerSource.indexOf('alter table public.tbl_partner_profiles'))}
 create table public.tbl_event_feedback(id int primary key,comment text,reaction text,event_id int,created_by int);
 create table public.tbl_chat_rooms(id int primary key,title text,description text,tagline text,tags text[],rules text[]);
 ${categorySource.slice(0,categorySource.indexOf('create index'))}
 ${guardSource.slice(0,guardSource.indexOf('create trigger'))}
 create trigger guard_ugc_text before insert or update on public.tbl_chat_rooms for each row execute function private.guard_ugc_text('title','description','tagline');
 create function qa_attempt(q text) returns text language plpgsql as $$begin execute q;return 'ACCEPTED';exception when others then return SQLSTATE;end$$;`);
 const guardBefore=sql("select pg_get_functiondef('private.guard_ugc_text()'::regprocedure)");
 // Reproduce the missing coverage before the actual migration, preserving these as legacy rows.
 eq(attempt("insert into tbl_activity_registration_questions(id,event_id,label,type,display_order,options) values(1,1,'fuck','single_choice',0,'[\"Normal\",\"shit\"]')"),'ACCEPTED');
 eq(attempt("insert into tbl_activity_entry_categories(id,event_id,name,price_paisa) values(1,1,'shit',100)"),'ACCEPTED');
 sql(`insert into tbl_activity_registration_answers values(1,1,1,'\"shit\"');
 insert into tbl_event_feedback(id,comment,reaction) values(1,'shit','great');
 insert into tbl_partner_profiles(user_id,business_name,description) values(1,'shit','fuck');
 insert into tbl_chat_rooms values(1,'Clean','Clean','Clean',array['fuck'],array['shit']);`);
 sql(fs.readFileSync('supabase/migrations/20261003203126_registration_question_category_text_guards.sql','utf8'));
 eq(sql("select pg_get_functiondef('private.guard_ugc_text()'::regprocedure)"),guardBefore);
 eq(sql("select count(*) from pg_trigger where tgname='guard_ugc_text' and not tgisinternal"),'6');
 for(const [label,options] of [['fuck','[]'],['Normal','["Good","shit"]'],['Normal','["ＦＵＣＫ","Good"]']]) {
  eq(attempt(`insert into tbl_activity_registration_questions(event_id,label,type,display_order,options) values(1,${literal(label)},'single_choice',1,${literal(options)})`),'22023');
 }
 eq(attempt("insert into tbl_activity_entry_categories(event_id,name,price_paisa) values(1,'FUCK',100)"),'22023');
 eq(attempt("insert into tbl_activity_entry_categories(event_id,name,price_paisa) values(1,'ｆｕｃｋ',100)"),'22023');
 eq(attempt("insert into tbl_activity_registration_questions(id,event_id,label,type,display_order,options) values(100,1,'Scunthorpe ticket choice','single_choice',1,'[\"Early bird\",\"General admission\"]')"),'ACCEPTED');
 eq(attempt("insert into tbl_activity_entry_categories(id,event_id,name,price_paisa) values(100,1,'Scunthorpe General admission',100)"),'ACCEPTED');
 eq(attempt("update tbl_activity_registration_questions set label='fucking' where id=100"),'22023');
 eq(attempt("update tbl_activity_registration_questions set options='[\"Normal\",\"bitch\"]' where id=100"),'22023');
 eq(attempt("update tbl_activity_entry_categories set name='asshole' where id=100"),'22023');
 eq(sql("select label from tbl_activity_registration_questions where id=100"),'Scunthorpe ticket choice');
 // Existing unchanged words must not block unrelated settings or normal replacements.
 eq(attempt("update tbl_activity_registration_questions set required=true, display_order=2, label=label, options=options where id=1"),'ACCEPTED');
 eq(attempt("update tbl_activity_entry_categories set active=false,price_paisa=200,name=name where id=1"),'ACCEPTED');
 eq(attempt("update tbl_activity_registration_questions set label='New clean label' where id=1"),'ACCEPTED');
 eq(attempt("update tbl_activity_registration_questions set options='[\"Standard\",\"Premium\"]' where id=1"),'ACCEPTED');
 eq(attempt("update tbl_activity_entry_categories set name='Clean legacy replacement' where id=1"),'ACCEPTED');
 eq(attempt("update tbl_activity_registration_questions set label='shit' where id=1"),'22023');
 // One invalid option rolls back the complete multi-row statement.
 eq(attempt("insert into tbl_activity_registration_questions(id,event_id,label,type,display_order,options) values(200,1,'First valid','single_choice',3,'[\"A\",\"B\"]'),(201,1,'Second valid','single_choice',4,'[\"A\",\"porn\"]')"),'22023');
 eq(sql('select count(*) from tbl_activity_registration_questions where id in(200,201)'),'0');
 for(const q of [
  "insert into tbl_activity_registration_answers(event_id,question_id,user_id,value) values(1,100,2,'\"fuck\"')",
  "update tbl_activity_registration_answers set value='\"fucking\"' where user_id=1",
  "insert into tbl_event_feedback(id,comment,reaction) values(2,'fuck','great')",
  "update tbl_event_feedback set comment='fucking' where id=1",
  "insert into tbl_partner_profiles(user_id,business_name) values(2,'fuck')",
  "insert into tbl_partner_profiles(user_id,business_name,description) values(2,'Clean','shit')",
  "update tbl_partner_profiles set description='fucking' where user_id=1",
  "update tbl_chat_rooms set rules=array['First clean','fuck'] where id=1",
  "update tbl_chat_rooms set tags=array['fuck','Second clean'] where id=1",
  "update tbl_chat_rooms set title='shit' where id=1"
 ]) eq(attempt(q),'22023');
 for(const q of [
  "update tbl_activity_registration_answers set created_at=now(),value=value where user_id=1",
  "update tbl_event_feedback set reaction='good',comment=comment where id=1",
  "update tbl_partner_profiles set city='New city',business_name=business_name,description=description where user_id=1",
  "update tbl_chat_rooms set title='Clean changed title',rules=rules,tags=tags where id=1",
  "update tbl_activity_registration_answers set value='\"Clean answer\"' where user_id=1",
  "update tbl_event_feedback set comment='Great event' where id=1",
  "update tbl_partner_profiles set business_name='Clean Partner',description='Sport and fitness classes' where user_id=1",
  "update tbl_chat_rooms set rules=array['Be kind'],tags=array['sport'] where id=1"
 ]) eq(attempt(q),'ACCEPTED');
 // Error messages do not echo submitted private or offensive content.
 sql("create function qa_error(q text) returns text language plpgsql as $$begin execute q;return '';exception when others then return SQLERRM;end$$");
 eq(sql("select qa_error('update tbl_event_feedback set comment=''fuck PRIVATE_SECRET'' where id=1')"),'Please remove explicit or hateful language before saving.');
 eq(sql("select has_function_privilege('authenticated','private.guard_ugc_text()','EXECUTE')"),'f');
 eq(sql(fs.readFileSync('scripts/sql/qa-registration-text-guards-rollback.sql','utf8')).startsWith('PASS: six deployed trigger bindings'),true);
 sql(`insert into tbl_events values(297),(300);insert into tbl_users values(70),(116);
 insert into tbl_activity_registration_questions(id,event_id,label,type,display_order) values(999,297,'Entry name','short_text',0);
 insert into tbl_activity_registration_answers(event_id,question_id,user_id,value) values(297,999,116,'"Sandbox Acceptance"');
 insert into tbl_activity_entry_categories(id,event_id,name,price_paisa) values(999,297,'General',1234);
 insert into tbl_event_feedback(id,event_id,created_by,comment,reaction) values(999,300,120,'Great','good');
 insert into tbl_partner_profiles(user_id,business_name,description) values(70,'QA Partner','Classes');
 insert into tbl_chat_rooms(id,title,description,tagline,tags,rules) values(252,'QA Community','Description','Tagline',array['sport'],array['Be kind']);`);
 const fixtureProof=sql(fs.readFileSync('scripts/sql/qa-registration-text-guards-fixtures.sql','utf8'));
 const fixtureResults=JSON.parse(fixtureProof.split('\n').at(-1));
 eq(fixtureResults.length,12);eq(fixtureResults.every(row=>row.outcome.startsWith('PASS:')),true);
 eq(sql('select label from tbl_activity_registration_questions where id=999'),'Entry name');
 // Exact production rollback script: approved participant on a controlled ended fixture.
 sql(`alter table tbl_events add column created_by int,add column event_end_time timestamptz,add column is_deleted bool default false,add column is_cancelled bool default false,add column title text;
 insert into tbl_events(id,created_by,event_end_time,title) values(233,70,now()-interval '1 day','[QA] local rollback fixture');
 create table tbl_event_participants(event_id int,user_id int,status text);insert into tbl_event_participants values(233,71,'approved');`);
 const feedbackProof=JSON.parse(sql(fs.readFileSync('scripts/sql/qa-feedback-text-guard-rollback.sql','utf8')));
 eq(feedbackProof.forbidden_comment_update,'PASS: generic22023');eq(feedbackProof.cleanup,'PASS: inserted row absent after subtransaction rollback');eq(sql('select count(*) from tbl_event_feedback where id=-103032054'),'0');
 console.log(JSON.stringify({status:'PASS',checks,scope:'Actual PostgreSQL tables, existing unchanged guard and new migration. Pre-fix reproduction; label/JSON-option/category/answer/feedback/Partner/Community insert and update denial, NFKC, innocent substrings, normal saves, unchanged legacy fields, clean replacement, statement rollback and unchanged private execution grant.'}));
} finally {if(started)run('pg_ctl',['-D',dir+'/db','-m','immediate','-w','stop']);fs.rmSync(dir,{recursive:true,force:true});}
