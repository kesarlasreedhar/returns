import Link from "next/link";
import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { AppRole, AppUser } from "@/types/domain";

type Props = {
  title: string;
  user: AppUser;
  onLogout: () => void;
  children: ReactNode;
};

type MenuIcon = "dashboard" | "upload" | "catalog" | "processing" | "scanner" | "reports" | "reboxing" | "timesheet" | "users";

type MenuItem = {
  href: string;
  label: string;
  icon: MenuIcon;
};

const menuByRole: Record<AppRole, MenuItem[]> = {
  admin: [
    { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
    { href: "/uploads", label: "Seller Upload", icon: "upload" },
    { href: "/catalog", label: "Catalog Data", icon: "catalog" },
    { href: "/processing", label: "Processing", icon: "processing" },
    { href: "/scanner", label: "Scanner", icon: "scanner" },
    { href: "/reboxing", label: "Reboxing", icon: "reboxing" },
    { href: "/timesheet", label: "Timesheet", icon: "timesheet" },
    { href: "/reports", label: "Reports", icon: "reports" },
    { href: "/users", label: "Users", icon: "users" }
  ],
  seller: [
    { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
    { href: "/uploads", label: "Seller Upload", icon: "upload" },
    { href: "/catalog", label: "Catalog Data", icon: "catalog" },
    { href: "/reports", label: "Reports", icon: "reports" }
  ],
  processor: [
    { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
    { href: "/catalog", label: "Catalog Data", icon: "catalog" },
    { href: "/processing", label: "Processing", icon: "processing" },
    { href: "/scanner", label: "Scanner", icon: "scanner" },
    { href: "/reboxing", label: "Reboxing", icon: "reboxing" },
    { href: "/timesheet", label: "Timesheet", icon: "timesheet" }
  ]
};

function NavIcon({ name }: { name: MenuIcon }): JSX.Element {
  const iconByName: Record<MenuIcon, JSX.Element> = {
    dashboard: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 4h7v7H4V4zm9 0h7v4h-7V4zM4 13h4v7H4v-7zm6 3h10v4H10v-4zm3-6h7v4h-7v-4z" fill="currentColor" />
      </svg>
    ),
    upload: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3l4 4h-3v7h-2V7H8l4-4zm-7 13h14v5H5v-5z" fill="currentColor" />
      </svg>
    ),
    catalog: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 4h14v16H5V4zm2 2v3h10V6H7zm0 5v7h3v-7H7zm5 0v2h5v-2h-5zm0 4v3h5v-3h-5z" fill="currentColor" />
      </svg>
    ),
    processing: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 4a8 8 0 018 8h-3l4 4 4-4h-3A10 10 0 1012 22v-2a8 8 0 010-16z" fill="currentColor" />
      </svg>
    ),
    scanner: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 4h5v2H6v3H4V4zm10 0h6v5h-2V6h-4V4zM4 14h2v4h3v2H4v-6zm14 4v-4h2v6h-6v-2h4zM7 11h10v2H7v-2z" fill="currentColor" />
      </svg>
    ),
    reports: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 3h14v18H5V3zm3 12h2v3H8v-3zm3-4h2v7h-2v-7zm3-3h2v10h-2V8z" fill="currentColor" />
      </svg>
    ),
    reboxing: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 7l9-4 9 4-9 4-9-4zm2 3.5l7 3v7l-7-3v-7zm9 10v-7l7-3v7l-7 3z" fill="currentColor" />
      </svg>
    ),
    timesheet: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 2h2v2h6V2h2v2h3v18H4V4h3V2zm11 6H6v12h12V8zm-6 2h2v5h-2v-5zm-3 3h8v2H9v-2z" fill="currentColor" />
      </svg>
    ),
    users: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 4a4 4 0 100 8 4 4 0 000-8zm0 10c-4 0-7 2-7 4.5V20h14v-1.5C16 16 13 14 9 14zm8-9a3.5 3.5 0 100 7 3.5 3.5 0 000-7zm0 9c-.6 0-1.2.06-1.8.17 1.7 1 2.8 2.6 2.8 4.83V20h5v-1.5c0-2.5-2.7-4.5-6-4.5z" fill="currentColor" />
      </svg>
    )
  };

  return iconByName[name];
}

export function AppLayout({ title, user, onLogout, children }: Props): JSX.Element {
  const router = useRouter();
  const menuItems = menuByRole[user.role];
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("returns_sidebar_collapsed");
    if (stored === "1") {
      setSidebarCollapsed(true);
    }
  }, []);

  function toggleSidebar(): void {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem("returns_sidebar_collapsed", next ? "1" : "0");
      return next;
    });
  }

  return (
    <div className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-head">
            <h2>{sidebarCollapsed ? "NE" : "Neeros"}</h2>
            <button className="sidebar-toggle" type="button" onClick={toggleSidebar} aria-label="Toggle sidebar">
              {sidebarCollapsed ? ">" : "<"}
            </button>
          </div>
        </div>

        <nav className="side-nav" aria-label="Main navigation">
          {menuItems.map((item) => {
            const active = router.pathname === item.href;
            return (
              <Link key={item.href} href={item.href}>
                <a className={`side-link ${active ? "active" : ""}`}>
                  <span className="side-link-icon" aria-hidden="true">
                    <NavIcon name={item.icon} />
                  </span>
                  <span className="side-link-label">{item.label}</span>
                  <span className="side-link-tooltip" role="tooltip">
                    {item.label}
                  </span>
                </a>
              </Link>
            );
          })}
        </nav>
      </aside>

      <section className="layout-main">
        <header className="topbar">
          <div>
            <h1>{title}</h1>
            <p>
              Logged in as {user.name} ({user.role})
            </p>
          </div>
          <button onClick={onLogout} className="btn-secondary" type="button">
            Logout
          </button>
        </header>

        <main className="content-card">{children}</main>
      </section>
    </div>
  );
}
