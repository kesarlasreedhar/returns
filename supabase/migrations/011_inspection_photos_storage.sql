-- inspection_photos.file_path used to hold a full base64 data URL for every
-- photo, and GET /api/inspection-photos returned every row's file_path in one
-- response. As photos accumulated this response grew past the Netlify
-- Functions payload/memory ceiling, crashing the function (502 Bad Gateway)
-- for every caller.
--
-- Move photo bytes into Supabase Storage instead: inspection_photos.file_path
-- now stores a small storage object path (e.g. "<package_item_id>/<id>.jpg"),
-- and the API generates a short-lived signed URL per request instead of
-- persisting the bytes in Postgres.
--
-- Bucket is private (public = false); RLS-enabled storage.objects with no
-- policy denies anon/authenticated by default and the service role (used by
-- every server-side call in this app) bypasses RLS regardless, matching the
-- posture in 008_tighten_rls.sql.
insert into storage.buckets (id, name, public)
values ('inspection-photos', 'inspection-photos', false)
on conflict (id) do nothing;
