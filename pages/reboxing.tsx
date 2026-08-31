import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { AppLayout } from "@/components/AppLayout";
import { getCurrentUser, logout } from "@/lib/auth";
import { getReboxingEvents, saveReboxingEvent } from "@/lib/storage";
import { AppUser, ReboxingEvent } from "@/types/domain";

export default function ReboxingPage(): JSX.Element | null {
  const router = useRouter();
  const [user, setUser] = useState<AppUser | null>(null);
  const [returnTrackingNumber, setReturnTrackingNumber] = useState("");
  const [outboundBoxBarcode, setOutboundBoxBarcode] = useState("");
  const [outboundShippingBarcode, setOutboundShippingBarcode] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [events, setEvents] = useState<ReboxingEvent[]>([]);

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
    getReboxingEvents().then(setEvents);
  }, [router]);

  async function onSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!user) {
      return;
    }
    setMessage("");
    setError("");

    try {
      await saveReboxingEvent(returnTrackingNumber, outboundBoxBarcode, outboundShippingBarcode, user.email);
      setMessage("Reboxing event saved.");
      setReturnTrackingNumber("");
      setOutboundBoxBarcode("");
      setOutboundShippingBarcode("");
      const latest = await getReboxingEvents();
      setEvents(latest);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to save reboxing event");
    }
  }

  if (!user) {
    return null;
  }

  return (
    <AppLayout
      title="Reboxing"
      user={user}
      onLogout={() => {
        logout();
        router.push("/login");
      }}
    >
      <section className="panel-grid two-column">
        <article className="panel">
          <h2>Re-scan Processed Package</h2>
          <p className="hint-text">After two weeks, scan processed package and assign it to a new big box shipment.</p>
          <form onSubmit={(event) => void onSubmit(event)}>
            <label htmlFor="returnTrackingNumber">Processed Package Tracking</label>
            <input
              id="returnTrackingNumber"
              value={returnTrackingNumber}
              onChange={(event) => setReturnTrackingNumber(event.target.value)}
              placeholder="Scan return tracking number"
            />

            <label htmlFor="outboundBoxBarcode">Big Box Barcode</label>
            <input
              id="outboundBoxBarcode"
              value={outboundBoxBarcode}
              onChange={(event) => setOutboundBoxBarcode(event.target.value)}
              placeholder="Scan big box barcode"
            />

            <label htmlFor="outboundShippingBarcode">Outbound Shipping Barcode</label>
            <input
              id="outboundShippingBarcode"
              value={outboundShippingBarcode}
              onChange={(event) => setOutboundShippingBarcode(event.target.value)}
              placeholder="Scan outbound shipping label"
            />

            <button className="btn-primary" type="submit">
              Save Reboxing
            </button>
          </form>
          {message ? <p className="ok-text">{message}</p> : null}
          {error ? <p className="error-text">{error}</p> : null}
        </article>

        <article className="panel">
          <h2>Recent Reboxing</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Return Tracking</th>
                <th>Big Box</th>
                <th>Outbound Barcode</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {events.map((row) => (
                <tr key={row.id}>
                  <td>{row.returnTrackingNumber || "-"}</td>
                  <td>{row.outboundBoxBarcode}</td>
                  <td>{row.outboundShippingBarcode}</td>
                  <td>{new Date(row.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      </section>
    </AppLayout>
  );
}
