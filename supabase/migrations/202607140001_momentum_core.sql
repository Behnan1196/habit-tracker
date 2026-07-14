create extension if not exists pgcrypto;

create type public.m_item_kind as enum ('daily', 'persistent', 'metric');
create type public.m_plan_status as enum ('planned', 'done', 'cancelled');
create type public.m_item_source as enum ('manual', 'nutrition_plan');

create table public.m_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  timezone text not null default 'Europe/Istanbul',
  week_starts_on smallint not null default 1 check (week_starts_on between 0 and 6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.m_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  parent_id uuid,
  name text not null check (char_length(trim(name)) between 1 and 120),
  color text,
  position numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (parent_id, user_id) references public.m_groups(id, user_id) on delete cascade
);

create table public.m_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  group_id uuid,
  kind public.m_item_kind not null,
  name text not null check (char_length(trim(name)) between 1 and 160),
  description text,
  color text,
  position numeric not null default 0,
  metric_unit text,
  source_type public.m_item_source not null default 'manual',
  source_id text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (group_id, user_id) references public.m_groups(id, user_id) on delete cascade,
  check ((kind = 'metric') or metric_unit is null)
);

create table public.m_time_slots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  start_time time,
  end_time time,
  color text,
  position numeric not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.m_daily_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null,
  time_slot_id uuid not null,
  plan_date date not null,
  status public.m_plan_status not null default 'planned',
  position numeric not null default 0,
  planned_at timestamptz not null default now(),
  completed_at timestamptz,
  cancelled_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, item_id, time_slot_id, plan_date),
  foreign key (item_id, user_id) references public.m_items(id, user_id) on delete cascade,
  foreign key (time_slot_id, user_id) references public.m_time_slots(id, user_id) on delete restrict,
  check (
    (status = 'planned' and completed_at is null and cancelled_at is null)
    or (status = 'done' and completed_at is not null and cancelled_at is null)
    or (status = 'cancelled' and cancelled_at is not null and completed_at is null)
  )
);

create table public.m_persistent_states (
  item_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  status public.m_plan_status not null default 'planned',
  planned_at timestamptz not null default now(),
  completed_at timestamptz,
  cancelled_at timestamptz,
  updated_at timestamptz not null default now(),
  foreign key (item_id, user_id) references public.m_items(id, user_id) on delete cascade
);

create table public.m_metric_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null,
  entry_date date not null,
  value numeric not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, item_id, entry_date),
  foreign key (item_id, user_id) references public.m_items(id, user_id) on delete cascade
);

create index m_groups_user_parent_position_idx on public.m_groups(user_id, parent_id, position);
create index m_items_user_group_position_idx on public.m_items(user_id, group_id, position);
create index m_time_slots_user_position_idx on public.m_time_slots(user_id, position);
create index m_daily_assignments_user_date_status_idx on public.m_daily_assignments(user_id, plan_date, status);
create index m_metric_entries_item_date_idx on public.m_metric_entries(item_id, entry_date desc);

create or replace function public.m_set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger m_profiles_updated_at before update on public.m_profiles for each row execute function public.m_set_updated_at();
create trigger m_groups_updated_at before update on public.m_groups for each row execute function public.m_set_updated_at();
create trigger m_items_updated_at before update on public.m_items for each row execute function public.m_set_updated_at();
create trigger m_time_slots_updated_at before update on public.m_time_slots for each row execute function public.m_set_updated_at();
create trigger m_daily_assignments_updated_at before update on public.m_daily_assignments for each row execute function public.m_set_updated_at();
create trigger m_persistent_states_updated_at before update on public.m_persistent_states for each row execute function public.m_set_updated_at();
create trigger m_metric_entries_updated_at before update on public.m_metric_entries for each row execute function public.m_set_updated_at();

alter table public.m_profiles enable row level security;
alter table public.m_groups enable row level security;
alter table public.m_items enable row level security;
alter table public.m_time_slots enable row level security;
alter table public.m_daily_assignments enable row level security;
alter table public.m_persistent_states enable row level security;
alter table public.m_metric_entries enable row level security;

create policy m_profiles_owner_all on public.m_profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy m_groups_owner_all on public.m_groups for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy m_items_owner_all on public.m_items for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy m_time_slots_owner_all on public.m_time_slots for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy m_daily_assignments_owner_all on public.m_daily_assignments for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy m_persistent_states_owner_all on public.m_persistent_states for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy m_metric_entries_owner_all on public.m_metric_entries for all using (user_id = auth.uid()) with check (user_id = auth.uid());

comment on column public.m_items.source_id is 'Future reference to a nutrition-plan record or another external source.';
comment on column public.m_time_slots.end_time is 'May be earlier than start_time when the slot crosses midnight.';
