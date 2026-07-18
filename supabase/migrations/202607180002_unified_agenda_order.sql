alter table public.m_agenda_blocks
  add column agenda_position integer not null default 0;

update public.m_agenda_blocks block
set agenda_position = 100000 + block.position;

create index m_agenda_blocks_unified_order_idx
  on public.m_agenda_blocks(user_id, time_slot_id, agenda_position);

comment on column public.m_agenda_blocks.agenda_position is
  'Position in the shared time-slot sequence alongside ungrouped Agenda entries.';
