-- Rename the "ready_for_refund" package status to "automatic_refund" for clarity
-- (this state is reached automatically once every item matches expectations,
-- as opposed to review_for_refund which requires manual approval).

alter table packages drop constraint if exists packages_status_check;
alter table packages add constraint packages_status_check
  check (status in ('open', 'scanned', 'ready_for_refund', 'automatic_refund', 'review_for_refund', 'closed'));

update packages
set status = 'automatic_refund'
where status = 'ready_for_refund';

update package_status_history
set from_status = 'automatic_refund'
where from_status = 'ready_for_refund';

update package_status_history
set to_status = 'automatic_refund'
where to_status = 'ready_for_refund';

alter table packages drop constraint if exists packages_status_check;
alter table packages add constraint packages_status_check
  check (status in ('open', 'scanned', 'automatic_refund', 'review_for_refund', 'closed'));
