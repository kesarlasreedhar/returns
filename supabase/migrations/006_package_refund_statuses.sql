-- Replace the original package workflow with the return/refund operations lifecycle.
-- Existing records are preserved and translated to their nearest equivalent state.

update packages
set status = case status
  when 'received' then 'open'
  when 'in_processing' then 'scanned'
  when 'processed' then 'ready_for_refund'
  when 'sent_back' then 'closed'
  else status
end;

alter table packages drop constraint if exists packages_status_check;
alter table packages alter column status set default 'open';
alter table packages add constraint packages_status_check
  check (status in ('open', 'scanned', 'ready_for_refund', 'review_for_refund', 'closed'));
