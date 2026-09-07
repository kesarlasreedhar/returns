import { PackageStatus } from "@/types/domain";

type Props = {
  status: PackageStatus;
};

const labels: Record<PackageStatus, string> = {
  open: "Open",
  scanned: "Scanned",
  ready_for_refund: "Ready for Refund",
  review_for_refund: "Review for Refund",
  closed: "Closed"
};

export function StatusBadge({ status }: Props): JSX.Element {
  return <span className={`status-badge status-${status}`}>{labels[status]}</span>;
}
