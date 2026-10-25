"use client";
import { useMemo, useState } from "react";
import {
  ACCOUNT_PARENT, NO_FILTERS, buildOutletRows, fmtInt, groupLines, isSubAccount, matches, outletKey, totals, withAge,
  type Filters, type GroupKey, type Line, type OutletRef, type OutletRow,
} from "@/lib/consignment/analyze";
import { Attention } from "./attention";
import { OutletTable, type Sort, type SortKey } from "./outlet-table";
import { ShelfLife } from "./shelf-life";

type Status = "all" | "holding" | "refresh" | "old" | "clearance" | "empty";

const STATUSES: { key: Status; label: string; test: (r: OutletRow) => boolean }[] = [
  { key: "all", label: "All outlets", test: () => true },
  { key: "holding", label: "Holding stock", test: r => r.units > 0 },
  { key: "refresh", label: "Marked for refresh", test: r => r.refreshLines > 0 },
  { key: "old", label: "Stock over 1 year", test: r => r.overYearUnits > 0 },
  { key: "clearance", label: "2027 clearance", test: r => r.clearanceLines > 0 },
  { key: "empty", label: "Nothing out", test: r => r.units === 0 },
];

const PAGE = 40;

const select =
  "rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand";

export function Explorer({ lines, outlets, today, warnings, ignoredSheets }: {
  lines: Line[];
  outlets: OutletRef[];
  today: string;
  warnings: string[];
  ignoredSheets: string[];
}) {
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [by, setBy] = useState<GroupKey>("owner");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Status>("all");
  const [sort, setSort] = useState<Sort>({ key: "oldest", dir: "desc" });
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [shown, setShown] = useState(PAGE);

  const aged = useMemo(() => lines.map(l => withAge(l, today)), [lines, today]);
  const filtered = useMemo(() => aged.filter(l => matches(l, filters)), [aged, filters]);
  const rows = useMemo(() => buildOutletRows(filtered, outlets, filters), [filtered, outlets, filters]);
  const tot = useMemo(() => totals(filtered, rows), [filtered, rows]);

  // The chart ignores the filter on its own dimension, so picking "Johor"
  // still leaves every other state on screen to compare against.
  const chartLines = useMemo(() => aged.filter(l => matches(l, { ...filters, [by]: "" })), [aged, filters, by]);
  const groups = useMemo(() => groupLines(chartLines, by), [chartLines, by]);
  const chartBands = useMemo(() => totals(chartLines, []).bands, [chartLines]);

  const options = useMemo(() => {
    const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const families = new Map<string, Set<string>>();
    for (const l of lines) (families.get(l.family) ?? families.set(l.family, new Set()).get(l.family)!).add(l.product);
    const owners = uniq([...lines.map(l => l.owner), ...outlets.map(o => o.owner)]);
    return {
      owners: owners.filter(o => !isSubAccount(o)),
      accounts: owners.filter(isSubAccount),
      states: uniq([...lines.map(l => l.state), ...outlets.map(o => o.state)]),
      families: [...families.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([f, p]) => [f, [...p].sort()] as const),
    };
  }, [lines, outlets]);

  const counts = useMemo(() => Object.fromEntries(STATUSES.map(s => [s.key, rows.filter(s.test).length])) as Record<Status, number>, [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const test = STATUSES.find(s => s.key === status)!.test;
    const out = rows.filter(r => {
      if (!test(r)) return false;
      if (!q) return true;
      return [r.name, r.town, r.state, ...r.owners, ...r.lines.map(l => l.csgNo ?? "")].some(t => t.toLowerCase().includes(q));
    });
    const dir = sort.dir === "asc" ? 1 : -1;
    return out.sort((a, b) => {
      if (sort.key === "name") return dir * a.name.localeCompare(b.name);
      if (sort.key === "units") return dir * (a.units - b.units) || a.name.localeCompare(b.name);
      // Outlets with nothing out have no age; keep them last whichever way it sorts.
      if (a.oldestDays === null && b.oldestDays === null) return a.name.localeCompare(b.name);
      if (a.oldestDays === null) return 1;
      if (b.oldestDays === null) return -1;
      return dir * (a.oldestDays - b.oldestDays) || a.name.localeCompare(b.name);
    });
  }, [rows, query, status, sort]);

  const active = filters.owner || filters.state || filters.product;
  const setFilter = (k: keyof Filters, v: string) => { setFilters(f => ({ ...f, [k]: v })); setShown(PAGE); };

  function onSort(key: SortKey) {
    setSort(s => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" ? "asc" : "desc" }));
  }

  function pickOutlet(name: string) {
    setQuery(name);
    setStatus("all");
    setShown(PAGE);
    setOpen(new Set([outletKey(name)]));
    requestAnimationFrame(() => {
      const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      document.getElementById("outlets")?.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
    });
  }

  function download() {
    const esc = (v: string | number | null) => {
      const s = v === null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const head = ["Salesman", "State", "Town", "Outlet", "Product", "CSG no", "CSG date", "Age (days)", "Units", "Needs refresh", "Note"];
    const body = filtered
      .slice()
      .sort((a, b) => a.outlet.localeCompare(b.outlet) || (b.days ?? -1) - (a.days ?? -1))
      .map(l => [l.owner, l.state, l.town, l.outlet, l.product, l.csgNo, l.csgDate, l.days, l.qty, l.needsRefresh ? "Yes" : "", l.tag ?? ""].map(esc).join(","));
    const blob = new Blob(["﻿" + [head.join(","), ...body].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ecp-consignment-${today}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const overPct = tot.units ? Math.round((tot.overYearUnits / tot.units) * 100) : 0;

  return (
    <div className="flex flex-col gap-6">
      {/* ---- filters ---- */}
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3" role="group" aria-label="Filters">
        <label className="flex flex-col gap-1 text-sm font-semibold text-ink-2">
          Salesman
          <select className={select} value={filters.owner} onChange={e => setFilter("owner", e.target.value)}>
            <option value="">All salesmen</option>
            {options.owners.map(o => <option key={o}>{o}</option>)}
            {options.accounts.length > 0 && (
              <optgroup label={`${ACCOUNT_PARENT}'s accounts`}>{options.accounts.map(o => <option key={o}>{o}</option>)}</optgroup>
            )}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold text-ink-2">
          State
          <select className={select} value={filters.state} onChange={e => setFilter("state", e.target.value)}>
            <option value="">All states</option>
            {options.states.map(o => <option key={o}>{o}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold text-ink-2">
          Product
          <select className={`${select} max-w-[16rem]`} value={filters.product} onChange={e => setFilter("product", e.target.value)}>
            <option value="">All products</option>
            {options.families.map(([f, ps]) => (
              <optgroup key={f} label={f}>{ps.map(p => <option key={p}>{p}</option>)}</optgroup>
            ))}
          </select>
        </label>
        {active && (
          <button
            type="button" onClick={() => setFilters(NO_FILTERS)}
            className="rounded px-1 py-2 text-sm font-semibold text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* ---- ledger band: one panel, hairline dividers ---- */}
      <section aria-label="Totals" className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line lg:grid-cols-6">
        <Figure className="col-span-2" big value={fmtInt(tot.units)} label="units on consignment" />
        <Figure value={fmtInt(tot.outletsHolding)} label={`of ${fmtInt(tot.outletsListed)} outlets hold stock`} />
        <Figure value={fmtInt(tot.csgDocs)} label="CSG documents" />
        <Figure value={`${overPct}%`} label={`older than 1 year (${fmtInt(tot.overYearUnits)} units)`} />
        <Figure
          value={fmtInt(tot.refreshLines)} tone={tot.refreshLines ? "danger" : undefined}
          label={tot.refreshLines ? `marked for refresh (${fmtInt(tot.refreshUnits)} units)` : "marked for refresh"}
        />
      </section>

      {/* ---- the picture ---- */}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <ShelfLife
          groups={groups} by={by} onBy={setBy} bands={chartBands}
          selected={filters[by]} onPick={label => setFilter(by, label)}
        />
        <Attention lines={filtered} onPick={pickOutlet} />
      </div>

      {/* ---- outlets ---- */}
      <section id="outlets" className="scroll-mt-4" aria-labelledby="outlets-h">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="outlets-h" className="font-display text-lg font-semibold text-ink">Outlets</h2>
            <p className="text-sm text-ink-2" role="status">
              {fmtInt(visible.length)} of {fmtInt(rows.length)} outlets. Open a row to see its CSGs.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="outlet-search">Search outlets</label>
            <input
              id="outlet-search" type="search" value={query} placeholder="Search outlet, town or CSG no"
              onChange={e => { setQuery(e.target.value); setShown(PAGE); }}
              className="w-64 max-w-full rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
            />
            <button
              type="button" onClick={download}
              className="rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm font-semibold text-ink-2 transition-colors hover:border-brand hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
            >
              Download CSV
            </button>
          </div>
        </div>

        <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Show outlets">
          {STATUSES.map(s => (
            <button
              key={s.key} type="button" aria-pressed={status === s.key} onClick={() => { setStatus(s.key); setShown(PAGE); }}
              className={`rounded-full border px-3 py-1 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                status === s.key ? "border-tile bg-tile text-white" : "border-line-strong bg-surface text-ink-2 hover:border-brand hover:text-ink"
              }`}
            >
              {s.label}
              <span className={`ml-1.5 tabular-nums ${status === s.key ? "text-white/80" : "text-muted"}`}>{counts[s.key]}</span>
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <p className="rounded-xl border border-line bg-quiet px-4 py-8 text-center text-sm text-ink-2">
            No outlets match.{" "}
            <button
              type="button" className="font-semibold text-brand hover:underline"
              onClick={() => { setQuery(""); setStatus("all"); setFilters(NO_FILTERS); }}
            >
              Reset search and filters
            </button>
          </p>
        ) : (
          <OutletTable
            rows={visible} today={today} sort={sort} onSort={onSort} shown={shown} onMore={() => setShown(n => n + PAGE)}
            open={open}
            onToggle={key => setOpen(prev => { const n = new Set(prev); if (!n.delete(key)) n.add(key); return n; })}
          />
        )}
      </section>

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

function Figure({ value, label, big, tone, className = "" }: {
  value: string; label: string; big?: boolean; tone?: "danger"; className?: string;
}) {
  return (
    <div className={`bg-surface px-5 py-4 ${className}`}>
      <p className={`font-display font-semibold leading-none tabular-nums ${big ? "text-5xl" : "text-3xl"} ${tone === "danger" ? "text-danger" : "text-ink"}`}>
        {value}
      </p>
      <p className="mt-2 text-sm text-ink-2">{label}</p>
    </div>
  );
}
