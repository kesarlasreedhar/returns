import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { AppLayout } from "@/components/AppLayout";
import { StatusBadge } from "@/components/StatusBadge";
import { getCurrentUser, logout } from "@/lib/auth";
import { getInspectionPhotos, getPackageItems, getPackages } from "@/lib/storage";
import { AppUser, InspectionPhoto, PackageItem } from "@/types/domain";

type ReportData = {
  totalPackages: number;
  totalItems: number;
  mismatches: number;
  damagedObserved: number;
  byStatus: {
    open: number;
    scanned: number;
    readyForRefund: number;
    reviewForRefund: number;
    closed: number;
  };
};

export default function ReportsPage(): JSX.Element | null {
  const router = useRouter();
  const [user, setUser] = useState<AppUser | null>(null);
  const [items, setItems] = useState<PackageItem[]>([]);
  const [photosByItemId, setPhotosByItemId] = useState<Record<string, InspectionPhoto>>({});
  const [showOnlyMismatches, setShowOnlyMismatches] = useState(true);
  const [selectedCondition, setSelectedCondition] = useState<"all" | "Damaged" | "Opened" | "New">("all");
  const [orderRefSearch, setOrderRefSearch] = useState("");
  const [selectedImage, setSelectedImage] = useState("");
  const [report, setReport] = useState<ReportData>({
    totalPackages: 0,
    totalItems: 0,
    mismatches: 0,
    damagedObserved: 0,
    byStatus: { open: 0, scanned: 0, readyForRefund: 0, reviewForRefund: 0, closed: 0 }
  });
  const [packages, setPackages] = useState<ReturnType<typeof getPackages> extends Promise<infer T> ? T : never>([]);

  useEffect(() => {
    const current = getCurrentUser();
    if (!current) {
      router.replace("/login");
      return;
    }
    if (current.role === "processor") {
      router.replace("/dashboard");
      return;
    }
    setUser(current);

    async function loadReport(): Promise<void> {
      const pkgs = await getPackages();
      const itemRows = await getPackageItems();
      const photos = await getInspectionPhotos();
      setPackages(pkgs);
      setItems(itemRows);

      const photoMap: Record<string, InspectionPhoto> = {};
      for (const photo of photos) {
        if (!photoMap[photo.packageItemId]) {
          photoMap[photo.packageItemId] = photo;
        }
      }
      setPhotosByItemId(photoMap);

      setReport({
        totalPackages: pkgs.length,
        totalItems: itemRows.length,
        mismatches: itemRows.filter((item) => item.actualCondition && item.actualCondition !== item.expectedCondition).length,
        damagedObserved: itemRows.filter((item) => item.actualCondition === "Damaged").length,
        byStatus: {
          open: pkgs.filter((pkg) => pkg.status === "open").length,
          scanned: pkgs.filter((pkg) => pkg.status === "scanned").length,
          readyForRefund: pkgs.filter((pkg) => pkg.status === "ready_for_refund").length,
          reviewForRefund: pkgs.filter((pkg) => pkg.status === "review_for_refund").length,
          closed: pkgs.filter((pkg) => pkg.status === "closed").length
        }
      });
    }
    void loadReport();
  }, [router]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (showOnlyMismatches && (!item.actualCondition || item.actualCondition === item.expectedCondition)) {
        return false;
      }

      if (selectedCondition !== "all" && item.actualCondition !== selectedCondition) {
        return false;
      }

      const normalizedOrderSearch = orderRefSearch.trim().toUpperCase();
      if (normalizedOrderSearch && !(item.orderReference || "").toUpperCase().includes(normalizedOrderSearch)) {
        return false;
      }

      return Boolean(item.actualCondition);
    });
  }, [items, selectedCondition, showOnlyMismatches, orderRefSearch]);

  if (!user) {
    return null;
  }

  return (
    <AppLayout
      title="Seller Reports"
      user={user}
      onLogout={() => {
        logout();
        router.push("/login");
      }}
    >
      <div className="stats-grid">
        <article className="stat-card">
          <p>Total Packages</p>
          <strong>{report.totalPackages}</strong>
        </article>
        <article className="stat-card">
          <p>Total Items</p>
          <strong>{report.totalItems}</strong>
        </article>
        <article className="stat-card">
          <p>Condition Mismatches</p>
          <strong>{report.mismatches}</strong>
        </article>
        <article className="stat-card">
          <p>Observed Damaged</p>
          <strong>{report.damagedObserved}</strong>
        </article>
      </div>

      <h2>Status Summary</h2>
      <table className="table">
        <thead>
          <tr>
            <th>Status</th>
            <th>Count</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <StatusBadge status="open" />
            </td>
            <td>{report.byStatus.open}</td>
          </tr>
          <tr>
            <td>
              <StatusBadge status="scanned" />
            </td>
            <td>{report.byStatus.scanned}</td>
          </tr>
          <tr>
            <td>
              <StatusBadge status="ready_for_refund" />
            </td>
            <td>{report.byStatus.readyForRefund}</td>
          </tr>
          <tr>
            <td>
              <StatusBadge status="review_for_refund" />
            </td>
            <td>{report.byStatus.reviewForRefund}</td>
          </tr>
          <tr>
            <td>
              <StatusBadge status="closed" />
            </td>
            <td>{report.byStatus.closed}</td>
          </tr>
        </tbody>
      </table>

      <h2>Condition Review Filters</h2>
      <section className="panel-grid three-column">
        <article className="panel">
          <label htmlFor="mismatchOnly">Show only mismatches</label>
          <select id="mismatchOnly" value={showOnlyMismatches ? "yes" : "no"} onChange={(event) => setShowOnlyMismatches(event.target.value === "yes")}>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </article>

        <article className="panel">
          <label htmlFor="conditionFilter">Actual condition</label>
          <select id="conditionFilter" value={selectedCondition} onChange={(event) => setSelectedCondition(event.target.value as "all" | "Damaged" | "Opened" | "New")}>
            <option value="all">All</option>
            <option value="Damaged">Damaged</option>
            <option value="Opened">Opened</option>
            <option value="New">New</option>
          </select>
        </article>

        <article className="panel">
          <label htmlFor="orderRefSearch">Order reference</label>
          <input
            id="orderRefSearch"
            value={orderRefSearch}
            onChange={(event) => setOrderRefSearch(event.target.value)}
            placeholder="Search order #"
          />
        </article>

        <article className="panel">
          <p className="hint-text">Review rows: {filteredItems.length}</p>
        </article>
      </section>

      <h2>Item Condition Details</h2>
      <table className="table">
        <thead>
          <tr>
            <th>Tracking #</th>
            <th>Order #</th>
            <th>Barcode</th>
            <th>Expected</th>
            <th>Actual</th>
            <th>Reason</th>
            <th>Evidence</th>
          </tr>
        </thead>
        <tbody>
          {filteredItems.map((item) => {
            const photo = item.id ? photosByItemId[item.id] : undefined;
            return (
              <tr key={`${item.returnTrackingNumber}_${item.barcode}_${item.orderReference}`}>
                <td>
                  <Link href={`/package-review?tracking=${encodeURIComponent(item.returnTrackingNumber)}`}>
                    <a className="tracking-link">{item.returnTrackingNumber}</a>
                  </Link>
                </td>
                <td>{item.orderReference || "-"}</td>
                <td>{item.barcode}</td>
                <td>{item.expectedCondition}</td>
                <td>{item.actualCondition || "Pending"}</td>
                <td>{item.customerReturnReason || "-"}</td>
                <td>
                  {photo ? (
                    <button className="btn-secondary" type="button" onClick={() => setSelectedImage(photo.filePath)}>
                      View Image
                    </button>
                  ) : (
                    "No image"
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {selectedImage ? (
        <div className="modal-overlay" onClick={() => setSelectedImage("")}>
          <div className="modal-card image-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <h3>Evidence Image</h3>
              <button className="btn-secondary" type="button" onClick={() => setSelectedImage("")}>
                Close
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="report-image-large" src={selectedImage} alt="Condition evidence" />
          </div>
        </div>
      ) : null}

      <h2>Package Details</h2>
      <table className="table">
        <thead>
          <tr>
            <th>Tracking #</th>
            <th>Carrier</th>
            <th>Units</th>
            <th>Refund</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {packages.map((pkg) => (
            <tr key={pkg.returnTrackingNumber}>
              <td>
                <Link href={`/package-review?tracking=${encodeURIComponent(pkg.returnTrackingNumber)}`}>
                  <a className="tracking-link">{pkg.returnTrackingNumber}</a>
                </Link>
              </td>
              <td>{pkg.carrier}</td>
              <td>{pkg.totalUnits}</td>
              <td>${pkg.totalRefundUsd.toFixed(2)}</td>
              <td>
                <StatusBadge status={pkg.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </AppLayout>
  );
}
