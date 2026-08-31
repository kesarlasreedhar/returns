import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { AppLayout } from "@/components/AppLayout";
import { StatusBadge } from "@/components/StatusBadge";
import { getCurrentUser, logout } from "@/lib/auth";
import { getPackages, updatePackageStatus } from "@/lib/storage";
import { AppUser, PackageStatus, PackageSummary } from "@/types/domain";

export default function ProcessingPage(): JSX.Element | null {
  const router = useRouter();
  const [user, setUser] = useState<AppUser | null>(null);
  const [packages, setPackages] = useState<PackageSummary[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | PackageStatus>("all");
  const [minRefund, setMinRefund] = useState("");
  const [maxRefund, setMaxRefund] = useState("");

  useEffect(() => {
    const current = getCurrentUser();
    if (!current) {
      router.replace("/login");
      return;
    }
    if (current.role === "seller") {
      router.replace("/dashboard");
      return;
    }
    setUser(current);
    getPackages().then(setPackages);
  }, [router]);

  const statusOptions = useMemo(
    () => ["received", "in_processing", "processed", "sent_back"] as PackageStatus[],
    []
  );

  async function onStatusChange(returnTrackingNumber: string, status: PackageStatus): Promise<void> {
    await updatePackageStatus(returnTrackingNumber, status);
    const updated = await getPackages();
    setPackages(updated);
  }

  const filteredPackages = useMemo(() => {
    return packages.filter((pkg) => {
      if (statusFilter !== "all" && pkg.status !== statusFilter) {
        return false;
      }

      const min = minRefund ? Number(minRefund) : null;
      const max = maxRefund ? Number(maxRefund) : null;
      if (min !== null && !Number.isNaN(min) && pkg.totalRefundUsd < min) {
        return false;
      }
      if (max !== null && !Number.isNaN(max) && pkg.totalRefundUsd > max) {
        return false;
      }

      return true;
    });
  }, [maxRefund, minRefund, packages, statusFilter]);

  if (!user) {
    return null;
  }

  return (
    <AppLayout
      title="Processing Queue"
      user={user}
      onLogout={() => {
        logout();
        router.push("/login");
      }}
    >
      <section className="panel-grid three-column">
        <article className="panel">
          <h2>Filter Queue</h2>
          <label htmlFor="statusFilter">Status</label>
          <select id="statusFilter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | PackageStatus)}>
            <option value="all">All</option>
            {statusOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </article>

        <article className="panel">
          <h2>Total Refund</h2>
          <label htmlFor="minRefund">Min Refund</label>
          <input id="minRefund" type="number" value={minRefund} onChange={(event) => setMinRefund(event.target.value)} placeholder="0" />
          <label htmlFor="maxRefund">Max Refund</label>
          <input id="maxRefund" type="number" value={maxRefund} onChange={(event) => setMaxRefund(event.target.value)} placeholder="1000" />
        </article>

        <article className="panel">
          <h2>Queue Count</h2>
          <p className="hint-text">Showing {filteredPackages.length} packages</p>
        </article>
      </section>

      <table className="table">
        <thead>
          <tr>
            <th>Tracking #</th>
            <th>Carrier</th>
            <th>Distinct Items</th>
            <th>Total Units</th>
            <th>Total Refund</th>
            <th>Status</th>
            <th>Update</th>
          </tr>
        </thead>
        <tbody>
          {filteredPackages.map((pkg) => (
            <tr key={pkg.returnTrackingNumber}>
              <td>{pkg.returnTrackingNumber}</td>
              <td>{pkg.carrier}</td>
              <td>{pkg.distinctItems}</td>
              <td>{pkg.totalUnits}</td>
              <td>${pkg.totalRefundUsd.toFixed(2)}</td>
              <td>
                <StatusBadge status={pkg.status} />
              </td>
              <td>
                <select
                  value={pkg.status}
                  onChange={(event) => onStatusChange(pkg.returnTrackingNumber, event.target.value as PackageStatus)}
                >
                  {statusOptions.map((option) => (
                    <option value={option} key={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </AppLayout>
  );
}
