import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { AppLayout } from "@/components/AppLayout";
import { getCurrentUser, logout } from "@/lib/auth";
import { getTimesheetEntries, saveTimesheetEntry } from "@/lib/storage";
import { AppUser, TimesheetEntry } from "@/types/domain";

export default function TimesheetPage(): JSX.Element | null {
  const router = useRouter();
  const [user, setUser] = useState<AppUser | null>(null);
  const [processorName, setProcessorName] = useState("");
  const [workDate, setWorkDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [hoursWorked, setHoursWorked] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [entries, setEntries] = useState<TimesheetEntry[]>([]);

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
    setProcessorName(current.name);
    getTimesheetEntries().then(setEntries);
  }, [router]);

  async function onSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const hours = Number(hoursWorked);
    if (!processorName.trim() || !workDate || Number.isNaN(hours)) {
      setError("Name, date, and hours are required.");
      setMessage("");
      return;
    }

    try {
      setError("");
      setMessage("");
      await saveTimesheetEntry(processorName.trim(), workDate, hours, notes.trim());
      setMessage("Timesheet entry saved.");
      setHoursWorked("");
      setNotes("");
      const latest = await getTimesheetEntries();
      setEntries(latest);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to save timesheet entry");
    }
  }

  if (!user) {
    return null;
  }

  return (
    <AppLayout
      title="Timesheet"
      user={user}
      onLogout={() => {
        logout();
        router.push("/login");
      }}
    >
      <section className="panel-grid two-column">
        <article className="panel">
          <h2>Work Log</h2>
          <form onSubmit={(event) => void onSubmit(event)}>
            <label htmlFor="processorName">Name of Processor</label>
            <input id="processorName" value={processorName} onChange={(event) => setProcessorName(event.target.value)} />

            <label htmlFor="workDate">Date</label>
            <input id="workDate" type="date" value={workDate} onChange={(event) => setWorkDate(event.target.value)} />

            <label htmlFor="hoursWorked">Hours</label>
            <input id="hoursWorked" type="number" step="0.25" min="0" value={hoursWorked} onChange={(event) => setHoursWorked(event.target.value)} />

            <label htmlFor="notes">Work Notes</label>
            <input id="notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="What work was done" />

            <button className="btn-primary" type="submit">
              Save Timesheet
            </button>
          </form>
          {message ? <p className="ok-text">{message}</p> : null}
          {error ? <p className="error-text">{error}</p> : null}
        </article>

        <article className="panel">
          <h2>Recent Timesheet Entries</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Date</th>
                <th>Hours</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((row) => (
                <tr key={row.id}>
                  <td>{row.processorName}</td>
                  <td>{row.workDate}</td>
                  <td>{row.hoursWorked.toFixed(2)}</td>
                  <td>{row.notes || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      </section>
    </AppLayout>
  );
}
