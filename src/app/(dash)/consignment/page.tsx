import { PAGES } from "@/lib/pages";
import { fmtDate, todayISO } from "@/lib/consignment/analyze";
import { loadSnapshot, type Snapshot } from "@/lib/consignment/store";
import { PageHeader } from "@/components/page-header";
import { Explorer } from "@/components/consignment/explorer";

const page = PAGES.find(p => p.href === "/consignment")!;

const upload =
  "rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white no-underline transition-opacity hover:opacity-90";

export default async function ConsignmentPage() {
  let snap: Snapshot | null = null;
  let missingTables = false;
  try {
    snap = await loadSnapshot();
  } catch {
    missingTables = true;
  }
  const today = todayISO();

  return (
    <>
      <PageHeader title={page.title} description={page.description}>
        <a href="/consignment/import" className={upload}>Upload workbook</a>
      </PageHeader>

      {missingTables ? (
        <div className="needs">
          <strong>The consignment tables don&apos;t exist yet.</strong>
          <ul>
            <li>Run <code>prisma/sql/0004_warehouse_consignment.sql</code> in the Supabase SQL editor, then upload the workbook.</li>
          </ul>
        </div>
      ) : !snap ? (
        <div className="needs">
          <strong>No consignment data yet.</strong>
          <ul>
            <li><a href="/consignment/import">Upload the consignment workbook</a> to see stock by outlet, salesman, product and age.</li>
          </ul>
        </div>
      ) : (
        <>
          <p className="-mt-2 mb-5 text-sm text-ink-2">
            From {snap.info.fileName || "the workbook"}, uploaded{" "}
            {snap.info.uploadedAt.toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur", dateStyle: "medium", timeStyle: "short" })}
            {snap.info.uploadedBy ? ` by ${snap.info.uploadedBy}` : ""}. Stock age is counted from each CSG date to today, {fmtDate(today)}.
          </p>
          <Explorer
            lines={snap.lines} outlets={snap.outlets} today={today}
            warnings={snap.info.warnings} ignoredSheets={snap.info.ignoredSheets}
          />
        </>
      )}
    </>
  );
}
