-- One-time cleanup: remove package_items duplicated by re-uploads made before
-- migration 012, for packages still in 'open' status.
--
-- Each import inserts a package's items in one transaction, so items from one
-- upload share the same created_at. Within a package, items are numbered per
-- (barcode, order_reference) inside each upload batch; one copy per
-- (barcode, order_reference, occurrence #) is kept, preferring a copy that has
-- inspection data, then the most recent upload. Legitimate repeated rows within
-- one shipment are therefore preserved.
--
-- Safety rules:
--   * only packages with status 'open' whose item units exceed total_units
--   * a package is only cleaned if the kept items add up exactly to total_units
--   * items with actual_condition, inspection photos or operation notes are
--     never deleted (photos/notes cascade on delete)
--
-- Preview before applying (same logic, read-only):
--   run the "candidates" CTE below as a select.

do $$
declare
  v_deleted int;
  v_packages int;
begin
  create temp table _dup_candidates on commit drop as
  with target_packages as (
    select p.id, p.total_units
    from packages p
    join package_items pi on pi.package_id = p.id
    where p.status = 'open'
    group by p.id, p.total_units
    having sum(pi.qty_expected) > p.total_units
  ),
  items as (
    select
      pi.id,
      pi.package_id,
      pi.barcode,
      coalesce(nullif(btrim(pi.order_reference), ''), '') as ref,
      pi.qty_expected,
      pi.created_at,
      (
        pi.actual_condition is not null
        or exists (select 1 from inspection_photos ph where ph.package_item_id = pi.id)
        or exists (select 1 from operation_notes n where n.package_item_id = pi.id)
      ) as has_data
    from package_items pi
    join target_packages tp on tp.id = pi.package_id
  ),
  numbered as (
    select
      i.*,
      row_number() over (
        partition by i.package_id, i.barcode, i.ref, i.created_at
        order by i.id
      ) as occurrence
    from items i
  ),
  ranked as (
    select
      n.*,
      row_number() over (
        partition by n.package_id, n.barcode, n.ref, n.occurrence
        order by n.has_data desc, n.created_at desc, n.id
      ) as keep_rank
    from numbered n
  ),
  safe_packages as (
    select r.package_id
    from ranked r
    join target_packages tp on tp.id = r.package_id
    group by r.package_id, tp.total_units
    having sum(r.qty_expected) filter (where r.keep_rank = 1 or r.has_data) = tp.total_units
  )
  select r.id, r.package_id
  from ranked r
  join safe_packages s on s.package_id = r.package_id
  where r.keep_rank > 1
    and not r.has_data;

  select count(distinct package_id) into v_packages from _dup_candidates;

  delete from package_items pi
  using _dup_candidates c
  where pi.id = c.id;
  get diagnostics v_deleted = row_count;

  raise notice 'Removed % duplicate package_items across % open packages.', v_deleted, v_packages;

  drop table _dup_candidates;
end;
$$;
