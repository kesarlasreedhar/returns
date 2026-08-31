import { PackageStatus } from "@/types/domain";

type Props = {
  status: PackageStatus;
};

const labels: Record<PackageStatus, string> = {
  received: "Received",
  in_processing: "In Processing",
  processed: "Processed",
  sent_back: "Sent Back"
};

export function StatusBadge({ status }: Props): JSX.Element {
  return <span className={`status-badge status-${status}`}>{labels[status]}</span>;
}
