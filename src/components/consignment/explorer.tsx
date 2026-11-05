"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  NO_FILTERS, buildOutletRows, csgFiles, docKey, fmtInt, groupLines, matches, outletsHref, totals, withAge,
  type Filters, type GroupKey, type Line, type OutletRef,
} from "@/lib/consignment/analyze";
import { Attention } from "./attention";
import { FilterSelects, filterOptions } from "./filter-selects";
import { ShelfLife } from "./shelf-life";

// The overview answers "how is consignment stock doing?". Working through
// outlets happens on the Outlets page, and each figure here opens it filtered.
export function Explorer({ lines, outlets, today, warnings, ignoredSheets, docNos }: {
  lines: Line[];
  outlets: OutletRef[];
  today: string;
  warnings: string[];
  ignoredSheets: string[];
  /** CSG numbers whose ERP document has been uploaded. */
  docNos: string[];
}) {
  const docKeys = useMemo(() => new Set(docNos.map(docKey)), [docNos]);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [by, setBy] = useState<GroupKey>("owner");

  const aged = useMemo(() => lines.map(l => withAge(l, today)), [lines, today]);
  const filtered = useMemo(() => aged.filter(l => matches(l, filters)), [aged, filters]);
  const rows = useMemo(() => buildOutletRows(filtered, outlets, filters), [filtered, outlets, filters]);
  const tot = useMemo(() => totals(filtered, rows), [filtered, rows]);
  const files = useMemo(() => csgFiles(filtered, docKeys), [filtered, docKeys]);

  // The chart ignores the filter on its own dimension, so picking "Johor"
  // still leaves every other state on screen to compare against.
  const chartLines = useMemo(() => aged.filter(l => matches(l, { ...filters, [by]: "" })), [aged, filters, by]);
  const groups = useMemo(() => groupLines(chartLines, by), [chartLines, by]);
  const chartBands = useMemo(() => totals(chartLines, []).bands, [chartLines]);
  const options = useMemo(() => filterOptions(lines, outlets), [lines, outlets]);

  const active = filters.owner || filters.state || filters.product;
  const setFilter = (k: keyof Filters, v: string) => setFilters(f => ({ ...f, [k]: v }));
  const overPct = tot.units ? Math.round((tot.overYearUnits / tot.units) * 100) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filters">
        <FilterSelects filters={filters} options={options} onChange={setFilter} />
        {active && (
          <button
            type="button" onClick={() => setFilters(NO_FILTERS)}
            className="rounded px-1 py-1.5 text-sm font-semibold text-ink-2 underline hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* ---- ledger band: one panel, hairline dividers ---- */}
      <section aria-label="Totals" className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line lg:grid-cols-6">
        <Figure className="col-span-2" big value={fmtInt(tot.units)} label="units on consignment" />
        <Figure
          href={outletsHref("holding", filters)}
          value={fmtInt(tot.outletsHolding)} label={`of ${fmtInt(tot.outletsListed)} outlets hold stock`}
        />
        <Figure
          href={outletsHref("missing", filters)}
          value={fmtInt(files.have)} label={`of ${fmtInt(files.need)} CSG files uploaded`}
        />
        <Figure
          href={outletsHref("old", filters)}
          value={`${overPct}%`} label={`older than 1 year (${fmtInt(tot.overYearUnits)} units)`}
        />
        <Figure
          href={outletsHref("refresh", filters)}
          value={fmtInt(tot.refreshLines)} tone={tot.refreshLines ? "danger" : undefined}
          label={tot.refreshLines ? `marked for refresh (${fmtInt(tot.refreshUnits)} units)` : "marked for refresh"}
        />
      </section>

      <ShelfLife
        groups={groups} by={by} onBy={setBy} bands={chartBands}
        selected={filters[by]} onPick={label => setFilter(by, label)}
      />
      <Attention lines={filtered} filters={filters} />

      {(warnings.length > 0 || ignoredSheets.length > 0) && (
        <details className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink-2">
          <summary className="cursor-pointer font-semibold text-ink">
            Notes from reading the workbook{warnings.length ? ` (${warnings.length})` : ""}
          </summary>
          {warnings.length > 0 && (
            <>
              <p className="mt-2">These entries could not be read cleanly. Fix them in the workbook and upload it again.</p>
              <ul className="mt-1 list-disc pl-5">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
            </>
          )}
          {ignoredSheets.length > 0 && (
            <p className="mt-3">
              Sheets not counted, because they repeat the outlet sheets: {ignoredSheets.join(", ")}.
            </p>
          )}
        </details>
      )}
    </div>
  );
}

function Figure({ value, label, big, tone, href, className = "" }: {
  value: string; label: string; big?: boolean; tone?: "danger"; href?: string; className?: string;
}) {
  const body = (
    <>
      <p className={`font-display font-semibold leading-none tabular-nums ${big ? "text-5xl" : "text-3xl"} ${tone === "danger" ? "text-danger" : "text-ink"}`}>
        {value}
      </p>
      <p className="mt-2 text-sm text-ink-2">{label}</p>
    </>
  );
  const cls = `bg-surface px-5 py-4 ${className}`;
  return href ? (
    <Link
      href={href}
      className={`${cls} block no-underline transition-colors hover:bg-quiet focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand`}
    >
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
