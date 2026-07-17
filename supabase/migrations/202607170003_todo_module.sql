create table public.m_todo_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.m_todo_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  list_id uuid,
  title text not null,
  description text,
  status text not null default 'pending' check (status in ('pending', 'done')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  agenda_date date,
  time_slot_id uuid,
  reminder_time time,
  position integer not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (list_id, user_id) references public.m_todo_lists(id, user_id) on delete cascade,
  foreign key (time_slot_id) references public.m_time_slots(id) on delete restrict,
  check ((agenda_date is null and time_slot_id is null) or (agenda_date is not null and time_slot_id is not null))
);

create table public.m_todo_deliveries (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.m_todo_tasks(id) on delete cascade,
  subscription_id uuid not null references public.m_push_subscriptions(id) on delete cascade,
  local_date date not null,
  local_time time not null,
  sent_at timestamptz not null default now(),
  unique (task_id, subscription_id, local_date, local_time)
);

create index m_todo_lists_user_position_idx on public.m_todo_lists(user_id, position);
create index m_todo_tasks_user_list_status_idx on public.m_todo_tasks(user_id, list_id, status, position);
create index m_todo_tasks_user_agenda_idx on public.m_todo_tasks(user_id, agenda_date, time_slot_id) where agenda_date is not null;

create trigger m_todo_lists_updated_at before update on public.m_todo_lists for each row execute function public.m_set_updated_at();
create trigger m_todo_tasks_updated_at before update on public.m_todo_tasks for each row execute function public.m_set_updated_at();

alter table public.m_todo_lists enable row level security;
alter table public.m_todo_tasks enable row level security;
alter table public.m_todo_deliveries enable row level security;
create policy m_todo_lists_owner_all on public.m_todo_lists for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy m_todo_tasks_owner_all on public.m_todo_tasks for all using (user_id = auth.uid()) with check (user_id = auth.uid());

comment on table public.m_todo_tasks is 'One-off Todo tasks that can optionally project themselves into a dated Agenda time slot.';
