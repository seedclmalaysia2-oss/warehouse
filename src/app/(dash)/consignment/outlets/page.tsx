import { todayISO } from "@/lib/consignment/analyze";
import { loadSnapshot, type Snapshot } from "@/lib/consignment/store";
import { loadDocNumbers } from "@/lib/consignment/doc-store";
import { PageHeader } from "@/components/page-header";
import { OutletList } from "@/components/consignment/outlet-list";
import { WorkbookDialog } from "@/components/consignment/workbook-dialog";

// Never cache: the CSG file counts must show what was just uploaded.
export const dynamic = "force-dynamic";

export default async function OutletsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  let snap: Snapshot | null = null;
  try {
    snap = await loadSnapshot();
  } catch {
    snap = null;
  }
  const docNos = snap ? await loadDocNumbers() : [];

  const initial = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) {
    for (const one of Array.isArray(v) ? v : v ? [v] : []) initial.append(k, one);
  }

  return (
    <>
      <PageHeader title="Outlets" description="Find an outlet, then open it to see its CSGs and upload the files they need.">
        <a href="/consignment"
           className="rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm font-semibold text-ink-2 no-underline transition-colors hover:border-brand hover:text-ink">
          Consignment overview
        </a>
      </PageHeader>
      {snap ? (
        <OutletList lines={snap.lines} outlets={snap.outlets} today={todayISO()} docNos={docNos} initial={initial.toString()} />
      ) : (
        <div className="needs">
          <strong>No consignment data yet.</strong>
          <p className="mb-0 mt-2 text-sm text-ink-2">Upload the workbook to list every outlet.</p>
          <div className="mt-3"><WorkbookDialog label="Upload workbook" primary /></div>
        </div>
      )}
    </>
  );
}
