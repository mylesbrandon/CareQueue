"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "Adult Ops" },
  { href: "/specialty", label: "Ped / Newborn / NICU Ops" },
  { href: "/teams", label: "Teams & Nurses" },
  { href: "/runs", label: "Assignment Runs" },
  { href: "/metrics", label: "Metrics / Trends" },
  { href: "/settings", label: "Settings" }
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="app-sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-brand-mark">CQ</div>
        <div>
          <div className="sidebar-brand-name">CareQueue</div>
          <div className="sidebar-brand-date">Assignment operations</div>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="Primary">
        {NAV_ITEMS.map((item) => {
          const isActive = item.href === "/"
            ? pathname === "/"
            : pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-link${isActive ? " active" : ""}`}
              aria-current={isActive ? "page" : undefined}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
