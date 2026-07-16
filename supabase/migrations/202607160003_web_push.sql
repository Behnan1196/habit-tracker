create table public.m_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (endpoint)
);

create table public.m_reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  reminder_id uuid not null references public.m_reminders(id) on delete cascade,
  subscription_id uuid not null references public.m_push_subscriptions(id) on delete cascade,
  local_date date not null,
  local_time time not null,
  sent_at timestamptz not null default now(),
  unique (reminder_id, subscription_id, local_date, local_time)
);

create index m_push_subscriptions_user_idx on public.m_push_subscriptions(user_id);
create index m_reminder_deliveries_sent_idx on public.m_reminder_deliveries(sent_at desc);

create trigger m_push_subscriptions_updated_at
  before update on public.m_push_subscriptions
  for each row execute function public.m_set_updated_at();

alter table public.m_push_subscriptions enable row level security;
alter table public.m_reminder_deliveries enable row level security;

create policy m_push_subscriptions_owner_all on public.m_push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

comment on table public.m_push_subscriptions is 'Web Push subscriptions for installed Momentum web apps.';
comment on table public.m_reminder_deliveries is 'Dedupe log for scheduled reminder pushes.';
