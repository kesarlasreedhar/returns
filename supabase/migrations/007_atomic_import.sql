-- Atomic workbook import: replace the three sequential client-side upserts
-- (catalog -> packages -> package_items) with one transactional RPC, and
-- give package_items a real uniqueness rule so duplicate rows are rejected
-- (upload-time validation) instead of silently upserted/collapsed.

-- One-time cleanup: consolidate any pre-existing duplicate package_items rows
-- (same package_id + barcode + order_reference), keeping the most recent one,
-- so the unique index below can be created safely.
delete from package_items pi
using package_items pi2
where pi.package_id = pi2.package_id
  and pi.barcode = pi2.barcode
  and coalesce(pi.order_reference, '') = coalesce(pi2.order_reference, '')
  and pi.created_at < pi2.created_at;

create unique index if not exists package_items_package_barcode_order_key
  on package_items (package_id, barcode, order_reference);

create or replace function import_returns_workbook(
  p_catalog jsonb,
  p_packages jsonb,
  p_package_items jsonb,
  p_uploaded_by uuid,
  p_file_name text
) returns void
language plpgsql
as $$
begin
  insert into catalog_products (barcode, artist, title, format, media_type, image_url)
  select barcode, artist, title, format, media_type, image_url
  from jsonb_to_recordset(p_catalog) as c(
    barcode text, artist text, title text, format text, media_type text, image_url text
  )
  on conflict (barcode) do update set
    artist = excluded.artist,
    title = excluded.title,
    format = excluded.format,
    media_type = excluded.media_type,
    image_url = excluded.image_url,
    updated_at = now();

  insert into packages (
    return_tracking_number, carrier, distinct_items, total_units, total_refund_usd,
    expected_conditions, order_references, earliest_return_requested, status
  )
  select
    pkg.return_tracking_number, pkg.carrier, pkg.distinct_items, pkg.total_units, pkg.total_refund_usd,
    pkg.expected_conditions, pkg.order_references, nullif(pkg.earliest_return_requested, '')::date, pkg.status
  from jsonb_to_recordset(p_packages) as pkg(
    return_tracking_number text, carrier text, distinct_items int, total_units int,
    total_refund_usd numeric, expected_conditions text, order_references text,
    earliest_return_requested text, status text
  )
  on conflict (return_tracking_number) do update set
    carrier = excluded.carrier,
    distinct_items = excluded.distinct_items,
    total_units = excluded.total_units,
    total_refund_usd = excluded.total_refund_usd,
    expected_conditions = excluded.expected_conditions,
    order_references = excluded.order_references,
    earliest_return_requested = excluded.earliest_return_requested,
    status = excluded.status,
    updated_at = now();

  insert into package_items (
    package_id, barcode, artist, title, qty_expected, expected_condition,
    customer_return_reason, refund_amount_usd, order_reference, return_requested_date, order_date
  )
  select
    p.id, i.barcode, i.artist, i.title, i.qty_expected, i.expected_condition,
    i.customer_return_reason, i.refund_amount_usd, i.order_reference,
    nullif(i.return_requested_date, '')::date, nullif(i.order_date, '')::date
  from jsonb_to_recordset(p_package_items) as i(
    return_tracking_number text, barcode text, artist text, title text, qty_expected int,
    expected_condition text, customer_return_reason text, refund_amount_usd numeric,
    order_reference text, return_requested_date text, order_date text
  )
  join packages p on p.return_tracking_number = i.return_tracking_number
  on conflict (package_id, barcode, order_reference) do update set
    artist = excluded.artist,
    title = excluded.title,
    qty_expected = excluded.qty_expected,
    expected_condition = excluded.expected_condition,
    customer_return_reason = excluded.customer_return_reason,
    refund_amount_usd = excluded.refund_amount_usd,
    return_requested_date = excluded.return_requested_date,
    order_date = excluded.order_date,
    updated_at = now();

  insert into upload_batches (kind, file_name, row_count, uploaded_by)
  values
    ('catalog', p_file_name, jsonb_array_length(p_catalog), p_uploaded_by),
    ('packages', p_file_name, jsonb_array_length(p_packages), p_uploaded_by),
    ('package_items', p_file_name, jsonb_array_length(p_package_items), p_uploaded_by);
end;
$$;
