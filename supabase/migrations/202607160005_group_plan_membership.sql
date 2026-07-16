alter table public.m_groups
  add column is_in_plan boolean not null default true;

create index m_groups_user_plan_position_idx
  on public.m_groups(user_id, is_in_plan, position);

comment on column public.m_groups.is_in_plan is 'Whether this reusable library group is currently shown in the habitual Plan.';
