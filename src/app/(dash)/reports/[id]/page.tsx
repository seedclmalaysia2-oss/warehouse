import Link from "next/link";
import { notFound } from "next/navigation";
import { getStaff } from "@/lib/auth";
import { ReportUnavailable, buildReport, filterChoices, readFilters, reportMeta } from "@/lib/reports/registry";
import { align, fmtCell, filterLine, filterQuery, type Column, type ReportData } from "@/lib/reports/types";
import { COMPANY } from "@/lib/reports/export";
import { PrintButton } from "@/components/reports/print-button";

export const dynamic = "force-dynamic";

const btn = "rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm font-semibold text-ink-2 no-underline hover:border-brand hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";
const field = "rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand";

const TONE_ROW: Record<string, string> = {
  danger: "bg-[#fdecea]", warn: "bg-[#fff4db]", ok: "bg-[#e9f6ee]", group: "bg-[#eef2ff] font-semibold",
};
const TONE_TEXT: Record<string, string> = { danger: "text-[#b42318]", warn: "text-[#b45a06]", ok: "text-[#2c8a4a]" };
const ALIGN: Record<string, string> = { left: "text-left", right: "text-right", center: "text-center" };
const cellCls = (c: Column) =>
  [ALIGN[align(c)], c.kind === "int" || c.kind === "pct" ? "tabular-nums whitespace-nowrap" : "", c.kind === "mono" ? "font-mono text-[0.75rem] whitespace-nowrap" : "", c.kind === "date" ? "whitespace-nowrap" : ""].join(" ");

