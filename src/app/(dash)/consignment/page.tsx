import { PAGES } from "@/lib/pages";
import { todayISO } from "@/lib/consignment/analyze";
import { loadSnapshot, type Snapshot } from "@/lib/consignment/store";
import { loadDocNumbers } from "@/lib/consignment/doc-store";
import { PageHeader } from "@/components/page-header";
import { Explorer } from "@/components/consignment/explorer";
import { WorkbookDialog } from "@/components/consignment/workbook-dialog";
import { CsgFileDialog } from "@/components/consignment/csg-file-dialog";
import { CsrFileDialog } from "@/components/consignment/csr-file-dialog";

const page = PAGES.find(p => p.href === "/consignment")!;

const primary =
  "rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white no-underline transition-opacity hover:opacity-90";

export default async function ConsignmentPage() {
  let snap: Snapshot | null = null;
  let missingTables = false;
  try {
    snap = await loadSnapshot();
  } catch {
    missingTables = true;
  }
  const docNos = snap ? await loadDocNumbers() : [];
  const today = todayISO();

  return (
    <>
      <PageHeader title={page.title} description={page.description}>
        {snap && <a href="/consignment/outlets" className={primary}>View outlets</a>}
        {snap && <CsgFileDialog />}
        {snap && <CsrFileDialog />}
        {snap && <WorkbookDialog />}
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
          <p className="mb-0 mt-2 text-sm text-ink-2">Upload the workbook to see stock by outlet, salesman, product and age.</p>
          <div className="mt-3"><WorkbookDialog label="Upload workbook" primary /></div>
        </div>
      ) : (
        <>
          <p className="-mt-2 mb-4 text-sm text-muted">
            From {snap.info.fileName || "the workbook"}, updated{" "}
            {snap.info.uploadedAt.toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur", dateStyle: "medium", timeStyle: "short" })}
            {snap.info.uploadedBy ? ` by ${snap.info.uploadedBy}` : ""}.
          </p>
          <Explorer
            lines={snap.lines} outlets={snap.outlets} today={today}
            warnings={snap.info.warnings} ignoredSheets={snap.info.ignoredSheets} docNos={docNos}
          />
        </>
      )}
    </>
  );
}
