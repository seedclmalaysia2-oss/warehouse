"use client";
import Link from "next/link";
import { ageText, csgFiles, fmtInt, outletHref, type OutletRow, type Tag } from "@/lib/consignment/analyze";
import { BAND_BG, BAND_LABEL } from "./shelf-life";
import { ChecklistPills } from "./checklist-pills";
import { ColumnMenu } from "./column-menu";

export type SortKey = "oldest" | "units" | "name" | "owner" | "state";
export type Sort = { key: SortKey; dir: "asc" | "desc" };

/** Per-column "show only these" choices; an empty set or blank bound means no filter. */
export type ColFilters = { outlets: Set<string>; owners: Set<string>; states: Set<string>; min: string; max: string };
export const NO_COL_FILTERS: ColFilters = { outlets: new Set(), owners: new Set(), states: new Set(), min: "", max: "" };
export type ColOptions = { outlets: { value: string; count: number }[]; owners: { value: string; count: number }[]; states: { value: string; count: number }[] };

export const TAG_NOTE: Record<Tag, string> = {
  new: "New CSG",
  adjusted: "Refreshed from location",
  clearance: "2027 clearance",
};

const th = "whitespace-nowrap px-3 py-2 text-left text-sm font-semibold text-ink-2";

export function OutletTable({ rows, sort, onSort, filters, onFilters, options, docKeys, from }: {
  rows: OutletRow[];
  sort: Sort;
  onSort: (s: Sort) => void;
  filters: ColFilters;
  onFilters: (f: ColFilters) => void;
  options: ColOptions;
  docKeys: Set<string>;
  /** The list's query string, so an outlet's page can link back to this same view. */
  from: string;
}) {
  const ariaSort = (k: SortKey) => (sort.key === k ? (sort.dir === "asc" ? "ascending" : "descending") : "none");
  const menu = { sort, onSort };

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
              <th className={th}>Checklist</th>
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
              <th className={`${th} hidden sm:table-cell`}>CSG files</th>
              <th className={th}><span className="sr-only">Flags</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const files = csgFiles(r.lines, docKeys);
              return (
                <tr key={r.key} className="group relative border-b border-line last:border-0 hover:bg-quiet">
                  <td className="px-3 py-2.5">
                    {/* The link stretches over the whole row, so anywhere on it opens the outlet. */}
                    <Link
                      href={outletHref(r.key, from)}
                      className="block rounded text-left no-underline after:absolute after:inset-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                    >
                      <span className="block text-sm font-semibold text-ink group-hover:underline">{r.name}</span>
                      <span className="block text-sm text-ink-2">
                        {[r.town, r.state].filter(Boolean).join(", ")}
                        <span className="lg:hidden">{r.owners.length ? ` (${r.owners.join(", ")})` : ""}</span>
                      </span>
                    </Link>
                  </td>
                  {/* Raised above the row's stretched link, so the pills don't open the outlet. */}
                  <td className="relative z-10 px-3 py-2.5">
                    <ChecklistPills compact outletKey={r.key} outletName={r.name} />
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
                  <td className="hidden whitespace-nowrap px-3 py-2.5 text-sm tabular-nums sm:table-cell">
                    {files.need === 0 ? (
                      <span className="text-muted">None needed</span>
                    ) : (
                      <span className={files.have === files.need ? "font-semibold text-ok" : "text-ink-2"}>{files.have} of {files.need}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap justify-end gap-1">
                      {r.refreshLines > 0 && <Chip tone="danger">Refresh {r.refreshLines}</Chip>}
                      {r.clearanceLines > 0 && <Chip tone="warn">Clearance</Chip>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AgeMix({ bands, units, className = "w-28" }: { bands: number[]; units: number; className?: string }) {
  if (!units) return <div aria-hidden className={`h-2 rounded-full border border-dashed border-line-strong ${className}`} />;
  return (
    <div
      role="img" className={`flex h-2 gap-px overflow-hidden rounded-full ${className}`}
      aria-label={bands.map((n, i) => (n ? `${BAND_LABEL[i]} ${fmtInt(n)}` : "")).filter(Boolean).join(", ")}
    >
      {bands.map((n, i) => (n > 0 ? <span key={i} className={BAND_BG[i]} style={{ flex: `${n} 1 0` }} /> : null))}
    </div>
  );
}

export function AgeLegend({ bands }: { bands: number[] }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-2">
      {bands.map((n, i) => (n > 0 ? (
        <li key={i} className="flex items-center gap-1.5">
          <span aria-hidden className={`h-2.5 w-2.5 rounded-sm ${BAND_BG[i]}`} />
          {BAND_LABEL[i]}
          <span className="font-semibold tabular-nums text-ink">{fmtInt(n)}</span>
        </li>
      ) : null))}
    </ul>
  );
}

export function Chip({ tone, children }: { tone: "danger" | "warn" | "ok" | "info"; children: React.ReactNode }) {
  const cls = {
    danger: "bg-danger/10 text-danger",
    warn: "bg-warn/15 text-warn",
    ok: "bg-ok/10 text-ok",
    info: "bg-brand/10 text-brand",
  }[tone];
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>{children}</span>;
}
