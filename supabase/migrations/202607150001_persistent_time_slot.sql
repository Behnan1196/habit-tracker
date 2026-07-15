alter table public.m_persistent_states
add column if not exists time_slot_id uuid;

alter table public.m_persistent_states
drop constraint if exists m_persistent_states_time_slot_owner_fk;

alter table public.m_persistent_states
add constraint m_persistent_states_time_slot_owner_fk
foreign key (time_slot_id, user_id)
references public.m_time_slots(id, user_id)
on delete restrict;

comment on column public.m_persistent_states.time_slot_id is 'Time slot used when a fixed item appears in Focus.';
