import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { AppLayout } from "@/components/AppLayout";
import { StatCard } from "@/components/StatCard";
import { getCurrentUser, logout } from "@/lib/auth";
import { getPackageItems, getPackages } from "@/lib/storage";
import { AppUser } from "@/types/domain";

type Stats = {
  open: number;
  scanned: number;
  readyForRefund: number;
  reviewForRefund: number;
  closed: number;
  mismatches: number;
};

export default function DashboardPage(): JSX.Element | null {
  const router = useRouter();
  const [user, setUser] = useState<AppUser | null>(null);
  const [stats, setStats] = useState<Stats>({
    open: 0,
    scanned: 0,
    readyForRefund: 0,
    reviewForRefund: 0,
    closed: 0,
    mismatches: 0
  });

  useEffect(() => {
    const current = getCurrentUser();
    if (!current) {
      router.replace("/login");
      return;
    }
    setUser(current);

    async function loadStats(): Promise<void> {
      const packages = await getPackages();
      const items = await getPackageItems();
      setStats({
        open: packages.filter((pkg) => pkg.status === "open").length,
        scanned: packages.filter((pkg) => pkg.status === "scanned").length,
        readyForRefund: packages.filter((pkg) => pkg.status === "ready_for_refund").length,
        reviewForRefund: packages.filter((pkg) => pkg.status === "review_for_refund").length,
        closed: packages.filter((pkg) => pkg.status === "closed").length,
        mismatches: items.filter((item) => item.actualCondition && item.actualCondition !== item.expectedCondition).length
      });
    }
    void loadStats();
  }, [router]);

  if (!user) {
    return null;
  }

  return (
    <AppLayout
      title="Operations Dashboard"
      user={user}
      onLogout={() => {
        logout();
        router.push("/login");
      }}
    >
      <div className="stats-grid">
        <StatCard label="Open" value={stats.open} />
        <StatCard label="Scanned" value={stats.scanned} />
        <StatCard label="Ready for Refund" value={stats.readyForRefund} />
        <StatCard label="Review for Refund" value={stats.reviewForRefund} />
        <StatCard label="Closed" value={stats.closed} />
        <StatCard label="Condition Mismatch" value={stats.mismatches} />
      </div>
      {user.role === "admin" || user.role === "processor" ? (
        <section className="mobile-app-launcher">
          <div className="mobile-app-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M7 2h10a2 2 0 012 2v16a2 2 0 01-2 2H7a2 2 0 01-2-2V4a2 2 0 012-2zm0 3v13h10V5H7zm4 15h2v1h-2v-1zm-2-11h6v2H9V9zm0 4h6v2H9v-2z" fill="currentColor" />
            </svg>
          </div>
          <div>
            <h2>Mobile Scanner App</h2>
            <p>Open the phone-first return inspection workflow.</p>
          </div>
          <button className="btn-primary" type="button" onClick={() => router.push("/mobile-scanner")}>
            Open App
          </button>
        </section>
      ) : null}
      <p className="hint-text">Use Seller Upload to import catalog/packages, then Processing and Scanner to update inspections.</p>
    </AppLayout>
  );
}
