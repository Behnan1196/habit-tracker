create table public.m_agenda_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null,
  time_slot_id uuid not null,
  recurrence_type text not null check (recurrence_type in ('once', 'daily', 'weekdays')),
  weekdays integer[] not null default '{}',
  start_date date not null,
  end_date date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (item_id, user_id) references public.m_items(id, user_id) on delete cascade,
  foreign key (time_slot_id, user_id) references public.m_time_slots(id, user_id) on delete cascade,
  check (end_date is null or end_date >= start_date),
  check (recurrence_type <> 'weekdays' or cardinality(weekdays) > 0)
);

create index m_agenda_schedules_user_active_idx on public.m_agenda_schedules(user_id, is_active, start_date);
create trigger m_agenda_schedules_updated_at before update on public.m_agenda_schedules for each row execute function public.m_set_updated_at();
alter table public.m_agenda_schedules enable row level security;
create policy m_agenda_schedules_owner_all on public.m_agenda_schedules for all using (user_id = auth.uid()) with check (user_id = auth.uid());

comment on table public.m_agenda_schedules is 'Recurring or one-off rules that project library activities into the Agenda.';

-- One-time Momentum reset requested before testing the new Agenda model.
-- Nutricore and every non-m_ table are intentionally untouched.
delete from public.m_reminder_deliveries;
delete from public.m_notes;
delete from public.m_metric_entries;
delete from public.m_persistent_states;
delete from public.m_daily_assignments;
delete from public.m_reminders;
delete from public.m_agenda_schedules;
delete from public.m_items;
delete from public.m_groups;
delete from public.m_time_slots;
