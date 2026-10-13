create or replace function public.submit_data_subject_request(p_request_type text,p_details text default '')
returns public.tbl_data_subject_requests
language sql
security definer
set search_path=''
as $$ select private.submit_data_subject_request(p_request_type,p_details) $$;

create or replace function public.list_my_data_subject_requests(p_limit integer default 26,p_before timestamptz default null)
returns setof public.tbl_data_subject_requests
language sql
stable
security definer
set search_path=''
as $$ select * from private.list_my_data_subject_requests(p_limit,p_before) $$;

revoke all on function public.submit_data_subject_request(text,text) from public,anon;
revoke all on function public.list_my_data_subject_requests(integer,timestamptz) from public,anon;
grant execute on function public.submit_data_subject_request(text,text) to authenticated;
grant execute on function public.list_my_data_subject_requests(integer,timestamptz) to authenticated;
