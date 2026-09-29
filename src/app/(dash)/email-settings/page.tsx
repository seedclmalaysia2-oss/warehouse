import { getAccess } from "@/lib/auth";
import { loadRoutes } from "@/lib/email/store";
import { smtpStatus } from "@/lib/email/smtp";
import { PageHeader } from "@/components/page-header";
import { RouteEditor } from "@/components/email/route-editor";

export default async function EmailSettingsPage() {
  // The (dash) layout has already refused anyone without access; this is for
  // the sender name in the preview.
  const access = await getAccess();
  const sender = access.kind === "ok" ? access.staff.full_name ?? access.staff.email : "";
  const [routes, smtp] = [await loadRoutes(), smtpStatus()];

  return (
    <>
      <PageHeader
        title="Email settings"
        description="Where purchase orders go out to SEED HQ, and where customer orders come in. Settings are shared by everyone on the warehouse team."
      />

      <section className="mb-8 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-line bg-quiet px-4 py-3 text-sm">
        <span className="label">Sending server</span>
        {smtp.configured ? (
          <>
            <span className="inline-flex items-center gap-2 font-semibold text-ok">
              <span className="size-2 rounded-full bg-ok" /> Connected
            </span>
            <span className="text-ink-2">
              Sends as <span className="font-mono text-[0.8125rem] text-ink">{smtp.from}</span> via {smtp.host}
            </span>
          </>
        ) : (
          <>
            <span className="inline-flex items-center gap-2 font-semibold text-warn">
              <span className="size-2 rounded-full bg-warn" /> Not set up
            </span>
            <span className="text-ink-2">
              Settings can be saved now. Sending needs{" "}
              {smtp.missing.map((m, i) => (
                <span key={m}>
                  {i > 0 && ", "}
                  <code className="font-mono text-[0.8125rem] text-ink">{m}</code>
                </span>
              ))}{" "}
              in the environment.
            </span>
          </>
        )}
      </section>

      <div className="flex flex-col gap-10">
        <RouteEditor route="outward" initial={routes.outward} sender={sender} canSend={smtp.configured} />
        <RouteEditor route="inward" initial={routes.inward} sender={sender} canSend={smtp.configured} />
      </div>
    </>
  );
}
