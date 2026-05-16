
-- Workspace-scoped storage paths and tightened RLS
-- ============================================================

-- Helper: does the given storage object name belong to current user's workspace?
-- shared workspace: first folder must be 'shared' (or legacy root-level objects with no slash)
-- solo workspace:   first folder must equal auth.uid()::text
create or replace function public.storage_workspace_matches(_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  ws uuid := public.get_my_workspace_id();
  first_seg text := split_part(_name, '/', 1);
begin
  if ws is null then
    return first_seg = 'shared' or position('/' in _name) = 0;
  else
    return first_seg = ws::text;
  end if;
end;
$$;

-- Drop overly-permissive legacy policies on storage.objects
drop policy if exists note_images_public_read on storage.objects;
drop policy if exists note_images_public_insert on storage.objects;

-- Replace allowed policies to enforce workspace scoping
drop policy if exists note_images_select_allowed on storage.objects;
drop policy if exists note_images_insert_allowed on storage.objects;
drop policy if exists note_images_update_allowed on storage.objects;
drop policy if exists note_audio_select_allowed on storage.objects;
drop policy if exists note_audio_insert_allowed on storage.objects;

create policy note_images_select_workspace
  on storage.objects for select to authenticated
  using (
    bucket_id = 'note-images'
    and public.is_user_allowed(auth.uid())
    and public.storage_workspace_matches(name)
  );

create policy note_images_insert_workspace
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'note-images'
    and public.is_user_allowed(auth.uid())
    and public.storage_workspace_matches(name)
  );

create policy note_images_update_workspace
  on storage.objects for update to authenticated
  using (
    bucket_id = 'note-images'
    and public.is_user_allowed(auth.uid())
    and public.storage_workspace_matches(name)
  )
  with check (
    bucket_id = 'note-images'
    and public.is_user_allowed(auth.uid())
    and public.storage_workspace_matches(name)
  );

create policy note_audio_select_workspace
  on storage.objects for select to authenticated
  using (
    bucket_id = 'note-audio'
    and public.is_user_allowed(auth.uid())
    and public.storage_workspace_matches(name)
  );

create policy note_audio_insert_workspace
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'note-audio'
    and public.is_user_allowed(auth.uid())
    and public.storage_workspace_matches(name)
  );
