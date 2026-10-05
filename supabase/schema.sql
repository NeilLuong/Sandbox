-- LeetCode Log database. Paste this whole file into Supabase -> SQL Editor -> Run.
-- Safe to run again: it only creates what is missing.

create table if not exists public.problems (
  id           bigint generated always as identity primary key,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  number       integer not null check (number > 0),
  title        text not null default '',
  difficulty   text check (difficulty in ('Easy', 'Medium', 'Hard')),
  tags         text[] not null default '{}',
  description  text not null default '',
  needs_review boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, number)
);

-- Keep updated_at current on every edit.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists problems_set_updated_at on public.problems;
create trigger problems_set_updated_at
  before update on public.problems
  for each row execute function public.set_updated_at();

-- Row Level Security: a signed-in user can only see and change their own rows,
-- and visitors who are not signed in cannot see anything.
alter table public.problems enable row level security;

drop policy if exists "Users manage their own problems" on public.problems;
create policy "Users manage their own problems"
  on public.problems
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.problems to authenticated;
revoke all on public.problems from anon;
