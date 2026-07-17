alter table public.m_daily_assignments
  drop constraint if exists m_daily_assignments_schedule_id_fkey;

alter table public.m_daily_assignments
  add constraint m_daily_assignments_schedule_id_fkey
  foreign key (schedule_id)
  references public.m_agenda_schedules(id)
  on delete set null;

comment on column public.m_daily_assignments.schedule_id is
  'Originating repeat program. Set to null when the program is removed so completed history is preserved.';
