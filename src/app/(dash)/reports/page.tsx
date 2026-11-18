import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { REPORTS } from "@/lib/reports/registry";

export const dynamic = "force-dynamic";

const GROUP_NOTE: Record<string, string> = {
  "ECP Consignment": "From the latest consignment workbook, the CSG documents and the CSRs.",
  "Exchange Stock": "From the daily Stock Issue and Stock Receive listings.",
  Audit: "Changes made in this dashboard.",
};

export default function ReportsPage() {
  const groups = [...new Set(REPORTS.map(r => r.group))];
  return (
    <>
      <PageHeader
        title="Reports"
        description="Open a report to view it, filter it, print it, or download it as Excel or PDF. Every format shows the same figures."
      />

      <div className="flex flex-col gap-10">
        {groups.map(g => (
          <section key={g} aria-labelledby={`g-${g}`}>
            <div className="mb-3 flex flex-wrap items-baseline gap-x-3 border-b border-line-strong pb-2">
              <h2 id={`g-${g}`} className="font-display text-xl font-semibold text-ink">{g}</h2>
              <p className="text-sm text-muted">{GROUP_NOTE[g]}</p>
            </div>
            <ul className="divide-y divide-line">
              {REPORTS.filter(r => r.group === g).map(r => (
                <li key={r.id} className="grid gap-3 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                  <div className="min-w-0">
                    <Link href={`/reports/${r.id}`} className="font-display text-lg font-semibold text-ink no-underline hover:underline">
                      {r.title}
                    </Link>
                    <p className="mt-0.5 max-w-[72ch] text-sm text-ink-2">{r.description}</p>
                    <p className="mt-1 text-sm text-muted">Used for: {r.use}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/reports/${r.id}`}
                      className="rounded-lg bg-tile px-3 py-1.5 text-sm font-semibold text-white no-underline hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                    >
                      View
                    </Link>
                    <a
                      href={`/api/reports/${r.id}?format=xlsx`}
                      className="rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm font-semibold text-ink-2 no-underline hover:border-brand hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                    >
                      Excel
                    </a>
                    <a
                      href={`/api/reports/${r.id}?format=pdf`} target="_blank" rel="noopener"
                      className="rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm font-semibold text-ink-2 no-underline hover:border-brand hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                    >
                      PDF
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
