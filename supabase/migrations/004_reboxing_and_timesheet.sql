create table if not exists reboxing_events (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references packages(id) on delete cascade,
  outbound_box_barcode text not null,
  outbound_shipping_barcode text not null,
  processed_by uuid references app_users(id),
  created_at timestamptz not null default now()
);

create table if not exists timesheet_entries (
  id uuid primary key default gen_random_uuid(),
  processor_name text not null,
  work_date date not null,
  hours_worked numeric(5,2) not null check (hours_worked >= 0),
  notes text,
  created_at timestamptz not null default now()
);

alter table reboxing_events enable row level security;
alter table timesheet_entries enable row level security;

drop policy if exists reboxing_events_full_access on reboxing_events;
create policy reboxing_events_full_access
  on reboxing_events
  for all
  using (true)
  with check (true);

drop policy if exists timesheet_entries_full_access on timesheet_entries;
create policy timesheet_entries_full_access
  on timesheet_entries
  for all
  using (true)
  with check (true);
