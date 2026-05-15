
alter table public.notes
  add column if not exists position_x double precision,
  add column if not exists position_y double precision,
  add column if not exists display_date date not null default (now() at time zone 'utc')::date;

create index if not exists notes_display_date_idx on public.notes (display_date);
