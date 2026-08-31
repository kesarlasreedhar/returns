import { ChangeEvent, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { AppLayout } from "@/components/AppLayout";
import { parseCsv, mapCatalog, mapPackageItems, mapPackages } from "@/lib/csv";
import { getCurrentUser, logout } from "@/lib/auth";
import { getPackageItems, getPackages, getUploadBatches, replacePackageItems, replacePackages, upsertCatalogRows } from "@/lib/storage";
import { AppUser } from "@/types/domain";

type UploadKind = "" | "catalog" | "packages" | "package_items";

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
  const [uploadKind, setUploadKind] = useState<UploadKind>("");
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
        processedPackages: pkgs.filter((pkg) => pkg.status === "processed").length,
        processedItems: items.filter((item) => Boolean(item.actualCondition)).length
      });
    }
    void loadData();
  }, [refreshKey]);

  function onFileChange(event: ChangeEvent<HTMLInputElement>): void {
    setSelectedFile(event.target.files?.[0] ?? null);
  }

  async function handleUpload(): Promise<void> {
    if (!selectedFile || !user || !uploadKind) {
      setError("Select upload type and choose a CSV file.");
      return;
    }

    setError("");
    setMessage("");

    try {
      const rows = await parseCsv(selectedFile);
      if (uploadKind === "catalog") {
        await upsertCatalogRows(mapCatalog(rows), user.email, selectedFile.name);
      }
      if (uploadKind === "packages") {
        await replacePackages(mapPackages(rows), user.email, selectedFile.name);
      }
      if (uploadKind === "package_items") {
        await replacePackageItems(mapPackageItems(rows), user.email, selectedFile.name);
      }
      setMessage(`${uploadKind} uploaded successfully.`);
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
          <h2>Upload Section</h2>
          <p>Select upload type, pick a CSV file, and submit.</p>

          <label htmlFor="uploadKind">Upload Type</label>
          <select id="uploadKind" value={uploadKind} onChange={(event) => setUploadKind(event.target.value as UploadKind)}>
            <option value="">-- Select Upload Type --</option>
            <option value="packages">Package Upload</option>
            <option value="package_items">Package Item Upload</option>
            <option value="catalog">Catalog Upload</option>
          </select>

          <label htmlFor="uploadFile">CSV File</label>
          <input id="uploadFile" type="file" accept=".csv,text/csv" onChange={onFileChange} />

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
          <p>Processed Packages</p>
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
