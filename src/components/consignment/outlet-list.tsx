"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  NO_FILTERS, buildOutletRows, csgFiles, docKey, fmtInt, matches, withAge,
  type Filters, type Line, type OutletRef, type OutletRow,
} from "@/lib/consignment/analyze";
import { FilterSelects, fieldCls, filterOptions } from "./filter-selects";
import { NO_COL_FILTERS, OutletTable, type ColFilters, type ColOptions, type Sort, type SortKey } from "./outlet-table";

type Status = "all" | "holding" | "refresh" | "old" | "clearance" | "missing" | "empty";

const PAGE = 25;
const SORT_KEYS: SortKey[] = ["oldest", "units", "name", "owner", "state"];
const STATUS_KEYS: Status[] = ["all", "holding", "refresh", "old", "clearance", "missing", "empty"];

type ListState = { q: string; status: Status; filters: Filters; sort: Sort; col: ColFilters; page: number };

// The view lives in the URL, so coming back from an outlet lands on the same
// search, filters and page.
function parseState(qs: string): ListState {
  const p = new URLSearchParams(qs);
  const status = p.get("status") as Status;
  const key = p.get("sort") as SortKey;
  return {
    q: p.get("q") ?? "",
    status: STATUS_KEYS.includes(status) ? status : "all",
    filters: { owner: p.get("owner") ?? "", state: p.get("state") ?? "", product: p.get("product") ?? "" },
    sort: { key: SORT_KEYS.includes(key) ? key : "oldest", dir: p.get("dir") === "asc" ? "asc" : "desc" },
    col: {
      outlets: new Set(p.getAll("co")), owners: new Set(p.getAll("cs")), states: new Set(p.getAll("ct")),
      min: p.get("min") ?? "", max: p.get("max") ?? "",
    },
    page: Math.max(1, Number(p.get("page")) || 1),
  };
}

function stateQuery(s: ListState): string {
  const p = new URLSearchParams();
  if (s.q) p.set("q", s.q);
  if (s.status !== "all") p.set("status", s.status);
  if (s.filters.owner) p.set("owner", s.filters.owner);
  if (s.filters.state) p.set("state", s.filters.state);
  if (s.filters.product) p.set("product", s.filters.product);
  if (s.sort.key !== "oldest" || s.sort.dir !== "desc") { p.set("sort", s.sort.key); p.set("dir", s.sort.dir); }
  s.col.outlets.forEach(v => p.append("co", v));
  s.col.owners.forEach(v => p.append("cs", v));
  s.col.states.forEach(v => p.append("ct", v));
  if (s.col.min) p.set("min", s.col.min);
  if (s.col.max) p.set("max", s.col.max);
  if (s.page > 1) p.set("page", String(s.page));
  return p.toString();
}

