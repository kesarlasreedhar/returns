import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { AppLayout } from "@/components/AppLayout";
import { getCurrentUser, logout } from "@/lib/auth";
import { getCatalog, upsertCatalogRows } from "@/lib/storage";
import { AppUser, CatalogProduct } from "@/types/domain";

const EMPTY_FORM: CatalogProduct = {
  barcode: "",
  artist: "",
  title: "",
  format: "",
  mediaType: "",
  imageUrl: ""
};

export default function CatalogPage(): JSX.Element | null {
  const router = useRouter();
  const [user, setUser] = useState<AppUser | null>(null);
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<CatalogProduct>(EMPTY_FORM);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const current = getCurrentUser();
    if (!current) {
      router.replace("/login");
      return;
    }
    setUser(current);
    getCatalog().then(setCatalog);
  }, [router]);

  const filteredCatalog = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return catalog;
    }
    return catalog.filter((row) => {
      return (
        row.barcode.toLowerCase().includes(q) ||
        row.artist.toLowerCase().includes(q) ||
        row.title.toLowerCase().includes(q) ||
        row.format.toLowerCase().includes(q) ||
        row.mediaType.toLowerCase().includes(q)
      );
    });
  }, [catalog, query]);

  async function onAddCatalogItem(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!user) {
      return;
    }

    const payload: CatalogProduct = {
      barcode: form.barcode.trim(),
      artist: form.artist.trim(),
      title: form.title.trim(),
      format: form.format.trim(),
      mediaType: form.mediaType.trim(),
      imageUrl: form.imageUrl.trim()
    };

    if (!payload.barcode) {
      setError("Barcode is required.");
      setMessage("");
      return;
    }

    try {
      setError("");
      setMessage("");
      await upsertCatalogRows([payload], user.email, "manual-catalog-entry");
      const updated = await getCatalog();
      setCatalog(updated);
      setForm(EMPTY_FORM);
      setAddModalOpen(false);
      setMessage("Catalog item added.");
    } catch (catalogError) {
      setError(catalogError instanceof Error ? catalogError.message : "Unable to add catalog item");
    }
  }

  function openAddModal(): void {
    setForm(EMPTY_FORM);
    setError("");
    setMessage("");
    setAddModalOpen(true);
  }

  function closeAddModal(): void {
    setAddModalOpen(false);
  }

  if (!user) {
    return null;
  }

  return (
    <AppLayout
      title="Catalog Uploaded Data"
      user={user}
      onLogout={() => {
        logout();
        router.push("/login");
      }}
    >
      <section className="panel-grid single-column">
        <article className="panel">
          <h2>Search Catalog</h2>
          <label htmlFor="searchCatalog">Search by barcode, artist, or title</label>
          <input
            id="searchCatalog"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search catalog"
          />
          <p className="hint-text">Showing {filteredCatalog.length} items</p>
        </article>
      </section>

      {message ? <p className="ok-text">{message}</p> : null}
      {error ? <p className="error-text">{error}</p> : null}

      <div className="catalog-grid-head">
        <h2>Catalog Uploaded</h2>
        <button className="btn-primary" type="button" onClick={openAddModal}>
          Add Catalog Item
        </button>
      </div>

      <table className="table">
        <thead>
          <tr>
            <th>Barcode</th>
            <th>Artist</th>
            <th>Title</th>
            <th>Format</th>
            <th>Media Type</th>
          </tr>
        </thead>
        <tbody>
          {filteredCatalog.map((row) => (
            <tr key={row.id || row.barcode}>
              <td>{row.barcode}</td>
              <td>{row.artist || "-"}</td>
              <td>{row.title || "-"}</td>
              <td>{row.format || "-"}</td>
              <td>{row.mediaType || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {addModalOpen ? (
        <div className="modal-overlay" onClick={closeAddModal}>
          <div className="modal-card" role="dialog" aria-modal="true" aria-label="Add catalog item" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <h3>Add Catalog Item</h3>
              <button className="btn-secondary" type="button" onClick={closeAddModal}>
                Close
              </button>
            </div>

            <form onSubmit={(event) => void onAddCatalogItem(event)}>
              <label htmlFor="barcode">Barcode</label>
              <input
                id="barcode"
                value={form.barcode}
                onChange={(event) => setForm((prev) => ({ ...prev, barcode: event.target.value }))}
                placeholder="EAN/UPC"
              />

              <label htmlFor="artist">Artist</label>
              <input
                id="artist"
                value={form.artist}
                onChange={(event) => setForm((prev) => ({ ...prev, artist: event.target.value }))}
              />

              <label htmlFor="title">Title</label>
              <input
                id="title"
                value={form.title}
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              />

              <label htmlFor="format">Format</label>
              <input
                id="format"
                value={form.format}
                onChange={(event) => setForm((prev) => ({ ...prev, format: event.target.value }))}
              />

              <label htmlFor="mediaType">Media Type</label>
              <input
                id="mediaType"
                value={form.mediaType}
                onChange={(event) => setForm((prev) => ({ ...prev, mediaType: event.target.value }))}
              />

              <label htmlFor="imageUrl">Image URL</label>
              <input
                id="imageUrl"
                value={form.imageUrl}
                onChange={(event) => setForm((prev) => ({ ...prev, imageUrl: event.target.value }))}
              />

              <div className="action-row">
                <button className="btn-primary" type="submit">
                  Save Item
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </AppLayout>
  );
}
