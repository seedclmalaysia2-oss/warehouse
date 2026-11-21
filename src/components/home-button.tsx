"use client";
import { usePathname } from "next/navigation";

/** Back to the Overview, where every page sits as a tile. Marked current on the Overview itself. */
export function HomeButton() {
  const here = usePathname() === "/";
  return (
    <a className="home-btn" href="/" aria-current={here ? "page" : undefined}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h5v-6h4v6h5V9.5" />
      </svg>
      Overview
    </a>
  );
}
