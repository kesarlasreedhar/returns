-- Make workbook re-uploads safe when tracking numbers / catalog barcodes repeat,
-- whether within one file or across uploads:
--   * catalog_products / packages: duplicate keys inside one upload are collapsed
--     (last row wins) so ON CONFLICT never hits the same row twice.
--   * Existing rows are updated, but a blank incoming value never wipes stored data.
--   * packages.status is never changed by an import; new packages start as 'open'.
--   * package_items are matched to existing items by
--     (package, barcode, order_reference, occurrence #) so re-uploading a package
--     updates its items instead of appending duplicates. actual_condition is never
--     touched. Repeated identical rows within one shipment remain distinct items.

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
  insert into catalog_products as cp (barcode, artist, title, format, media_type, image_url)
  select distinct on (barcode) barcode, artist, title, format, media_type, image_url
  from (
    select
      btrim(e.doc->>'barcode') as barcode,
      nullif(btrim(e.doc->>'artist'), '') as artist,
      nullif(btrim(e.doc->>'title'), '') as title,
      nullif(btrim(e.doc->>'format'), '') as format,
      nullif(btrim(e.doc->>'media_type'), '') as media_type,
      nullif(btrim(e.doc->>'image_url'), '') as image_url,
      e.ord
    from jsonb_array_elements(p_catalog) with ordinality as e(doc, ord)
  ) c
  where barcode <> ''
  order by barcode, ord desc
  on conflict (barcode) do update set
    artist = coalesce(excluded.artist, cp.artist),
    title = coalesce(excluded.title, cp.title),
    format = coalesce(excluded.format, cp.format),
    media_type = coalesce(excluded.media_type, cp.media_type),
    image_url = coalesce(excluded.image_url, cp.image_url),
    updated_at = now();

  insert into packages as pk (
    return_tracking_number, carrier, distinct_items, total_units, total_refund_usd,
    expected_conditions, order_references, earliest_return_requested, status
  )
  select distinct on (return_tracking_number)
    return_tracking_number, carrier, distinct_items, total_units, total_refund_usd,
    expected_conditions, order_references, earliest_return_requested, 'open'
  from (
    select
      btrim(e.doc->>'return_tracking_number') as return_tracking_number,
      nullif(btrim(e.doc->>'carrier'), '') as carrier,
      (e.doc->>'distinct_items')::int as distinct_items,
      (e.doc->>'total_units')::int as total_units,
      (e.doc->>'total_refund_usd')::numeric as total_refund_usd,
      nullif(btrim(e.doc->>'expected_conditions'), '') as expected_conditions,
      nullif(btrim(e.doc->>'order_references'), '') as order_references,
      nullif(btrim(e.doc->>'earliest_return_requested'), '')::date as earliest_return_requested,
      e.ord
    from jsonb_array_elements(p_packages) with ordinality as e(doc, ord)
  ) pkg
  where return_tracking_number <> ''
  order by return_tracking_number, ord desc
  on conflict (return_tracking_number) do update set
    carrier = coalesce(excluded.carrier, pk.carrier),
    distinct_items = coalesce(excluded.distinct_items, pk.distinct_items),
    total_units = coalesce(excluded.total_units, pk.total_units),
    total_refund_usd = coalesce(excluded.total_refund_usd, pk.total_refund_usd),
    expected_conditions = coalesce(excluded.expected_conditions, pk.expected_conditions),
    order_references = coalesce(excluded.order_references, pk.order_references),
    earliest_return_requested = coalesce(excluded.earliest_return_requested, pk.earliest_return_requested),
    -- status intentionally not updated
    updated_at = now();

  create temp table _import_items on commit drop as
  select
    p.id as package_id,
    i.barcode,
    i.order_reference,
    i.artist,
    i.title,
    i.qty_expected,
    i.expected_condition,
    i.customer_return_reason,
    i.refund_amount_usd,
    i.return_requested_date,
    i.order_date,
    row_number() over (
      partition by p.id, i.barcode, coalesce(i.order_reference, '')
      order by i.ord
    ) as occurrence
  from (
    select
      btrim(e.doc->>'return_tracking_number') as return_tracking_number,
      btrim(e.doc->>'barcode') as barcode,
      nullif(btrim(e.doc->>'order_reference'), '') as order_reference,
      nullif(btrim(e.doc->>'artist'), '') as artist,
      nullif(btrim(e.doc->>'title'), '') as title,
      (e.doc->>'qty_expected')::int as qty_expected,
      nullif(btrim(e.doc->>'expected_condition'), '') as expected_condition,
      nullif(btrim(e.doc->>'customer_return_reason'), '') as customer_return_reason,
      (e.doc->>'refund_amount_usd')::numeric as refund_amount_usd,
      nullif(btrim(e.doc->>'return_requested_date'), '')::date as return_requested_date,
      nullif(btrim(e.doc->>'order_date'), '')::date as order_date,
      e.ord
    from jsonb_array_elements(p_package_items) with ordinality as e(doc, ord)
  ) i
  join packages p on p.return_tracking_number = i.return_tracking_number;

  create temp table _existing_items on commit drop as
  select
    pi.id,
    pi.package_id,
    pi.barcode,
    pi.order_reference,
    row_number() over (
      partition by pi.package_id, pi.barcode, coalesce(nullif(btrim(pi.order_reference), ''), '')
      order by pi.created_at, pi.id
    ) as occurrence
  from package_items pi
  where pi.package_id in (select distinct package_id from _import_items);

  update package_items pi set
    artist = coalesce(inc.artist, pi.artist),
    title = coalesce(inc.title, pi.title),
    qty_expected = coalesce(inc.qty_expected, pi.qty_expected),
    expected_condition = coalesce(inc.expected_condition, pi.expected_condition),
    customer_return_reason = coalesce(inc.customer_return_reason, pi.customer_return_reason),
    refund_amount_usd = coalesce(inc.refund_amount_usd, pi.refund_amount_usd),
    return_requested_date = coalesce(inc.return_requested_date, pi.return_requested_date),
    order_date = coalesce(inc.order_date, pi.order_date),
    -- actual_condition intentionally not updated
    updated_at = now()
  from _import_items inc
  join _existing_items ex
    on ex.package_id = inc.package_id
   and ex.barcode = inc.barcode
   and coalesce(nullif(btrim(ex.order_reference), ''), '') = coalesce(inc.order_reference, '')
   and ex.occurrence = inc.occurrence
  where pi.id = ex.id;

  insert into package_items (
    package_id, barcode, artist, title, qty_expected, expected_condition,
    customer_return_reason, refund_amount_usd, order_reference, return_requested_date, order_date
  )
  select
    inc.package_id, inc.barcode, inc.artist, inc.title, coalesce(inc.qty_expected, 1), inc.expected_condition,
    inc.customer_return_reason, coalesce(inc.refund_amount_usd, 0), inc.order_reference,
    inc.return_requested_date, inc.order_date
  from _import_items inc
  where not exists (
    select 1
    from _existing_items ex
    where ex.package_id = inc.package_id
      and ex.barcode = inc.barcode
      and coalesce(nullif(btrim(ex.order_reference), ''), '') = coalesce(inc.order_reference, '')
      and ex.occurrence = inc.occurrence
  );

  drop table _import_items;
  drop table _existing_items;

  insert into upload_batches (kind, file_name, row_count, uploaded_by)
  values
    ('catalog', p_file_name, jsonb_array_length(p_catalog), p_uploaded_by),
    ('packages', p_file_name, jsonb_array_length(p_packages), p_uploaded_by),
    ('package_items', p_file_name, jsonb_array_length(p_package_items), p_uploaded_by);
end;
$$;
