
-- Roles enum
do $$ begin
  create type public.app_role as enum ('admin', 'moderator', 'user');
exception when duplicate_object then null; end $$;

-- user_roles table
create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

alter table public.user_roles enable row level security;

-- Security definer role check
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

-- Are there any admins yet?
create or replace function public.has_any_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.user_roles where role = 'admin')
$$;

-- Policies on user_roles
drop policy if exists "user_roles_select_self_or_admin" on public.user_roles;
create policy "user_roles_select_self_or_admin"
on public.user_roles for select
to authenticated
using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));

drop policy if exists "user_roles_admin_manage" on public.user_roles;
create policy "user_roles_admin_manage"
on public.user_roles for all
to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

-- Allow notes deletion by admins
drop policy if exists "notes_delete_admin" on public.notes;
create policy "notes_delete_admin"
on public.notes for delete
to authenticated
using (public.has_role(auth.uid(), 'admin'));
