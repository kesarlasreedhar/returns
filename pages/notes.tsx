import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { AppLayout } from "@/components/AppLayout";
import { getCurrentUser, logout } from "@/lib/auth";
import { getOperationNotes } from "@/lib/storage";
import { AppUser, OperationNote } from "@/types/domain";

export default function NotesPage(): JSX.Element | null {
  const router = useRouter();
  const [user, setUser] = useState<AppUser | null>(null);
  const [notes, setNotes] = useState<OperationNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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

        {isLoading ? <p className="hint-text">Loading notes...</p> : null}
        {!isLoading && notes.length === 0 ? <p className="hint-text">No notes have been added yet.</p> : null}
        <div className="notes-list">
          {notes.map((entry) => (
            <article className="operation-note" key={entry.id}>
              <p>{entry.note}</p>
              <small>{entry.createdBy} | {new Date(entry.createdAt).toLocaleString()}</small>
            </article>
          ))}
        </div>
      </section>
    </AppLayout>
  );
}
