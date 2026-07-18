create table public.m_agenda_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  time_slot_id uuid not null references public.m_time_slots(id) on delete cascade,
  name text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.m_agenda_blocks enable row level security;

create policy "Users manage own agenda blocks"
  on public.m_agenda_blocks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.m_agenda_schedules
  add column block_id uuid references public.m_agenda_blocks(id) on delete set null;

create index m_agenda_blocks_slot_position_idx
  on public.m_agenda_blocks(user_id, time_slot_id, position);

create index m_agenda_schedules_block_idx
  on public.m_agenda_schedules(block_id);
