"use client";
import { usePathname } from "next/navigation";
import { PAGES } from "@/lib/pages";

const SETTINGS = [{ href: "/email-settings", short: "Email settings" }];

export function SideNav() {
  const path = usePathname();
  const link = (p: { href: string; short: string }) => {
    const active = p.href === "/" ? path === "/" : path.startsWith(p.href);
    return (
      <a key={p.href} href={p.href} className={active ? "active" : undefined}
         aria-current={active ? "page" : undefined}>
        {p.short}
      </a>
    );
  };
  return (
    <nav className="nav" aria-label="Warehouse pages">
      {[{ href: "/", short: "Overview" }, ...PAGES].map(link)}
      <span className="nav-label">Settings</span>
      {SETTINGS.map(link)}
    </nav>
  );
}
