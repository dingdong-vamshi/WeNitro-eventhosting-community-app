alter table public.tbl_event_participants
  add constraint tbl_event_participants_status_check_cashfree
  check (
    status::text = any (
      array[
        'pending',
        'approved',
        'rejected',
        'waitlist',
        'invited',
        'left',
        'no_show',
        'payment_required'
      ]::text[]
    )
  ) not valid;

alter table public.tbl_event_participants
  validate constraint tbl_event_participants_status_check_cashfree;

alter table public.tbl_event_participants
  drop constraint tbl_event_participants_status_check;

alter table public.tbl_event_participants
  rename constraint tbl_event_participants_status_check_cashfree
  to tbl_event_participants_status_check;
