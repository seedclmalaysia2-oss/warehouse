"use client";
import { usePathname } from "next/navigation";
import { PAGES } from "@/lib/pages";

const SETTINGS = [
  { href: "/email-settings", short: "Email settings" },
  { href: "/email-settings/server", short: "Sending server", sub: true },
];

export function SideNav() {
  const path = usePathname();
  const link = (p: { href: string; short: string; sub?: boolean }) => {
    // Settings links match exactly, so the parent and its sub-page never light up together.
    const exact = p.href === "/" || p.href.startsWith("/email-settings");
    const active = exact ? path === p.href : path.startsWith(p.href);
    return (
      <a key={p.href} href={p.href} className={[active && "active", p.sub && "sub"].filter(Boolean).join(" ") || undefined}
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
