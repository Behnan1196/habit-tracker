alter table public.m_agenda_schedules
  add column reminder_time time;

create table public.m_schedule_deliveries (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.m_agenda_schedules(id) on delete cascade,
  subscription_id uuid not null references public.m_push_subscriptions(id) on delete cascade,
  local_date date not null,
  local_time time not null,
  sent_at timestamptz not null default now(),
  unique (schedule_id, subscription_id, local_date, local_time)
);

create index m_schedule_deliveries_sent_idx on public.m_schedule_deliveries(sent_at desc);
alter table public.m_schedule_deliveries enable row level security;

comment on column public.m_agenda_schedules.reminder_time is 'Optional Web Push time owned by this specific Agenda program.';
comment on table public.m_schedule_deliveries is 'Dedupe log for Agenda program notifications.';
