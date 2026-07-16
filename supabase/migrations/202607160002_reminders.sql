create table public.m_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null,
  reminder_time time not null,
  weekdays smallint[] not null default array[0,1,2,3,4,5,6],
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, item_id, reminder_time),
  foreign key (item_id, user_id) references public.m_items(id, user_id) on delete cascade,
  check (weekdays <@ array[0,1,2,3,4,5,6]::smallint[])
);

create index m_reminders_user_enabled_time_idx
  on public.m_reminders(user_id, is_enabled, reminder_time);

create trigger m_reminders_updated_at
  before update on public.m_reminders
  for each row execute function public.m_set_updated_at();

alter table public.m_reminders enable row level security;

create policy m_reminders_owner_all on public.m_reminders
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

comment on table public.m_reminders is 'Reusable reminder schedules. The first version attaches them to items and runs while the web app is open.';
