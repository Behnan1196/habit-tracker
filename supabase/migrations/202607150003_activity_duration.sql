alter table public.m_items
add column if not exists activity_tag text,
add column if not exists estimated_minutes integer;

alter table public.m_daily_assignments
add column if not exists actual_duration_minutes integer;

alter table public.m_items
drop constraint if exists m_items_estimated_minutes_check;

alter table public.m_items
add constraint m_items_estimated_minutes_check check (
  estimated_minutes is null or estimated_minutes > 0
);

alter table public.m_daily_assignments
drop constraint if exists m_daily_assignments_actual_duration_check;

alter table public.m_daily_assignments
add constraint m_daily_assignments_actual_duration_check check (
  actual_duration_minutes is null or actual_duration_minutes > 0
);

comment on column public.m_items.activity_tag is 'User-defined analytics category for daily activities.';
comment on column public.m_items.estimated_minutes is 'Default expected duration for a daily activity.';
comment on column public.m_daily_assignments.actual_duration_minutes is 'Actual duration confirmed when an assignment is completed.';
