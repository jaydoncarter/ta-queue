alter table public.queue_entries
add column if not exists student_id uuid references auth.users (id) on delete set null default auth.uid();

create index if not exists queue_entries_student_id_idx
on public.queue_entries (student_id);

alter table public.queue_entries enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'queue_entries'
      and policyname = 'Queue entries are visible to visitors'
  ) then
    create policy "Queue entries are visible to visitors"
      on public.queue_entries
      for select
      to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'queue_entries'
      and policyname = 'Students can join their own queue entry'
  ) then
    create policy "Students can join their own queue entry"
      on public.queue_entries
      for insert
      to authenticated
      with check (student_id = (select auth.uid()) and status = 'waiting');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'queue_entries'
      and policyname = 'Students can delete their own queue entry'
  ) then
    create policy "Students can delete their own queue entry"
      on public.queue_entries
      for delete
      to authenticated
      using (student_id = (select auth.uid()));
  end if;
end $$;
