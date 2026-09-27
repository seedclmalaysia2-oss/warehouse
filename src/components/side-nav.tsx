"use client";
import { usePathname } from "next/navigation";
import { PAGES } from "@/lib/pages";

export function SideNav() {
  const path = usePathname();
  const items = [{ href: "/", short: "Overview" }, ...PAGES];
  return (
    <nav className="nav" aria-label="Warehouse pages">
      {items.map(p => {
        const active = p.href === "/" ? path === "/" : path.startsWith(p.href);
        return (
          <a key={p.href} href={p.href} className={active ? "active" : undefined}
             aria-current={active ? "page" : undefined}>
            {p.short}
          </a>
        );
      })}
    </nav>
  );
}
