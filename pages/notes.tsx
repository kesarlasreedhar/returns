import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { AppLayout } from "@/components/AppLayout";
import { getCurrentUser, logout } from "@/lib/auth";
import { deleteOperationNote, getOperationNotes, updateOperationNote } from "@/lib/storage";
import { AppUser, OperationNote } from "@/types/domain";

export default function NotesPage(): JSX.Element | null {
  const router = useRouter();
  const [user, setUser] = useState<AppUser | null>(null);
  const [notes, setNotes] = useState<OperationNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const current = getCurrentUser();
    if (!current) {
      router.replace("/login");
      return;
    }

    setUser(current);
    getOperationNotes().then((rows) => {
      setNotes(rows);
      setIsLoading(false);
    });
  }, [router]);

  function startEditing(entry: OperationNote): void {
    setError("");
    setEditingId(entry.id);
    setEditingText(entry.note);
  }

  function cancelEditing(): void {
    setEditingId(null);
    setEditingText("");
  }

  async function saveEditing(id: string): Promise<void> {
    setError("");
    try {
      await updateOperationNote(id, editingText);
      const updated = await getOperationNotes();
      setNotes(updated);
      setEditingId(null);
      setEditingText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update note.");
    }
  }

  async function removeNote(id: string): Promise<void> {
    setError("");
    try {
      await deleteOperationNote(id);
      const updated = await getOperationNotes();
      setNotes(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete note.");
    }
  }

  if (!user) {
    return null;
  }

  return (
    <AppLayout
      title="Notes"
      user={user}
      onLogout={() => {
        logout();
        router.push("/login");
      }}
    >
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Operation Notes</h2>
            <p className="hint-text">Notes added by all Returns Operations users.</p>
          </div>
        </div>

        {error ? <p className="hint-text">{error}</p> : null}
        {isLoading ? <p className="hint-text">Loading notes...</p> : null}
        {!isLoading && notes.length === 0 ? <p className="hint-text">No notes have been added yet.</p> : null}
        <div className="notes-list">
          {notes.map((entry) => (
            <article className="operation-note" key={entry.id}>
              {editingId === entry.id ? (
                <>
                  <textarea
                    value={editingText}
                    onChange={(event) => setEditingText(event.target.value)}
                    rows={3}
                  />
                  <div className="note-actions">
                    <button className="btn-secondary" type="button" onClick={() => saveEditing(entry.id)}>
                      Save
                    </button>
                    <button className="btn-secondary" type="button" onClick={cancelEditing}>
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p>{entry.note}</p>
                  <small>{entry.createdBy} | {new Date(entry.createdAt).toLocaleString()}</small>
                  <div className="note-actions">
                    <button className="btn-secondary" type="button" onClick={() => startEditing(entry)}>
                      Edit
                    </button>
                    <button className="btn-secondary" type="button" onClick={() => removeNote(entry.id)}>
                      Delete
                    </button>
                  </div>
                </>
              )}
            </article>
          ))}
        </div>
      </section>
    </AppLayout>
  );
}