export default async function ReportPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const meta = reportMeta(id);
  if (!meta) notFound();
  const filters = readFilters(await searchParams);
  const [choices, staff] = await Promise.all([filterChoices(), getStaff()]);
  const q = filterQuery(filters);
  const dl = (format: string) => `/api/reports/${id}?format=${format}${q ? `&${q}` : ""}`;

  let data: ReportData | null = null;
  let problem: string | null = null;
  try {
    data = await buildReport(id, filters);
  } catch (e) {
    problem = e instanceof ReportUnavailable ? e.message : "This report could not be built. Try again, or check the uploads on Upload files.";
  }
  const generated = new Date().toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur" });
  const used = filterLine(filters, meta.filters);

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-2 text-sm text-ink-2 print:hidden">
        <Link href="/reports" className="font-semibold text-ink-2 underline hover:text-ink">Reports</Link>
        <span aria-hidden className="mx-1.5 text-muted">/</span>
        <span aria-current="page" className="text-ink">{meta.title}</span>
      </nav>

      <div className="mb-5 flex flex-wrap items-end justify-between gap-4 print:hidden">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold text-ink">{meta.title}</h1>
          <p className="max-w-[70ch] text-sm text-ink-2">{meta.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <PrintButton className={btn} />
          <a href={dl("xlsx")} className={btn}>Download Excel</a>
          <a href={dl("pdf")} target="_blank" rel="noopener" className={btn}>View PDF</a>
          <a href={`${dl("pdf")}&download=1`} className="rounded-lg bg-tile px-3 py-1.5 text-sm font-semibold text-white no-underline hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
            Download PDF
          </a>
        </div>
      </div>

      {meta.filters.length > 0 && (
        <form method="get" className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface px-4 py-3 print:hidden">
          {meta.filters.includes("owner") && (
            <label className="flex flex-col gap-1 text-xs font-semibold text-ink-2">
              Salesman
              <select name="owner" defaultValue={filters.owner} className={field}>
                <option value="">All salesmen</option>
                {choices.owners.map(o => <option key={o}>{o}</option>)}
              </select>
            </label>
          )}
          {meta.filters.includes("state") && (
            <label className="flex flex-col gap-1 text-xs font-semibold text-ink-2">
              State
              <select name="state" defaultValue={filters.state} className={field}>
                <option value="">All states</option>
                {choices.states.map(s => <option key={s}>{s}</option>)}
              </select>
            </label>
          )}
          {meta.filters.includes("from") && (
            <label className="flex flex-col gap-1 text-xs font-semibold text-ink-2">
              From
              <input type="date" name="from" defaultValue={filters.from} className={field} />
            </label>
          )}
          {meta.filters.includes("to") && (
            <label className="flex flex-col gap-1 text-xs font-semibold text-ink-2">
              To
              <input type="date" name="to" defaultValue={filters.to} className={field} />
            </label>
          )}
          <button type="submit" className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
            Apply
          </button>
          {q && <Link href={`/reports/${id}`} className="py-1.5 text-sm font-semibold text-ink-2 underline hover:text-ink">Clear</Link>}
        </form>
      )}

      {problem && (
        <p role="alert" className="rounded-xl border border-line bg-quiet px-4 py-6 text-sm font-semibold text-danger">{problem}</p>
      )}

      {data && (
        // The sheet is always light paper, in either theme, so screen, print and PDF look alike.
        <article className="report-sheet mx-auto max-w-[80rem] rounded-sm bg-white px-5 py-6 text-[#141a3d] shadow-[0_1px_2px_rgba(20,26,61,.08),0_18px_40px_-24px_rgba(20,26,61,.5)] ring-1 ring-[#e4ecff] sm:px-10 sm:py-9 print:max-w-none print:p-0 print:shadow-none print:ring-0">
          <header className="border-b-2 border-[#1e2761] pb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/seed-logo.jpg" alt="" width={56} height={32} className="h-8 w-auto" />
                <p className="text-xs font-bold text-[#4353a6]">{COMPANY}</p>
              </div>
              <p className="text-xs text-[#6b7280]">Generated {generated}{staff ? ` by ${staff.full_name || staff.email}` : ""}</p>
            </div>
            <h2 className="mt-4 font-display text-[1.75rem] font-semibold leading-tight">{data.title}</h2>
            <p className="mt-1 text-sm text-[#4b5563]">{data.subtitle}</p>
            {used && <p className="mt-1 text-sm font-semibold text-[#4353a6]">{used}</p>}
          </header>

          {data.summary.length > 0 && (
            <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-md bg-[#e4ecff] ring-1 ring-[#e4ecff] sm:grid-cols-4">
              {data.summary.map(s => (
                <div key={s.label} className="flex flex-col-reverse bg-white px-4 py-3">
                  <dt className="text-xs text-[#6b7280]">{s.label}</dt>
                  <dd className={`font-display text-2xl font-semibold tabular-nums ${s.tone ? TONE_TEXT[s.tone] : ""}`}>{s.value}</dd>
                </div>
              ))}
            </dl>
          )}

          <div className="mt-6 overflow-x-auto print:overflow-visible">
            <table className="w-full border-collapse text-[0.8125rem] leading-snug">
              <thead>
                <tr className="bg-[#1e2761] text-white">
                  {data.columns.map(c => (
                    <th key={c.key} scope="col" className={`px-2.5 py-2 font-semibold ${ALIGN[align(c)]}`}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 && (
                  <tr><td colSpan={data.columns.length} className="px-2.5 py-8 text-center text-[#6b7280]">Nothing to report for these filters.</td></tr>
                )}
                {data.rows.map((r, i) => (
                  <tr key={i} className={`break-inside-avoid border-b border-[#e4ecff] ${r._tone ? TONE_ROW[r._tone] : i % 2 ? "bg-[#f8faff]" : ""}`}>
                    {data!.columns.map(c => (
                      <td key={c.key} className={`px-2.5 py-1.5 ${cellCls(c)}`}>{fmtCell(c, r[c.key] ?? null)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {data.totals && (
                <tfoot>
                  <tr className="border-t-2 border-[#1e2761] bg-[#f4f7ff] font-bold">
                    {data.columns.map(c => (
                      <td key={c.key} className={`px-2.5 py-2 ${cellCls(c)}`}>{fmtCell(c, data!.totals![c.key] ?? null)}</td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {data.notes.length > 0 && (
            <ul className="mt-5 list-disc space-y-0.5 pl-5 text-xs text-[#6b7280]">
              {data.notes.map(n => <li key={n}>{n}</li>)}
            </ul>
          )}
        </article>
      )}
    </>
  );
}
