alter table public.m_items
  add column activity_tags text[] not null default '{}';

update public.m_items item
set activity_tag = coalesce(nullif(item.activity_tag, ''), source.name)
from public.m_groups source
where item.group_id = source.id
  and item.kind = 'daily';

comment on column public.m_items.activity_tag is
  'Primary analytics category. Defaults to the containing library group name and is counted once in duration totals.';

comment on column public.m_items.activity_tags is
  'Secondary purpose or effect tags. These may overlap and must not be summed as a mutually exclusive duration total.';
