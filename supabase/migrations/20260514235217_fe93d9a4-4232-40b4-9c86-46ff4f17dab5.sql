
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  written_by text not null,
  shift text not null,
  apartment text,
  category text,
  status text not null default 'open',
  image_url text not null,
  transcribed_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index notes_status_created_at_idx on public.notes (status, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger notes_set_updated_at
before update on public.notes
for each row execute function public.set_updated_at();

alter table public.notes enable row level security;

-- MVP demo: open access. Tighten before production.
create policy "notes_select_all" on public.notes for select using (true);
create policy "notes_insert_all" on public.notes for insert with check (true);
create policy "notes_update_all" on public.notes for update using (true) with check (true);

-- Storage bucket for handwritten note images
insert into storage.buckets (id, name, public)
values ('note-images', 'note-images', true)
on conflict (id) do nothing;

create policy "note_images_public_read"
on storage.objects for select
using (bucket_id = 'note-images');

create policy "note_images_public_insert"
on storage.objects for insert
with check (bucket_id = 'note-images');
