create type public.m_group_content_type as enum ('standard', 'module');

alter table public.m_groups
  add column content_type public.m_group_content_type not null default 'standard',
  add column default_item_kind public.m_item_kind,
  add column module_key text,
  add column module_settings jsonb not null default '{}'::jsonb,
  add constraint m_groups_content_configuration_check check (
    (content_type = 'standard' and module_key is null)
    or (content_type = 'module' and default_item_kind is null and module_key is not null)
  );

comment on column public.m_groups.content_type is 'Standard groups contain items; module groups host an independent application module.';
comment on column public.m_groups.default_item_kind is 'Default item kind for a standard group. Null inherits from the nearest parent and ultimately falls back to daily.';
comment on column public.m_groups.module_key is 'Registry key of the independent module hosted by this group.';
comment on column public.m_groups.module_settings is 'Module-owned configuration. Standard groups keep an empty object.';
comment on column public.m_persistent_states.time_slot_id is 'Time slot used when a fixed item appears in Agenda.';
