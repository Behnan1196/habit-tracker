alter table public.m_agenda_schedules
  add column scheduled_time time,
  add column agenda_position integer not null default 0;

alter table public.m_daily_assignments
  add column schedule_id uuid references public.m_agenda_schedules(id) on delete cascade;

alter table public.m_todo_tasks
  add column scheduled_time time,
  add column agenda_position integer not null default 0;

update public.m_daily_assignments assignment
set schedule_id = (
  select schedule.id
  from public.m_agenda_schedules schedule
  where schedule.user_id = assignment.user_id
    and schedule.item_id = assignment.item_id
    and schedule.time_slot_id = assignment.time_slot_id
  order by schedule.created_at
  limit 1
)
where assignment.schedule_id is null;

create index m_agenda_schedules_slot_order_idx on public.m_agenda_schedules(user_id, time_slot_id, scheduled_time, agenda_position);
create index m_todo_tasks_agenda_order_idx on public.m_todo_tasks(user_id, agenda_date, time_slot_id, scheduled_time, agenda_position);

comment on column public.m_agenda_schedules.scheduled_time is 'Optional exact time inside the broader Agenda time slot.';
comment on column public.m_agenda_schedules.agenda_position is 'Manual order for entries without an exact time or sharing the same time.';
