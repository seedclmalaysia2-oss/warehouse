"use client";
import { usePathname } from "next/navigation";
import { PAGES } from "@/lib/pages";

const SETTINGS = [
  { href: "/email-settings", short: "Email settings" },
  { href: "/email-settings/server", short: "Sending server", sub: true },
];

export function SideNav({ exchangeOverdue = 0 }: { exchangeOverdue?: number }) {
  const path = usePathname();
  const link = (p: { href: string; short: string; sub?: boolean }) => {
    // Settings links match exactly, so the parent and its sub-page never light up together.
    const exact = p.href === "/" || p.href.startsWith("/email-settings");
    const active = exact ? path === p.href : path.startsWith(p.href);
    return (
      <a key={p.href} href={p.href} className={[active && "active", p.sub && "sub"].filter(Boolean).join(" ") || undefined}
         aria-current={active ? "page" : undefined}>
        {p.short}
        {p.href === "/exchange-stock" && exchangeOverdue > 0 && (
          <span className="ml-2 rounded-full bg-danger px-1.5 py-0.5 text-[0.6875rem] font-bold leading-none text-white"
                title={`${exchangeOverdue} exchange item(s) not returned within 7 days`}>
            {exchangeOverdue}
          </span>
        )}
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
