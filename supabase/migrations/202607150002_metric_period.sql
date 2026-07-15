alter table public.m_items
add column if not exists metric_period text;

update public.m_items
set metric_period = 'daily'
where kind = 'metric' and metric_period is null;

alter table public.m_items
drop constraint if exists m_items_metric_period_check;

alter table public.m_items
add constraint m_items_metric_period_check check (
  (kind = 'metric' and metric_period in ('daily', 'weekly', 'monthly'))
  or (kind <> 'metric' and metric_period is null)
);

comment on column public.m_items.metric_period is 'Expected entry cadence for metric items: daily, weekly, or monthly.';
