import Link from "next/link";
import {
  OUTLETS_PATH, ageText, csgFiles, docKey, findOutlet, fmtInt, groupCsgs, outletChoices, outletKey, todayISO,
} from "@/lib/consignment/analyze";
import { loadSnapshot, type Snapshot } from "@/lib/consignment/store";
import { loadDocMeta } from "@/lib/consignment/doc-store";
import { PageHeader } from "@/components/page-header";
import { ChecklistPills } from "@/components/consignment/checklist-pills";
import { OutletFiles, type DocMeta } from "@/components/consignment/outlet-files";
import { OutletSwitcher } from "@/components/consignment/outlet-switcher";
import { AgeLegend, AgeMix } from "@/components/consignment/outlet-table";

// Never cache: a file just uploaded must show on its row straight away.
export const dynamic = "force-dynamic";

export default async function OutletPage({ params, searchParams }: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const key = outletKey(decodeURIComponent((await params).key));
  const { from } = await searchParams;
  // Only ever a query string on the outlet list, so this can't lead off the site.
  const back = typeof from === "string" && from ? `${OUTLETS_PATH}?${from}` : OUTLETS_PATH;

  let snap: Snapshot | null = null;
  try {
    snap = await loadSnapshot();
  } catch {
    snap = null;
  }
  const today = todayISO();
  const row = snap ? findOutlet(snap.lines, snap.outlets, key, today) : undefined;

  const crumbs = (name: string) => (
    <nav aria-label="Breadcrumb" className="mb-2 text-sm text-ink-2">
      <a href="/consignment" className="text-ink-2 no-underline hover:underline">ECP Consignment</a>
      <span aria-hidden className="mx-1.5 text-muted">/</span>
      <Link href={back} className="font-semibold text-ink-2 underline hover:text-ink">Outlets</Link>
      <span aria-hidden className="mx-1.5 text-muted">/</span>
      <span aria-current="page" className="text-ink">{name}</span>
    </nav>
  );

  if (!row) {
    return (
      <>
        {crumbs("Not found")}
        <PageHeader title="Outlet not found" description="This outlet is not in the current workbook. It may have been renamed or removed." />
        <Link href={back} className="text-sm font-semibold text-ink-2 underline hover:text-ink">Back to outlets</Link>
      </>
    );
  }

  const csgs = groupCsgs(row.lines);
  const meta = await loadDocMeta([...new Set(csgs.flatMap(c => (c.docKey ? [c.docKey] : [])))]);
  const docs: Record<string, DocMeta> = Object.fromEntries(
    meta.map(m => [docKey(m.csgNo), { fileName: m.fileName, uploadedAt: m.uploadedAt, uploadedBy: m.uploadedBy }]),
  );
  const files = csgFiles(row.lines, new Set(Object.keys(docs)));
  const place = [row.town, row.state].filter(Boolean).join(", ");
  const owners = row.owners.join(", ");

  return (
    <>
      {crumbs(row.name)}
      <PageHeader title={row.name} description={[place, owners && `Salesman: ${owners}`].filter(Boolean).join(". ") || "ECP outlet"}>
        <OutletSwitcher outlets={outletChoices(snap!.lines, snap!.outlets, today)} current={row.key} from={typeof from === "string" ? from : ""} />
        <ChecklistPills outletKey={row.key} outletName={row.name} />
      </PageHeader>

      <div className="flex flex-col gap-6">
        <section aria-label="This outlet" className="overflow-hidden rounded-xl border border-line bg-surface">
          <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-4">
            <Stat value={fmtInt(row.units)} label="units here" />
            <Stat value={row.units ? ageText(row.oldestDays) : "None"} label="oldest CSG" />
            <Stat value={`${files.have} of ${files.need}`} label="CSG files uploaded" tone={files.need > 0 && files.have === files.need ? "ok" : undefined} />
            <Stat value={fmtInt(row.refreshLines)} label="marked for refresh" tone={row.refreshLines ? "danger" : undefined} />
          </div>
          {row.units > 0 && (
            <div className="border-t border-line px-5 py-3">
              <AgeMix bands={row.bands} units={row.units} className="w-full" />
              <AgeLegend bands={row.bands} />
            </div>
          )}
        </section>

        {csgs.length === 0 && (
          <p className="rounded-xl border border-line bg-quiet px-4 py-6 text-center text-sm text-ink-2">
            The workbook lists no consignment stock at this outlet. Upload its file below and the CSGs in it go live here.
          </p>
        )}
        <OutletFiles csgs={csgs} docs={docs} outletKey={row.key} />
      </div>
    </>
  );
}

function Stat({ value, label, tone }: { value: string; label: string; tone?: "danger" | "ok" }) {
  const color = tone === "danger" ? "text-danger" : tone === "ok" ? "text-ok" : "text-ink";
  return (
    <div className="bg-surface px-5 py-4">
      <p className={`font-display text-3xl font-semibold leading-none tabular-nums ${color}`}>{value}</p>
      <p className="mt-2 text-sm text-ink-2">{label}</p>
    </div>
  );
}
