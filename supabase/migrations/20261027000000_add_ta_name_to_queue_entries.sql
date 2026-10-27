alter table public.queue_entries
add column if not exists ta_name text;