export function OutletList({ lines, outlets, today, docNos, initial }: {
  lines: Line[];
  outlets: OutletRef[];
  today: string;
  docNos: string[];
  /** The query string the page was opened with. */
  initial: string;
}) {
  const docKeys = useMemo(() => new Set(docNos.map(docKey)), [docNos]);
  const [state, setState] = useState(() => parseState(initial));
  const { q, status, filters, sort, col, page } = state;
  const top = useRef<HTMLDivElement>(null);

  const query = stateQuery(state);
  useEffect(() => {
    window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
  }, [query]);

  /** Any change to what is listed goes back to page 1. */
  const update = (patch: Partial<ListState>) => setState(s => ({ ...s, page: 1, ...patch }));

  const aged = useMemo(() => lines.map(l => withAge(l, today)), [lines, today]);
  const filtered = useMemo(() => aged.filter(l => matches(l, filters)), [aged, filters]);
  const rows = useMemo(() => buildOutletRows(filtered, outlets, filters), [filtered, outlets, filters]);
  const options = useMemo(() => filterOptions(lines, outlets), [lines, outlets]);

  const statuses = useMemo<{ key: Status; label: string; test: (r: OutletRow) => boolean }[]>(() => [
    { key: "all", label: "All outlets", test: () => true },
    { key: "holding", label: "Holding stock", test: r => r.units > 0 },
    { key: "refresh", label: "Marked for refresh", test: r => r.refreshLines > 0 },
    { key: "old", label: "Stock over 1 year", test: r => r.overYearUnits > 0 },
    { key: "clearance", label: "2027 clearance", test: r => r.clearanceLines > 0 },
    { key: "missing", label: "CSG files missing", test: r => { const f = csgFiles(r.lines, docKeys); return f.have < f.need; } },
    { key: "empty", label: "Nothing out", test: r => r.units === 0 },
  ], [docKeys]);

  const counts = useMemo(() => Object.fromEntries(statuses.map(s => [s.key, rows.filter(s.test).length])) as Record<Status, number>, [rows, statuses]);

  // Choices offered in the column menus: every outlet in view before the column filters apply.
  const colOptions = useMemo<ColOptions>(() => {
    const tally = (xs: string[]) => {
      const m = new Map<string, number>();
      for (const x of xs) if (x) m.set(x, (m.get(x) ?? 0) + 1);
      return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([value, count]) => ({ value, count }));
    };
    return { outlets: tally(rows.map(r => r.name)), owners: tally(rows.flatMap(r => r.owners)), states: tally(rows.map(r => r.state)) };
  }, [rows]);

  const colActive = col.outlets.size + col.owners.size + col.states.size > 0 || col.min !== "" || col.max !== "";

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const test = statuses.find(s => s.key === status)!.test;
    const lo = col.min === "" ? null : Number(col.min);
    const hi = col.max === "" ? null : Number(col.max);
    const out = rows.filter(r => {
      if (!test(r)) return false;
      if (col.outlets.size && !col.outlets.has(r.name)) return false;
      if (col.owners.size && !r.owners.some(o => col.owners.has(o))) return false;
      if (col.states.size && !col.states.has(r.state)) return false;
      if (lo !== null && r.units < lo) return false;
      if (hi !== null && r.units > hi) return false;
      if (!needle) return true;
      return [r.name, r.town, r.state, ...r.owners, ...r.lines.map(l => l.csgNo ?? "")].some(t => t.toLowerCase().includes(needle));
    });
    const dir = sort.dir === "asc" ? 1 : -1;
    return out.sort((a, b) => {
      if (sort.key === "name") return dir * a.name.localeCompare(b.name);
      if (sort.key === "owner") return dir * (a.owners[0] ?? "").localeCompare(b.owners[0] ?? "") || a.name.localeCompare(b.name);
      if (sort.key === "state") return dir * a.state.localeCompare(b.state) || a.name.localeCompare(b.name);
      if (sort.key === "units") return dir * (a.units - b.units) || a.name.localeCompare(b.name);
      // Outlets with nothing out have no age; keep them last whichever way it sorts.
      if (a.oldestDays === null && b.oldestDays === null) return a.name.localeCompare(b.name);
      if (a.oldestDays === null) return 1;
      if (b.oldestDays === null) return -1;
      return dir * (a.oldestDays - b.oldestDays) || a.name.localeCompare(b.name);
    });
  }, [rows, q, status, sort, col, statuses]);

  const pages = Math.max(1, Math.ceil(visible.length / PAGE));
  const current = Math.min(page, pages);
  const first = (current - 1) * PAGE;
  const slice = visible.slice(first, first + PAGE);

  function go(n: number) {
    setState(s => ({ ...s, page: n }));
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    top.current?.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
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

  const quietBtn =
    "rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm font-semibold text-ink-2 transition-colors hover:border-brand hover:text-ink disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand";

  return (
    <div ref={top} className="flex scroll-mt-4 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="outlet-search">Search outlets</label>
        <input
          id="outlet-search" type="search" value={q} placeholder="Search outlet, town, salesman or CSG no"
          onChange={e => update({ q: e.target.value })}
          className={`${fieldCls} min-w-[16rem] flex-1 placeholder:text-muted`}
        />
        <FilterSelects filters={filters} options={options} onChange={(k, v) => update({ filters: { ...filters, [k]: v } })} />
        <button type="button" onClick={download} className={quietBtn}>Download CSV</button>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Show outlets">
        {statuses.map(s => (
          <button
            key={s.key} type="button" aria-pressed={status === s.key} onClick={() => update({ status: s.key })}
            className={`rounded-full border px-3 py-1 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
              status === s.key ? "border-tile bg-tile text-white" : "border-line-strong bg-surface text-ink-2 hover:border-brand hover:text-ink"
            }`}
          >
            {s.label}
            <span className={`ml-1.5 tabular-nums ${status === s.key ? "text-white/80" : "text-muted"}`}>{fmtInt(counts[s.key])}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-xl border border-line bg-quiet px-4 py-8 text-center text-sm text-ink-2">
          No outlets match.{" "}
          <button
            type="button" className="font-semibold text-ink-2 underline hover:text-ink"
            onClick={() => update({ q: "", status: "all", filters: NO_FILTERS, col: NO_COL_FILTERS })}
          >
            Reset search and filters
          </button>
        </p>
      ) : (
        <OutletTable
          rows={slice} sort={sort} onSort={s => update({ sort: s })}
          filters={col} onFilters={f => update({ col: f })} options={colOptions}
          docKeys={docKeys} from={query}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-2" role="status">
          {visible.length > 0 ? `${fmtInt(first + 1)} to ${fmtInt(first + slice.length)} of ${fmtInt(visible.length)} outlets` : "No outlets"}
          {colActive && (
            <button
              type="button" onClick={() => update({ col: NO_COL_FILTERS })}
              className="ml-2 rounded font-semibold text-ink-2 underline hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Clear column filters
            </button>
          )}
        </p>
        {pages > 1 && (
          <nav className="flex items-center gap-2" aria-label="Outlet pages">
            <button type="button" className={quietBtn} disabled={current === 1} onClick={() => go(current - 1)}>Previous</button>
            <span className="text-sm tabular-nums text-ink-2">Page {current} of {pages}</span>
            <button type="button" className={quietBtn} disabled={current === pages} onClick={() => go(current + 1)}>Next</button>
          </nav>
        )}
      </div>
    </div>
  );
}
