import { redirect } from "next/navigation";
import { getAccess } from "@/lib/auth";
import { NoAccess } from "@/components/no-access";
import { SideNav } from "@/components/side-nav";
import { SignOutButton } from "@/components/sign-out-button";

// Never prerender: every page depends on who is asking.
export const dynamic = "force-dynamic";

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  // This check, not the middleware, is what guards the content.
  const access = await getAccess();
  if (access.kind === "signed-out") redirect("/login");
  if (access.kind === "no-access") return <NoAccess email={access.email} />;

  return (
    <div className="shell">
      <aside className="sidebar">
        <a className="brand" href="/">
          <span className="mark">SC</span>
          <span>
            <span className="brand-name">Warehouse</span>
            <span className="brand-sub">SEED CL Malaysia</span>
          </span>
        </a>
        <SideNav />
        <div className="sidebar-foot">
          <a className="hub-link" href="https://seedclmalaysiastore.com">← All dashboards</a>
          <div className="who">{access.staff.full_name ?? access.staff.email}</div>
          <SignOutButton />
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
