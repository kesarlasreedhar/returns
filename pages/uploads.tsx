import { ChangeEvent, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { AppLayout } from "@/components/AppLayout";
import { parseReturnsWorkbook } from "@/lib/csv";
import { getCurrentUser, logout } from "@/lib/auth";
import { getPackageItems, getPackages, getUploadBatches, importReturnsWorkbook } from "@/lib/storage";
import { AppUser } from "@/types/domain";

type UploadStats = {
  uploadedRows: number;
  processedPackages: number;
  processedItems: number;
};

export default function UploadsPage(): JSX.Element | null {
  const router = useRouter();
  const [user, setUser] = useState<AppUser | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [stats, setStats] = useState<UploadStats>({
    uploadedRows: 0,
    processedPackages: 0,
    processedItems: 0
  });

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

  const [batches, setBatches] = useState<ReturnType<typeof getUploadBatches> extends Promise<infer T> ? T : never>([]);

  useEffect(() => {
    async function loadData(): Promise<void> {
      const [recent, pkgs, items] = await Promise.all([getUploadBatches(), getPackages(), getPackageItems()]);
      setBatches(recent);
      setStats({
        uploadedRows: recent.reduce((sum, batch) => sum + batch.rowCount, 0),
        processedPackages: pkgs.filter((pkg) => pkg.status === "ready_for_refund" || pkg.status === "review_for_refund").length,
        processedItems: items.filter((item) => Boolean(item.actualCondition)).length
      });
    }
    void loadData();
  }, [refreshKey]);

  function onFileChange(event: ChangeEvent<HTMLInputElement>): void {
    setSelectedFile(event.target.files?.[0] ?? null);
  }

  async function handleUpload(): Promise<void> {
    if (!selectedFile || !user) {
      setError("Choose the Returns Operations Excel workbook.");
      return;
    }

    setError("");
    setMessage("");

    try {
      const workbook = await parseReturnsWorkbook(selectedFile);
      await importReturnsWorkbook(workbook, user.email, selectedFile.name);
      setMessage(`Workbook uploaded successfully: ${workbook.catalog.length} catalog products, ${workbook.packages.length} packages, and ${workbook.packageItems.length} package items.`);
      setSelectedFile(null);
      setRefreshKey((v) => v + 1);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed");
    }
  }

  if (!user) {
    return null;
  }

  return (
    <AppLayout
      title="Seller Upload"
      user={user}
      onLogout={() => {
        logout();
        router.push("/login");
      }}
    >
      <section className="panel-grid single-column">
        <article className="panel">
          <h2>Returns Operations Workbook</h2>
          <p>Upload one Excel workbook with sheets in this order: Catalog, Packages, Package Items.</p>

          <label htmlFor="uploadFile">Excel Workbook</label>
          <input id="uploadFile" type="file" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onChange={onFileChange} />

          <div className="action-row">
            <button className="btn-primary" type="button" onClick={() => void handleUpload()}>
              Upload
            </button>
          </div>
        </article>
      </section>

      <section className="stats-grid compact-gap">
        <article className="stat-card">
          <p>Uploaded Rows</p>
          <strong>{stats.uploadedRows}</strong>
        </article>
        <article className="stat-card">
          <p>Refund-Ready Packages</p>
          <strong>{stats.processedPackages}</strong>
        </article>
        <article className="stat-card">
          <p>Processed Items</p>
          <strong>{stats.processedItems}</strong>
        </article>
      </section>

      {message ? <p className="ok-text">{message}</p> : null}
      {error ? <pre className="error-box">{error}</pre> : null}

      <h2>Recent Uploads</h2>
      <table className="table">
        <thead>
          <tr>
            <th>Type</th>
            <th>File</th>
            <th>Rows</th>
            <th>Status</th>
            <th>User</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          {batches.map((batch) => (
            <tr key={batch.id}>
              <td>{batch.kind}</td>
              <td>{batch.fileName}</td>
              <td>{batch.rowCount}</td>
              <td>Uploaded</td>
              <td>{batch.uploadedBy}</td>
              <td>{new Date(batch.uploadedAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </AppLayout>
  );
}
