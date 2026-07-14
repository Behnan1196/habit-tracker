alter table public.m_groups
add column if not exists background_color text;

comment on column public.m_groups.background_color is 'Optional background color for group headers.';
