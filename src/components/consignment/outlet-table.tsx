"use client";
import { useId, useState } from "react";
import { ageText, fmtDate, fmtInt, type OutletRow, type Tag } from "@/lib/consignment/analyze";
import { BAND_BG, BAND_LABEL } from "./shelf-life";
import { ColumnMenu } from "./column-menu";
import { CsgDetails } from "./csg-details";

export type SortKey = "oldest" | "units" | "name" | "owner" | "state";
export type Sort = { key: SortKey; dir: "asc" | "desc" };

/** Per-column "show only these" choices; an empty set or blank bound means no filter. */
export type ColFilters = { outlets: Set<string>; owners: Set<string>; states: Set<string>; min: string; max: string };
export const NO_COL_FILTERS: ColFilters = { outlets: new Set(), owners: new Set(), states: new Set(), min: "", max: "" };
export type ColOptions = { outlets: { value: string; count: number }[]; owners: { value: string; count: number }[]; states: { value: string; count: number }[] };

const TAG_NOTE: Record<Tag, string> = {
  new: "New CSG",
  adjusted: "Refreshed from location",
  clearance: "2027 clearance",
};

const th = "whitespace-nowrap px-3 py-2 text-left text-sm font-semibold text-ink-2";

export function OutletTable({ rows, today, sort, onSort, filters, onFilters, options, open, onToggle, shown, onMore, docNos }: {
  rows: OutletRow[];
  today: string;
  sort: Sort;
  onSort: (s: Sort) => void;
  filters: ColFilters;
  onFilters: (f: ColFilters) => void;
  options: ColOptions;
  open: Set<string>;
  onToggle: (key: string) => void;
  shown: number;
  onMore: () => void;
  docNos: Set<string>;
}) {
  const ariaSort = (k: SortKey) => (sort.key === k ? (sort.dir === "asc" ? "ascending" : "descending") : "none");
  const menu = { sort, onSort };
  const visible = rows.slice(0, shown);

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-line bg-quiet">
              <th className={th} aria-sort={ariaSort("name")}>
                <ColumnMenu
                  {...menu} kind="list" label="Outlet" sortKey="name" sortWords={["A to Z", "Z to A"]}
                  options={options.outlets} selected={filters.outlets} searchHint="Search outlets"
                  onSelected={s => onFilters({ ...filters, outlets: s })}
                />
              </th>
              <th className={`${th} hidden lg:table-cell`} aria-sort={ariaSort("owner")}>
                <ColumnMenu
                  {...menu} kind="list" label="Salesman" sortKey="owner" sortWords={["A to Z", "Z to A"]}
                  options={options.owners} selected={filters.owners} searchHint="Search salesmen"
                  onSelected={s => onFilters({ ...filters, owners: s })}
                />
              </th>
              <th className={`${th} hidden xl:table-cell`} aria-sort={ariaSort("state")}>
                <ColumnMenu
                  {...menu} kind="list" label="State" sortKey="state" sortWords={["A to Z", "Z to A"]}
                  options={options.states} selected={filters.states} searchHint="Search states"
                  onSelected={s => onFilters({ ...filters, states: s })}
                />
              </th>
              <th className={`${th} text-right`} aria-sort={ariaSort("units")}>
                <ColumnMenu
                  {...menu} kind="range" label="Units" sortKey="units" sortWords={["Smallest first", "Largest first"]} align="right"
                  min={filters.min} max={filters.max} onRange={(min, max) => onFilters({ ...filters, min, max })}
                />
              </th>
              <th className={`${th} hidden md:table-cell`}>Age of stock</th>
              <th className={th} aria-sort={ariaSort("oldest")}>
                <button
                  type="button" onClick={() => onSort({ key: "oldest", dir: sort.key === "oldest" && sort.dir === "desc" ? "asc" : "desc" })}
                  className="inline-flex items-center gap-1 rounded font-semibold hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  Oldest CSG
                  <span aria-hidden className={`text-xs ${sort.key === "oldest" ? "text-ink" : "text-transparent"}`}>{sort.dir === "asc" ? "▲" : "▼"}</span>
                </button>
              </th>
              <th className={th}><span className="sr-only">Flags</span></th>
            </tr>
          </thead>
          {visible.map(r => {
            const isOpen = open.has(r.key);
            return (
              <tbody key={r.key} className="border-b border-line last:border-0">
                <tr className={isOpen ? "bg-quiet" : "hover:bg-quiet/60"}>
                  <td className="px-3 py-2.5">
                    <button
                      type="button" aria-expanded={isOpen} aria-controls={`o-${r.key}`} onClick={() => onToggle(r.key)}
                      className="flex w-full items-start gap-2 rounded text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                    >
                      <span aria-hidden className={`mt-1 inline-block w-3 flex-none text-xs text-muted transition-transform ${isOpen ? "rotate-90" : ""}`}>▶</span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-ink">{r.name}</span>
                        <span className="block text-sm text-ink-2">
                          {[r.town, r.state].filter(Boolean).join(", ")}
                          <span className="lg:hidden">{r.owners.length ? ` (${r.owners.join(", ")})` : ""}</span>
                        </span>
                      </span>
                    </button>
                  </td>
                  <td className="hidden px-3 py-2.5 text-sm text-ink-2 lg:table-cell">{r.owners.join(", ") || "None"}</td>
                  <td className="hidden px-3 py-2.5 text-sm text-ink-2 xl:table-cell">{r.state}</td>
                  <td className="px-3 py-2.5 text-right text-sm font-semibold tabular-nums text-ink">
                    {r.units ? fmtInt(r.units) : <span className="font-normal text-muted">0</span>}
                  </td>
                  <td className="hidden px-3 py-2.5 md:table-cell">
                    <AgeMix bands={r.bands} units={r.units} />
                  </td>
                  <td className={`px-3 py-2.5 text-sm tabular-nums ${r.oldestDays !== null && r.oldestDays > 730 ? "font-semibold text-ink" : "text-ink-2"}`}>
                    {r.units ? ageText(r.oldestDays) : <span className="text-muted">Nothing out</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap justify-end gap-1">
                      {r.refreshLines > 0 && <Chip tone="danger">Refresh {r.refreshLines}</Chip>}
                      {r.clearanceLines > 0 && <Chip tone="warn">Clearance</Chip>}
                    </div>
                  </td>
                </tr>
                {isOpen && (
                  <tr id={`o-${r.key}`} className="bg-quiet">
                    <td colSpan={7} className="px-3 pb-3 pl-8">
                      {r.lines.length === 0 ? (
                        <p className="py-2 text-sm text-ink-2">No CSG is recorded for this outlet in the workbook.</p>
                      ) : (
                        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
                          <table className="w-full border-collapse">
                            <thead>
                              <tr className="border-b border-line">
                                <th className={th}>Product</th><th className={th}>CSG no</th><th className={th}>CSG date</th>
                                <th className={th}>Age</th><th className={`${th} text-right`}>Units</th><th className={th}>Note</th><th className={th}><span className="sr-only">Details</span></th>
                              </tr>
                            </thead>
                            <tbody>
                              {r.lines.map((l, i) => (
                                <LineRow
                                  key={i} l={l}
                                  hasDoc={!!l.csgNo && docNos.has(l.csgNo)}
                                  csgQty={l.csgNo ? r.lines.filter(x => x.csgNo === l.csgNo).reduce((n, x) => n + x.qty, 0) : l.qty}
                                />
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      <p className="mt-2 text-sm text-muted">Age is counted from the CSG date to {fmtDate(today)}.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            );
          })}
        </table>
      </div>
      {rows.length > shown && (
        <div className="border-t border-line px-3 py-2.5 text-center">
          <button
            type="button" onClick={onMore}
            className="rounded px-2 py-1 text-sm font-semibold text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            Show {Math.min(40, rows.length - shown)} more ({rows.length - shown} left)
          </button>
        </div>
      )}
    </div>
  );
}

type OutletLine = OutletRow["lines"][number];

function LineRow({ l, hasDoc, csgQty }: { l: OutletLine; hasDoc: boolean; csgQty: number }) {
  const [show, setShow] = useState(false);
  const panel = useId();
  return (
    <>
      <tr className={`${show ? "" : "border-b border-line last:border-0"}`}>
        <td className="px-3 py-1.5 text-sm text-ink">{l.product}</td>
        <td className="px-3 py-1.5 font-mono text-[0.8125rem] text-ink-2">{l.csgNo ?? "Not recorded"}</td>
        <td className="px-3 py-1.5 text-sm text-ink-2">{l.csgDate ? fmtDate(l.csgDate) : "Not recorded"}</td>
        <td className="px-3 py-1.5 text-sm">
          <span className="inline-flex items-center gap-1.5 tabular-nums text-ink-2">
            <span aria-hidden title={BAND_LABEL[l.band]} className={`h-2.5 w-2.5 rounded-sm ${BAND_BG[l.band]}`} />
            {ageText(l.days)}
          </span>
        </td>
        <td className="px-3 py-1.5 text-right text-sm font-semibold tabular-nums text-ink">{fmtInt(l.qty)}</td>
        <td className="px-3 py-1.5">
          <div className="flex flex-wrap gap-1">
            {l.needsRefresh && <Chip tone="danger">Needs refresh</Chip>}
            {l.tag === "clearance" && <Chip tone="warn">{TAG_NOTE.clearance}</Chip>}
            {l.tag === "adjusted" && <Chip tone="info">{TAG_NOTE.adjusted}</Chip>}
            {l.tag === "new" && <Chip tone="ok">{TAG_NOTE.new}</Chip>}
          </div>
        </td>
        <td className="px-3 py-1.5 text-right">
          {hasDoc ? (
            <button
              type="button" aria-expanded={show} aria-controls={panel} onClick={() => setShow(v => !v)}
              className="whitespace-nowrap rounded-md border border-line-strong px-2.5 py-0.5 text-sm font-semibold text-ink-2 hover:border-brand hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              {show ? "Hide details" : "Details"}
            </button>
          ) : l.csgNo ? (
            <span className="whitespace-nowrap text-sm text-muted">Not uploaded</span>
          ) : null}
        </td>
      </tr>
      {show && l.csgNo && (
        <tr id={panel} className="border-b border-line bg-page last:border-0">
          <td colSpan={7} className="p-0">
            {/* w-0 + min-w-full: the grid scrolls inside this box instead of widening the outlet table */}
            <div className="w-0 min-w-full"><CsgDetails csgNo={l.csgNo} workbookQty={csgQty} /></div>
          </td>
        </tr>
      )}
    </>
  );
}

function AgeMix({ bands, units }: { bands: number[]; units: number }) {
  if (!units) return <div aria-hidden className="h-2 w-28 rounded-full border border-dashed border-line-strong" />;
  return (
    <div
      role="img" className="flex h-2 w-28 gap-px overflow-hidden rounded-full"
      aria-label={bands.map((n, i) => (n ? `${BAND_LABEL[i]} ${fmtInt(n)}` : "")).filter(Boolean).join(", ")}
    >
      {bands.map((n, i) => (n > 0 ? <span key={i} className={BAND_BG[i]} style={{ flex: `${n} 1 0` }} /> : null))}
    </div>
  );
}

function Chip({ tone, children }: { tone: "danger" | "warn" | "ok" | "info"; children: React.ReactNode }) {
  const cls = {
    danger: "bg-danger/10 text-danger",
    warn: "bg-warn/15 text-warn",
    ok: "bg-ok/10 text-ok",
    info: "bg-brand/10 text-brand",
  }[tone];
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>{children}</span>;
}
