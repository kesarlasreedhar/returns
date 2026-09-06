create table if not exists operation_notes (
  id uuid primary key default gen_random_uuid(),
  note text not null check (char_length(trim(note)) > 0),
  created_by uuid references app_users(id),
  created_at timestamptz not null default now()
);

alter table operation_notes enable row level security;

drop policy if exists operation_notes_full_access on operation_notes;
create policy operation_notes_full_access
  on operation_notes
  for all
  using (true)
  with check (true);
