-- Keep id primary key. Ensure barcode remains unique so upload upsert can use onConflict: "barcode".

create unique index if not exists catalog_products_barcode_key
  on catalog_products (barcode);
