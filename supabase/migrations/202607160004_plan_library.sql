alter table public.m_items
  add column is_in_plan boolean not null default true;

create index m_items_user_plan_position_idx
  on public.m_items(user_id, is_in_plan, position);

comment on column public.m_items.is_in_plan is 'Whether this reusable library item is currently shown in the habitual Plan.';
