"use client";
import { useState } from "react";
import { BANDS, UNDATED, fmtInt, type Group, type GroupKey } from "@/lib/consignment/analyze";

export const BAND_BG = ["bg-age-1", "bg-age-2", "bg-age-3", "bg-age-4", "age-undated"] as const;
export const BAND_LABEL = [...BANDS.map(b => b.label), UNDATED.label];

const BY: { key: GroupKey; label: string; noun: string }[] = [
  { key: "owner", label: "Salesman", noun: "salesman" },
  { key: "state", label: "State", noun: "state" },
  { key: "product", label: "Product", noun: "product" },
];

const SHOWN = 8;

export function ShelfLife({ groups, by, onBy, bands, selected, onPick }: {
  groups: Group[];
  by: GroupKey;
  onBy: (k: GroupKey) => void;
  bands: number[];
  selected: string;
  onPick: (label: string) => void;
}) {
  const [all, setAll] = useState(false);
  const total = bands.reduce((s, n) => s + n, 0);
  const max = Math.max(1, ...groups.map(g => g.units));
  const shown = all ? groups : groups.slice(0, SHOWN);
  const noun = BY.find(b => b.key === by)!.noun;

  return (
    <section className="rounded-xl border border-line bg-surface p-5" aria-labelledby="shelf-life-h">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="shelf-life-h" className="font-display text-lg font-semibold text-ink">How long stock has been out</h2>
          <p className="mt-0.5 max-w-[46ch] text-sm text-ink-2">
            Units on consignment, split by how old the CSG is. Bar length is units; select a {noun} to filter the page to it.
          </p>
        </div>
        <div role="group" aria-label="Group by" className="flex rounded-lg border border-line-strong bg-quiet p-0.5">
          {BY.map(b => (
            <button
              key={b.key} type="button" aria-pressed={by === b.key} onClick={() => { onBy(b.key); setAll(false); }}
              className={`rounded-md px-3 py-1 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                by === b.key ? "bg-tile text-white" : "text-ink-2 hover:text-ink"
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      {/* The legend carries the totals, so it doubles as the headline split. */}
      <ul className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))] gap-x-4 gap-y-2">
        {BAND_LABEL.map((label, i) =>
          bands[i] === 0 && i === BANDS.length ? null : (
            <li key={label} className="flex items-start gap-2">
              <span aria-hidden className={`mt-1 h-3 w-3 flex-none rounded-sm ${BAND_BG[i]}`} />
              <span className="text-sm leading-tight text-ink-2">
                {label}
                <span className="block font-semibold tabular-nums text-ink">
                  {fmtInt(bands[i])}
                  <span className="ml-1.5 font-normal text-muted">{total ? Math.round((bands[i] / total) * 100) : 0}%</span>
                </span>
              </span>
            </li>
          ),
        )}
      </ul>

      {groups.length === 0 ? (
        <p className="mt-6 rounded-lg bg-quiet px-4 py-6 text-center text-sm text-ink-2">No stock matches these filters.</p>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-[7.5rem_minmax(0,1fr)_4rem] gap-x-3 pb-1 text-xs text-muted sm:grid-cols-[10rem_minmax(0,1fr)_4.5rem_4.5rem]">
            <span>{BY.find(b => b.key === by)!.label}</span>
            <span />
            <span className="text-right">Units</span>
            <span className="hidden text-right sm:block">Over 1 yr</span>
          </div>
          <ol className="flex flex-col">
            {shown.map((g, idx) => {
              const on = selected === g.label;
              const summary = `${g.label}: ${fmtInt(g.units)} units. ${g.bands.map((n, i) => (n ? `${BAND_LABEL[i]} ${fmtInt(n)}` : "")).filter(Boolean).join(", ")}.`;
              return (
                <li
                  key={g.label}
                  className={`grid grid-cols-[7.5rem_minmax(0,1fr)_4rem] items-center gap-x-3 rounded-md border-t border-line py-1.5 first:border-t-0 sm:grid-cols-[10rem_minmax(0,1fr)_4.5rem_4.5rem] ${on ? "bg-quiet" : ""}`}
                >
                  <button
                    type="button" onClick={() => onPick(on ? "" : g.label)} aria-pressed={on}
                    title={on ? `Remove the ${g.label} filter` : `Show only ${g.label}`}
                    className="truncate rounded px-1 text-left text-sm font-semibold text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
                  >
                    {g.label}
                    <span className="sr-only"> ({g.outlets} outlets)</span>
                  </button>
                  <div role="img" aria-label={summary} className="h-6">
                    <div
                      // Remounts with the grouping, so the bars redraw when the view changes.
                      key={by} className="grow-x flex h-full gap-px"
                      style={{ width: `${(g.units / max) * 100}%`, ["--i" as string]: idx }}
                    >
                      {g.bands.map((n, i) =>
                        n > 0 ? (
                          <span
                            key={i} title={`${BAND_LABEL[i]}: ${fmtInt(n)} units`}
                            className={`h-full min-w-[2px] first:rounded-l-sm last:rounded-r-sm ${BAND_BG[i]}`}
                            style={{ flex: `${n} 1 0` }}
                          />
                        ) : null,
                      )}
                    </div>
                  </div>
                  <span className="text-right text-sm font-semibold tabular-nums text-ink">{fmtInt(g.units)}</span>
                  <span className="hidden text-right text-sm tabular-nums text-ink-2 sm:block">
                    {g.units ? Math.round((g.overYearUnits / g.units) * 100) : 0}%
                  </span>
                </li>
              );
            })}
          </ol>
          {groups.length > SHOWN && (
            <button
              type="button" onClick={() => setAll(a => !a)}
              className="mt-2 rounded px-1 text-sm font-semibold text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              {all ? `Show top ${SHOWN}` : `Show all ${groups.length}`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
