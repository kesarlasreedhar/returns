create extension if not exists "pgcrypto";

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  full_name text not null,
  role text not null check (role in ('admin', 'seller', 'processor')),
  created_at timestamptz not null default now()
);

create table if not exists catalog_products (
  id uuid primary key default gen_random_uuid(),
  barcode text unique not null,
  artist text,
  title text,
  format text,
  media_type text,
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists packages (
  id uuid primary key default gen_random_uuid(),
  return_tracking_number text unique not null,
  carrier text not null,
  distinct_items int not null default 0,
  total_units int not null default 0,
  total_refund_usd numeric(12,2) not null default 0,
  expected_conditions text,
  order_references text,
  earliest_return_requested date,
  status text not null default 'received' check (status in ('received', 'in_processing', 'processed', 'sent_back')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists package_items (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references packages(id) on delete cascade,
  barcode text not null,
  artist text,
  title text,
  qty_expected int not null default 1,
  expected_condition text,
  customer_return_reason text,
  refund_amount_usd numeric(12,2) not null default 0,
  order_reference text,
  return_requested_date date,
  order_date date,
  actual_condition text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists upload_batches (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('catalog', 'packages', 'package_items')),
  file_name text not null,
  row_count int not null,
  uploaded_by uuid references app_users(id),
  created_at timestamptz not null default now()
);

create table if not exists package_status_history (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references packages(id) on delete cascade,
  from_status text,
  to_status text not null,
  changed_by uuid references app_users(id),
  changed_at timestamptz not null default now()
);

create table if not exists inspection_photos (
  id uuid primary key default gen_random_uuid(),
  package_item_id uuid not null references package_items(id) on delete cascade,
  file_path text not null,
  uploaded_by uuid references app_users(id),
  created_at timestamptz not null default now()
);

-- Enable Row Level Security on all tables
alter table app_users enable row level security;
alter table catalog_products enable row level security;
alter table packages enable row level security;
alter table package_items enable row level security;
alter table upload_batches enable row level security;
alter table package_status_history enable row level security;
alter table inspection_photos enable row level security;

-- RLS Policies: Allow all authenticated users to access all tables
-- (In production, you may want more granular policies based on user roles)

create policy "Allow authenticated users full access"
  on app_users for all
  using (auth.role() = 'authenticated');

create policy "Allow authenticated users full access"
  on catalog_products for all
  using (auth.role() = 'authenticated');

create policy "Allow authenticated users full access"
  on packages for all
  using (auth.role() = 'authenticated');

create policy "Allow authenticated users full access"
  on package_items for all
  using (auth.role() = 'authenticated');

create policy "Allow authenticated users full access"
  on upload_batches for all
  using (auth.role() = 'authenticated');

create policy "Allow authenticated users full access"
  on package_status_history for all
  using (auth.role() = 'authenticated');

create policy "Allow authenticated users full access"
  on inspection_photos for all
  using (auth.role() = 'authenticated');

-- Insert demo users for testing
insert into app_users (email, full_name, role) values
  ('admin@returns.local', 'Admin User', 'admin'),
  ('seller1@returns.local', 'Seller One', 'seller'),
  ('seller2@returns.local', 'Seller Two', 'seller'),
  ('processor1@returns.local', 'Processor One', 'processor')
on conflict (email) do nothing;
