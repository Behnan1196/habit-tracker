create table public.m_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  group_id uuid not null,
  title text not null check (char_length(trim(title)) between 1 and 160),
  body text not null default '',
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (group_id, user_id) references public.m_groups(id, user_id) on delete cascade
);

create index m_notes_user_group_pinned_updated_idx
  on public.m_notes(user_id, group_id, is_pinned desc, updated_at desc);

create trigger m_notes_updated_at
  before update on public.m_notes
  for each row execute function public.m_set_updated_at();

alter table public.m_notes enable row level security;

create policy m_notes_owner_all on public.m_notes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

comment on table public.m_notes is 'Independent note records owned by groups configured with the notes module.';
