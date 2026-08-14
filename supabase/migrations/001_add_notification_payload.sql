alter table public.notifications
add column if not exists payload jsonb;

create index if not exists notifications_monitoring_request_sent_at_idx
on public.notifications (monitoring_request_id, sent_at desc);
