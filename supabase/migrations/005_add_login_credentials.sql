-- Add username/password login support to app_users (previously email-select only)

alter table if exists app_users add column if not exists username text;
alter table if exists app_users add column if not exists password_hash text;

create unique index if not exists app_users_username_key on app_users (username);

insert into app_users (email, full_name, role, username, password_hash) values
  (
    'sreedhar.kesarla@gmail.com',
    'Sreedhar Kesarla',
    'admin',
    'sreedhar.kesarla',
    '$2b$10$m2ZMvUQRvKHn1HaUvaXum.plVvjNDh3l4P0z0WF.ebHozMOC/uyV.'
  )
on conflict (email) do update set
  username = excluded.username,
  password_hash = excluded.password_hash,
  role = excluded.role;
