import { recentImports } from "@/lib/exchange/store";
import { PageHeader } from "@/components/page-header";
import { UploadBox } from "@/components/exchange/upload-box";

export default async function ImportPage() {
  let imports: Awaited<ReturnType<typeof recentImports>> = [];
  try {
    imports = await recentImports();
  } catch {
    imports = [];
  }
  const th = "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted";
  const td = "px-3 py-2 text-sm text-ink-2";

  return (
    <>
      <PageHeader
        title="Upload daily listings"
        description="Upload the day's Stock Issue and Stock Receive listings. Returns are matched to issues by customer (Location) and product."
      >
        <a href="/exchange-stock"
           className="rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm font-semibold text-ink-2 no-underline transition-colors hover:border-brand hover:text-ink">
          ← Overdue alerts
        </a>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-2">
        <UploadBox kind="issue" title="Stock Issue Listing" />
        <UploadBox kind="receive" title="Stock Receive Listing" />
      </div>

      {imports.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 font-display text-lg font-semibold text-ink">Recent uploads</h2>
          <div className="overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-line">
                  <th className={th}>Uploaded</th><th className={th}>Type</th><th className={th}>File</th>
                  <th className={th}>Report dates</th><th className={`${th} text-right`}>New</th>
                  <th className={`${th} text-right`}>Updated</th><th className={th}>By</th>
                </tr>
              </thead>
              <tbody>
                {imports.map(i => (
                  <tr key={i.id} className="border-b border-line last:border-0">
                    <td className={td}>{i.uploadedAt.toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur", dateStyle: "medium", timeStyle: "short" })}</td>
                    <td className={td}>{i.kind === "issue" ? "Issue" : "Receive"}</td>
                    <td className={td}>{i.fileName}</td>
                    <td className={td}>
                      {i.dateFrom ? i.dateFrom.toISOString().slice(0, 10) : "—"}
                      {i.dateTo && i.dateTo.getTime() !== i.dateFrom?.getTime() ? ` to ${i.dateTo.toISOString().slice(0, 10)}` : ""}
                    </td>
                    <td className={`${td} text-right tabular-nums`}>{i.rowsAdded}</td>
                    <td className={`${td} text-right tabular-nums`}>{i.rowsUpdated}</td>
                    <td className={td}>{i.uploadedBy ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
