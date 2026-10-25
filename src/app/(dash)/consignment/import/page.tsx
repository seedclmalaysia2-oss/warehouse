import { recentImports, type ImportInfo } from "@/lib/consignment/store";
import { PageHeader } from "@/components/page-header";
import { UploadBox } from "@/components/consignment/upload-box";

export default async function ConsignmentImportPage() {
  let imports: ImportInfo[] = [];
  try {
    imports = await recentImports();
  } catch {
    imports = [];
  }
  const th = "px-3 py-2 text-left text-sm font-semibold text-ink-2";
  const td = "px-3 py-2 text-sm text-ink-2";

  return (
    <>
      <PageHeader
        title="Upload consignment workbook"
        description="Update the ECP Consignment figures from the latest CSG workbook."
      >
        <a href="/consignment"
           className="rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm font-semibold text-ink-2 no-underline transition-colors hover:border-brand hover:text-ink">
          Back to consignment
        </a>
      </PageHeader>

      <div className="max-w-3xl">
        <UploadBox />

        <section className="mt-6 rounded-xl border border-line bg-quiet p-5 text-sm text-ink-2">
          <h2 className="font-display text-lg font-semibold text-ink">How the workbook is read</h2>
          <ul className="mt-2 list-disc pl-5">
            <li>Each outlet row is read across its product groups. A CSG is a date, a CSG number and a quantity.</li>
            <li>Red text marks stock to refresh. Green is a new CSG, cyan is refreshed from location, and yellow is 2027 clearance stock.</li>
            <li>Stock age is counted from the CSG date, since the workbook holds no expiry dates.</li>
            <li>Sheets without an Outlet and State column are treated as copies and left out, so nothing is counted twice.</li>
          </ul>
        </section>
      </div>

      {imports.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 font-display text-lg font-semibold text-ink">Recent uploads</h2>
          <div className="overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-line">
                  <th className={th}>Uploaded</th><th className={th}>File</th>
                  <th className={`${th} text-right`}>Outlets</th><th className={`${th} text-right`}>CSG lines</th>
                  <th className={`${th} text-right`}>Units</th><th className={th}>By</th>
                </tr>
              </thead>
              <tbody>
                {imports.map(i => (
                  <tr key={i.id} className="border-b border-line last:border-0">
                    <td className={td}>{i.uploadedAt.toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur", dateStyle: "medium", timeStyle: "short" })}</td>
                    <td className={td}>{i.fileName}</td>
                    <td className={`${td} text-right tabular-nums`}>{i.outlets}</td>
                    <td className={`${td} text-right tabular-nums`}>{i.lines}</td>
                    <td className={`${td} text-right tabular-nums`}>{i.units.toLocaleString("en-US")}</td>
                    <td className={td}>{i.uploadedBy ?? "None"}</td>
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
