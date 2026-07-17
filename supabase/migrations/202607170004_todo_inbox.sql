create unique index m_todo_lists_user_name_key
  on public.m_todo_lists(user_id, lower(name));

insert into public.m_todo_lists (user_id, name, color, position)
select profile.id, 'Gelen Kutusu', '#395f47', 0
from public.m_profiles profile
where not exists (
  select 1 from public.m_todo_lists list
  where list.user_id = profile.id
);

comment on index public.m_todo_lists_user_name_key is 'Keeps Todo list names unique per user and enables safe Inbox creation.';
