-- Fix RLS for inspection_photos so app users can save evidence images
-- (this app uses custom/local auth, not Supabase Auth JWT sessions).

alter table if exists inspection_photos enable row level security;

drop policy if exists "Allow authenticated users full access" on inspection_photos;

drop policy if exists inspection_photos_full_access on inspection_photos;
create policy inspection_photos_full_access
  on inspection_photos
  for all
  using (true)
  with check (true);
