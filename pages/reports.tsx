import { useEffect, useMemo, useState } from "react";
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
    received: number;
    inProcessing: number;
    processed: number;
    sentBack: number;
  };
};

export default function ReportsPage(): JSX.Element | null {
  const router = useRouter();
  const [user, setUser] = useState<AppUser | null>(null);
  const [items, setItems] = useState<PackageItem[]>([]);
  const [photosByItemId, setPhotosByItemId] = useState<Record<string, InspectionPhoto>>({});
  const [showOnlyMismatches, setShowOnlyMismatches] = useState(true);
  const [selectedCondition, setSelectedCondition] = useState<"all" | "Damaged" | "Opened" | "New">("all");
  const [selectedImage, setSelectedImage] = useState("");
  const [report, setReport] = useState<ReportData>({
    totalPackages: 0,
    totalItems: 0,
    mismatches: 0,
    damagedObserved: 0,
    byStatus: { received: 0, inProcessing: 0, processed: 0, sentBack: 0 }
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
          received: pkgs.filter((pkg) => pkg.status === "received").length,
          inProcessing: pkgs.filter((pkg) => pkg.status === "in_processing").length,
          processed: pkgs.filter((pkg) => pkg.status === "processed").length,
          sentBack: pkgs.filter((pkg) => pkg.status === "sent_back").length
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

      return Boolean(item.actualCondition);
    });
  }, [items, selectedCondition, showOnlyMismatches]);

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
              <StatusBadge status="received" />
            </td>
            <td>{report.byStatus.received}</td>
          </tr>
          <tr>
            <td>
              <StatusBadge status="in_processing" />
            </td>
            <td>{report.byStatus.inProcessing}</td>
          </tr>
          <tr>
            <td>
              <StatusBadge status="processed" />
            </td>
            <td>{report.byStatus.processed}</td>
          </tr>
          <tr>
            <td>
              <StatusBadge status="sent_back" />
            </td>
            <td>{report.byStatus.sentBack}</td>
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
          <p className="hint-text">Review rows: {filteredItems.length}</p>
        </article>
      </section>

      <h2>Item Condition Details</h2>
      <table className="table">
        <thead>
          <tr>
            <th>Tracking #</th>
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
                <td>{item.returnTrackingNumber}</td>
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
              <td>{pkg.returnTrackingNumber}</td>
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
