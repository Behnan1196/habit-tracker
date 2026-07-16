alter table public.m_groups
  add column default_time_slot_id uuid,
  add constraint m_groups_default_time_slot_fk
    foreign key (default_time_slot_id, user_id)
    references public.m_time_slots(id, user_id)
    on delete set null (default_time_slot_id);

comment on column public.m_groups.default_time_slot_id is 'Default time slot inherited by items and standard child groups for quick daily planning.';
