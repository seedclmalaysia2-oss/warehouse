import { redirect } from "next/navigation";
import { getAccess } from "@/lib/auth";
import { overdueCount } from "@/lib/exchange/store";
import { NoAccess } from "@/components/no-access";
import { SideNav } from "@/components/side-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { RefreshButton } from "@/components/refresh-button";
import { buildNumber, buildLabel } from "@/lib/build-number";

// Never prerender: every page depends on who is asking.
export const dynamic = "force-dynamic";

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  // This check, not the middleware, is what guards the content.
  const access = await getAccess();
  if (access.kind === "signed-out") redirect("/login");
  if (access.kind === "no-access") return <NoAccess email={access.email} />;

  const [exchangeOverdue, build] = await Promise.all([overdueCount(), buildNumber()]);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand-block">
          <a className="brand" href="/">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="brand-logo" src="/seed-logo.jpg" alt="SEED contact lens" width={64} height={37} />
            <span>
              <span className="brand-name">Warehouse</span>
              <span className="brand-sub">SEED CL Malaysia</span>
            </span>
          </a>
          <div className="build-row">
            <span className="brand-ver">{build ? buildLabel(build) : "test build"}</span>
            <RefreshButton />
          </div>
        </div>
        <SideNav exchangeOverdue={exchangeOverdue} />
        <div className="sidebar-foot">
          <a className="hub-link" href="https://seedclmalaysiastore.com">← All dashboards</a>
          <ThemeToggle />
          <div className="who">{access.staff.full_name ?? access.staff.email}</div>
          <SignOutButton />
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
