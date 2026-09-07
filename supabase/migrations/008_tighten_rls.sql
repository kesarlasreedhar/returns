-- Close the direct-Supabase-access hole: every table so far has a permissive
-- policy ("using (true)" or "auth.role() = 'authenticated'") that lets anyone
-- holding the public anon key read/write it directly, bypassing the app's
-- own role checks entirely (the app uses custom/local auth, not Supabase Auth
-- sessions, so `authenticated`/`anon` are the only roles the anon key ever gets).
--
-- All reads/writes now go through session-gated Next.js API routes using the
-- service-role key (which bypasses RLS regardless of policies). Dropping these
-- policies with no replacement means RLS-enabled + zero-policies denies all
-- access to `anon`/`authenticated` by default, while the service role is
-- unaffected.

drop policy if exists "Allow authenticated users full access" on app_users;
drop policy if exists "Allow authenticated users full access" on catalog_products;
drop policy if exists "Allow authenticated users full access" on packages;
drop policy if exists "Allow authenticated users full access" on package_items;
drop policy if exists "Allow authenticated users full access" on upload_batches;
drop policy if exists "Allow authenticated users full access" on package_status_history;
drop policy if exists inspection_photos_full_access on inspection_photos;
drop policy if exists reboxing_events_full_access on reboxing_events;
drop policy if exists timesheet_entries_full_access on timesheet_entries;
drop policy if exists operation_notes_full_access on operation_notes;
