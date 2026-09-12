import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { AppLayout } from "@/components/AppLayout";
import { StatusBadge } from "@/components/StatusBadge";
import { getCurrentUser, logout } from "@/lib/auth";
import { getInspectionPhotos, getPackageItems, getPackages, updatePackageStatus } from "@/lib/storage";
import { AppUser, InspectionPhoto, PackageItem, PackageSummary } from "@/types/domain";

export default function PackageReviewPage(): JSX.Element | null {
  const router = useRouter();
  const [user, setUser] = useState<AppUser | null>(null);
  const [pkg, setPkg] = useState<PackageSummary | null>(null);
  const [items, setItems] = useState<PackageItem[]>([]);
  const [photosByItemId, setPhotosByItemId] = useState<Record<string, InspectionPhoto>>({});
  const [selectedImage, setSelectedImage] = useState("");
  const [detailsItem, setDetailsItem] = useState<PackageItem | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const tracking = useMemo(() => {
    const value = router.query.tracking;
    return (Array.isArray(value) ? value[0] : value) || "";
  }, [router.query.tracking]);

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
  }, [router]);

  useEffect(() => {
    if (!user || !tracking) {
      return;
    }
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, tracking]);

  async function loadData(): Promise<void> {
    setError("");
    const [packages, packageItems, photos] = await Promise.all([getPackages(), getPackageItems(), getInspectionPhotos()]);
    const foundPackage = packages.find((candidate) => candidate.returnTrackingNumber === tracking) || null;
    if (!foundPackage) {
      setError(`No package found for tracking number ${tracking}.`);
      setPkg(null);
      return;
    }
    setPkg(foundPackage);
    setItems(packageItems.filter((item) => item.returnTrackingNumber === tracking));
    setPhotosByItemId(
      photos.reduce<Record<string, InspectionPhoto>>((result, photo) => {
        if (!result[photo.packageItemId]) result[photo.packageItemId] = photo;
        return result;
      }, {})
    );
  }

  async function advanceStatus(nextStatus: "ready_for_refund" | "closed"): Promise<void> {
    if (!pkg) return;
    setIsUpdating(true);
    setError("");
    setNotice("");
    try {
      await updatePackageStatus(pkg.returnTrackingNumber, nextStatus);
      await loadData();
      setNotice(nextStatus === "ready_for_refund" ? "Marked ready for refund." : "Package closed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status.");
    } finally {
      setIsUpdating(false);
    }
  }

  if (!user) {
    return null;
  }

  return (
    <AppLayout
      title="Package Review"
      user={user}
      onLogout={() => {
        logout();
        router.push("/login");
      }}
    >
      <p>
        <Link href="/reports">
          <a className="tracking-link">&larr; Back to Reports</a>
        </Link>
      </p>

      {error ? <p className="mobile-error">{error}</p> : null}
      {notice ? <p className="mobile-notice">{notice}</p> : null}

      {pkg ? (
        <>
          <div className="stats-grid">
            <article className="stat-card">
              <p>Tracking #</p>
              <strong>{pkg.returnTrackingNumber}</strong>
            </article>
            <article className="stat-card">
              <p>Carrier</p>
              <strong>{pkg.carrier}</strong>
            </article>
            <article className="stat-card">
              <p>Total Units</p>
              <strong>{pkg.totalUnits}</strong>
            </article>
            <article className="stat-card">
              <p>Total Refund</p>
              <strong>${pkg.totalRefundUsd.toFixed(2)}</strong>
            </article>
          </div>

          <section className="panel">
            <h2>
              Status: <StatusBadge status={pkg.status} />
            </h2>
            {pkg.status === "review_for_refund" ? (
              <>
                <p className="hint-text">Some items don&apos;t match the expected condition. Review the evidence below, then approve for refund.</p>
                <button className="btn-primary" type="button" disabled={isUpdating} onClick={() => void advanceStatus("ready_for_refund")}>
                  {isUpdating ? "Updating..." : "Mark Ready for Refund"}
                </button>
              </>
            ) : null}
            {pkg.status === "ready_for_refund" ? (
              <>
                <p className="hint-text">This package is approved for refund. Close it out once the refund has been issued.</p>
                <button className="btn-primary" type="button" disabled={isUpdating} onClick={() => void advanceStatus("closed")}>
                  {isUpdating ? "Updating..." : "Close Package"}
                </button>
              </>
            ) : null}
            {pkg.status === "closed" ? <p className="hint-text">This package has been closed.</p> : null}
            {pkg.status === "open" || pkg.status === "scanned" ? (
              <p className="hint-text">This package is still being processed. Check back once inspection is complete.</p>
            ) : null}
          </section>

          <h2>Item Condition Details</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Barcode</th>
                <th>Title</th>
                <th>Expected</th>
                <th>Actual</th>
                <th>Reason</th>
                <th>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const photo = item.id ? photosByItemId[item.id] : undefined;
                return (
                  <tr key={`${item.barcode}_${item.orderReference}`}>
                    <td>
                      <button className="tracking-link link-button" type="button" onClick={() => setDetailsItem(item)}>
                        {item.barcode}
                      </button>
                    </td>
                    <td>{item.title}</td>
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
        </>
      ) : !error ? (
        <p className="hint-text">Loading package...</p>
      ) : null}

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

      {detailsItem ? (
        <div className="modal-overlay" onClick={() => setDetailsItem(null)}>
          <div className="modal-card" role="dialog" aria-modal="true" aria-label="Item details" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <h3>Item Details</h3>
              <button className="btn-secondary" type="button" onClick={() => setDetailsItem(null)}>
                Close
              </button>
            </div>

            <dl className="detail-list">
              <dt>Barcode</dt>
              <dd>{detailsItem.barcode}</dd>
              <dt>Title</dt>
              <dd>{detailsItem.title}</dd>
              <dt>Expected</dt>
              <dd>{detailsItem.expectedCondition}</dd>
              <dt>Actual</dt>
              <dd>{detailsItem.actualCondition || "Pending"}</dd>
              <dt>Reason</dt>
              <dd>{detailsItem.customerReturnReason || "-"}</dd>
            </dl>

            {detailsItem.id && photosByItemId[detailsItem.id] ? (
              <button
                className="btn-secondary"
                type="button"
                onClick={() => setSelectedImage(photosByItemId[detailsItem.id as string].filePath)}
              >
                View Image
              </button>
            ) : (
              <p className="hint-text">No image available</p>
            )}
          </div>
        </div>
      ) : null}
    </AppLayout>
  );
}
