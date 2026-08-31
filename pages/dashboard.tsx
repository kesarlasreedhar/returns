import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { AppLayout } from "@/components/AppLayout";
import { StatCard } from "@/components/StatCard";
import { getCurrentUser, logout } from "@/lib/auth";
import { getPackageItems, getPackages } from "@/lib/storage";
import { AppUser } from "@/types/domain";

type Stats = {
  totalReceived: number;
  processing: number;
  processed: number;
  sentBack: number;
  mismatches: number;
};

export default function DashboardPage(): JSX.Element | null {
  const router = useRouter();
  const [user, setUser] = useState<AppUser | null>(null);
  const [stats, setStats] = useState<Stats>({
    totalReceived: 0,
    processing: 0,
    processed: 0,
    sentBack: 0,
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
        totalReceived: packages.filter((pkg) => pkg.status === "received").length,
        processing: packages.filter((pkg) => pkg.status === "in_processing").length,
        processed: packages.filter((pkg) => pkg.status === "processed").length,
        sentBack: packages.filter((pkg) => pkg.status === "sent_back").length,
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
        <StatCard label="Received" value={stats.totalReceived} />
        <StatCard label="In Processing" value={stats.processing} />
        <StatCard label="Processed" value={stats.processed} />
        <StatCard label="Sent Back" value={stats.sentBack} />
        <StatCard label="Condition Mismatch" value={stats.mismatches} />
      </div>
      <p className="hint-text">Use Seller Upload to import catalog/packages, then Processing and Scanner to update inspections.</p>
    </AppLayout>
  );
}
