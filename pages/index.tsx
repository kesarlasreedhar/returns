import { useEffect } from "react";
import { useRouter } from "next/router";

export default function Home(): JSX.Element {
  const router = useRouter();

  useEffect(() => {
    router.replace("/login");
  }, [router]);

  return (
    <main className="route-loading-shell">
      <p>Opening sign in...</p>
    </main>
  );
}
