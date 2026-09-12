alter table operation_notes
  add column if not exists package_item_id uuid references package_items(id) on delete cascade;

create index if not exists operation_notes_package_item_id_idx on operation_notes(package_item_id);
