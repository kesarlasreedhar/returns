import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { AppLayout } from "@/components/AppLayout";
import { StatusBadge } from "@/components/StatusBadge";
import { getCurrentUser, logout } from "@/lib/auth";
import { getPackages, updatePackageStatus } from "@/lib/storage";
import { AppUser, PackageStatus, PackageSummary } from "@/types/domain";

function normalizeTrackingNumber(value: string): string {
  return value.trim().toUpperCase().replace(/[\s-]/g, "");
}

export default function ProcessingPage(): JSX.Element | null {
  const router = useRouter();
  const [user, setUser] = useState<AppUser | null>(null);
  const [packages, setPackages] = useState<PackageSummary[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | PackageStatus>("all");
  const [trackingSearch, setTrackingSearch] = useState("");

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
    () => ["open", "scanned", "ready_for_refund", "review_for_refund", "closed"] as PackageStatus[],
    []
  );

  async function onStatusChange(returnTrackingNumber: string, status: PackageStatus): Promise<void> {
    await updatePackageStatus(returnTrackingNumber, status);
    const updated = await getPackages();
    setPackages(updated);
  }

  const filteredPackages = useMemo(() => {
    return packages.filter((pkg) => {
      const normalizedSearch = normalizeTrackingNumber(trackingSearch);
      if (normalizedSearch && !normalizeTrackingNumber(pkg.returnTrackingNumber).includes(normalizedSearch)) {
        return false;
      }

      if (statusFilter !== "all" && pkg.status !== statusFilter) {
        return false;
      }

      return true;
    });
  }, [packages, statusFilter, trackingSearch]);

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
          <h2>Find Tracking</h2>
          <label htmlFor="trackingSearch">Tracking Number</label>
          <input
            id="trackingSearch"
            value={trackingSearch}
            onChange={(event) => setTrackingSearch(event.target.value)}
            placeholder="Scan or type tracking"
          />
        </article>

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
            <th>Status</th>
            <th>Update</th>
          </tr>
        </thead>
        <tbody>
          {filteredPackages.map((pkg) => (
            <tr key={pkg.returnTrackingNumber}>
              <td>
                <Link href={`/mobile-scanner?tracking=${encodeURIComponent(pkg.returnTrackingNumber)}`}>
                  <a className="tracking-link">{pkg.returnTrackingNumber}</a>
                </Link>
              </td>
              <td>{pkg.carrier}</td>
              <td>{pkg.distinctItems}</td>
              <td>{pkg.totalUnits}</td>
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
