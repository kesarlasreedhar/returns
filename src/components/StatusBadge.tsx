import { PackageStatus } from "@/types/domain";

type Props = {
  status: PackageStatus;
};

const labels: Record<PackageStatus, string> = {
  open: "Open",
  scanned: "Scanned",
  automatic_refund: "Automatic Refund",
  review_for_refund: "Review for Refund",
  closed: "Closed"
};

export function StatusBadge({ status }: Props): JSX.Element {
  return <span className={`status-badge status-${status}`}>{labels[status]}</span>;
}
