import { redirect } from "next/navigation";
import { getAccess } from "@/lib/auth";
import { overdueCount } from "@/lib/exchange/store";
import { NoAccess } from "@/components/no-access";
import { SideNav } from "@/components/side-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { RefreshButton } from "@/components/refresh-button";
import { HomeButton } from "@/components/home-button";
import { buildNumber, buildLabel } from "@/lib/build-number";

// Never prerender: every page depends on who is asking.
export const dynamic = "force-dynamic";

/** "LOW KHUN KEONG" -> "Low Khun Keong"; an email is left as it is. */
const nameCase = (s: string) =>
  s.includes("@") ? s : s.toLowerCase().split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

/** Two letters for the avatar: first and last word, or the first two of a single word / email. */
function initials(s: string) {
  const words = s.split("@")[0].split(/[\s._-]+/).filter(Boolean);
  const two = words.length > 1 ? words[0][0] + words[words.length - 1][0] : (words[0] ?? "?").slice(0, 2);
  return two.toUpperCase();
}

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  // This check, not the middleware, is what guards the content.
  const access = await getAccess();
  if (access.kind === "signed-out") redirect("/login");
  if (access.kind === "no-access") return <NoAccess email={access.email} />;

  const [exchangeOverdue, build] = await Promise.all([overdueCount(), buildNumber()]);
  const who = access.staff.full_name?.trim() || access.staff.email;

  return (
    <div className="shell shell-top">
      {/* The SEED top navigation (house standard, 2026-11-21): brand, build, refresh and theme on the left,
          app-wide links in the middle, who is signed in and the exit at the right end. It spans the side menu. */}
      <header className="tb">
        <div className="tb-left">
          <a className="tb-brand" href="/" aria-label="Warehouse, Overview">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="tb-logo" src="/seed-logo.jpg" alt="SEED contact lens" width={64} height={37} />
          </a>
          <span className="tb-pill">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 9.5 12 4l9 5.5V20H3Z" /><path d="M7 20v-7h10v7" /><path d="M7 16.5h10" />
            </svg>
            Warehouse
          </span>
          <span className="tb-build">{build ? buildLabel(build) : "test build"}</span>
          <RefreshButton />
          <ThemeToggle icon />
        </div>
        <nav className="tb-nav" aria-label="Top bar">
          <HomeButton />
          <a className="hub-home" href="https://seedclmalaysiastore.com" title="Back to the SEED CL Malaysia hub, all dashboards">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
            </svg>
            SEED CL HUB
          </a>
        </nav>
        <div className="tb-right">
          <div className="tb-who" aria-label="Signed in as">
            <span className="tb-avatar" aria-hidden="true">{initials(who)}</span>
            <span className="tb-who-text">
              <span className="tb-name" title={access.staff.email}>{nameCase(who)}</span>
              <span className="tb-role">{access.staff.is_admin ? "Admin" : "Warehouse"}</span>
            </span>
          </div>
          <SignOutButton icon className="tb-exit" />
        </div>
      </header>
      <aside className="sidebar">
        <SideNav exchangeOverdue={exchangeOverdue} />
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
