"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ACCOUNT_PARENT, ageText, fmtDate, fmtInt, isSubAccount, outletHref, outletKey, outletsHref,
  type AgedLine, type Filters,
} from "@/lib/consignment/analyze";
import { BAND_BG } from "./shelf-life";

const SHOWN = 8;

// Desktop columns; on a phone each row folds into a small card.
const COLS = "md:grid-cols-[minmax(0,1.5fr)_minmax(0,1.3fr)_7.5rem_8rem_4.5rem]";
const COLS_OWNER = "md:grid-cols-[minmax(0,1.5fr)_minmax(0,1.3fr)_7.5rem_8rem_4.5rem_6rem]";

const byAge = (a: AgedLine, b: AgedLine) => (b.days ?? -1) - (a.days ?? -1) || b.qty - a.qty;
const sumQty = (ls: AgedLine[]) => ls.reduce((s, l) => s + l.qty, 0);
const csgs = (n: number) => `${fmtInt(n)} CSG${n === 1 ? "" : "s"}`;

type Who = { name: string; marked: number; old: number; markedUnits: number; oldUnits: number };

// What does each person need to go and swap? Pick a salesman to see only their
// stock. The workbook's red text is a manual flag ("marked"), so the second
// list catches old stock nobody has flagged yet.
export function Attention({ lines, filters }: { lines: AgedLine[]; filters: Filters }) {
  const [picked, setPicked] = useState("");

  const people = useMemo(() => {
    const map = new Map<string, Who>();
    for (const l of lines) {
      const name = l.owner || "Unknown";
      const w = map.get(name) ?? { name, marked: 0, old: 0, markedUnits: 0, oldUnits: 0 };
      if (l.needsRefresh) { w.marked++; w.markedUnits += l.qty; }
      else if (l.band === 3) { w.old++; w.oldUnits += l.qty; }
      map.set(name, w);
    }
    const order = (a: Who, b: Who) => b.marked - a.marked || b.old - a.old || a.name.localeCompare(b.name);
    const all = [...map.values()];
    return { main: all.filter(w => !isSubAccount(w.name)).sort(order), subs: all.filter(w => isSubAccount(w.name)).sort(order) };
  }, [lines]);

  // The page's own filters can remove the person who was picked; fall back to everyone.
  const known = [...people.main, ...people.subs].some(w => w.name === picked);
  const who = known ? picked : "";

  const mine = useMemo(() => (who ? lines.filter(l => (l.owner || "Unknown") === who) : lines), [lines, who]);
  const flagged = useMemo(() => mine.filter(l => l.needsRefresh).sort(byAge), [mine]);
  const unflagged = useMemo(() => mine.filter(l => !l.needsRefresh && l.band === 3).sort(byAge), [mine]);
  const scope: Filters = { ...filters, owner: who || filters.owner };

  const totalMarked = people.main.reduce((s, w) => s + w.marked, 0) + people.subs.reduce((s, w) => s + w.marked, 0);

  return (
    <section className="rounded-xl border border-line bg-surface p-5" aria-labelledby="refresh-h">
      <h2 id="refresh-h" className="font-display text-lg font-semibold text-ink">Stock to refresh</h2>
      <p className="mt-0.5 text-sm text-ink-2">Pick a salesman to see what they need to swap, oldest first.</p>

      {/* One pill per person. The red number is how many CSGs are marked for refresh. */}
      <div role="group" aria-label="Salesman" className="-mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-2 [scrollbar-width:none] md:flex-wrap md:overflow-visible [&::-webkit-scrollbar]:hidden">
        <Pill name="All salesmen" marked={totalMarked} on={who === ""} onClick={() => setPicked("")} />
        {people.main.map(w => (
          <Pill key={w.name} name={w.name} marked={w.marked} old={w.old} on={who === w.name} onClick={() => setPicked(w.name)} />
        ))}
        {people.subs.length > 0 && (
          <>
            <span className="flex flex-none items-center gap-2 pl-2 text-xs text-muted">
              <span aria-hidden className="h-5 w-px bg-line-strong" />
              {ACCOUNT_PARENT}&apos;s accounts
            </span>
            {people.subs.map(w => (
              <Pill key={w.name} name={w.name} marked={w.marked} old={w.old} on={who === w.name} onClick={() => setPicked(w.name)} />
            ))}
          </>
        )}
      </div>

      <p className="mt-3 text-sm text-ink" aria-live="polite">
        <span className="font-semibold">{who || "All salesmen"}: </span>
        {flagged.length === 0 && unflagged.length === 0
          ? "all clear. Nothing is marked for refresh and nothing is over 2 years old."
          : `${flagged.length ? `${csgs(flagged.length)} marked for refresh (${fmtInt(sumQty(flagged))} units)` : "nothing marked for refresh"}, ${
              unflagged.length ? `${csgs(unflagged.length)} over 2 years and not marked (${fmtInt(sumQty(unflagged))} units).` : "and nothing over 2 years that is not marked."
            }`}
      </p>

      <div className="mt-5 flex flex-col gap-7">
        <List
          title="Refresh first" note="Marked in red in the workbook" tone="danger"
          lines={flagged} showOwner={!who} more={outletsHref("refresh", scope)}
          empty={who ? `Nothing is marked for refresh for ${who}.` : "Nothing is marked for refresh in this view."}
        />
        <List
          title="Over 2 years, not marked" note="Old enough to check, but not flagged" tone="plain"
          lines={unflagged} showOwner={!who} more={outletsHref("old", scope)}
          empty={who ? `No unmarked stock over 2 years old for ${who}.` : "No unmarked stock is over 2 years old."}
        />
      </div>
    </section>
  );
}

function Pill({ name, marked, old, on, onClick }: { name: string; marked: number; old?: number; on: boolean; onClick: () => void }) {
  const badge = marked > 0
    ? on ? "bg-page text-danger" : "bg-danger text-page"
    : on ? "bg-white/20 text-white" : "bg-quiet text-muted";
  const detail = `${marked} marked for refresh${old ? `, ${old} over 2 years not marked` : ""}`;
  return (
    <button
      type="button" aria-pressed={on} onClick={onClick} title={`${name}: ${detail}`}
      className={`inline-flex flex-none items-center gap-2 rounded-full border py-1 pl-3.5 pr-1.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
        on ? "border-tile bg-tile text-white" : "border-line-strong bg-surface text-ink hover:border-brand"
      }`}
    >
      {name}
      <span className={`min-w-6 rounded-full px-1.5 py-0.5 text-center text-xs font-bold tabular-nums ${badge}`}>
        {marked}
        <span className="sr-only"> marked for refresh</span>
      </span>
    </button>
  );
}

function List({ title, note, lines, tone, showOwner, more, empty }: {
  title: string; note: string; lines: AgedLine[]; tone: "danger" | "plain"; showOwner: boolean; more: string; empty: string;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? lines : lines.slice(0, SHOWN);
  const cols = showOwner ? COLS_OWNER : COLS;

  return (
    <div>
      <div className={`flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-l-4 pl-3 ${tone === "danger" ? "border-danger" : "border-line-strong"}`}>
        <div>
          <h3 className="font-display text-base font-semibold text-ink">{title}</h3>
          <p className="text-sm text-muted">{note}</p>
        </div>
        {lines.length > 0 && (
          <p className="text-sm tabular-nums text-ink-2">
            {csgs(lines.length)}, {fmtInt(sumQty(lines))} units.{" "}
            <Link href={more} className="font-semibold text-ink-2 underline hover:text-ink">See these outlets</Link>
          </p>
        )}
      </div>

      {lines.length === 0 ? (
        <p className="mt-3 rounded-lg bg-quiet px-3 py-3 text-sm text-ink-2">{empty}</p>
      ) : (
        <div className="mt-3 overflow-hidden rounded-lg border border-line">
          <div aria-hidden className={`hidden gap-x-4 border-b border-line bg-quiet px-3 py-1.5 text-xs text-muted md:grid ${cols}`}>
            <span>Outlet</span><span>Product</span><span>CSG</span><span>Age</span><span className="text-right">Units</span>
            {showOwner && <span>Salesman</span>}
          </div>
          <ul>
            {shown.map((l, i) => {
              const place = [l.town, l.state].filter(Boolean).join(", ");
              return (
                <li key={`${l.outlet}|${l.csgNo}|${l.product}|${i}`} className="border-t border-line first:border-t-0">
                  <Link
                    href={outletHref(outletKey(l.outlet))} title={`Open ${l.outlet}`}
                    className={`grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-0.5 px-3 py-2.5 no-underline transition-colors hover:bg-quiet focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand ${cols}`}
                  >
                    <span className="order-1 min-w-0 md:order-none">
                      <span className="block truncate text-sm font-semibold text-ink">{l.outlet}</span>
                      <span className="block truncate text-xs text-muted">
                        {place}
                        {showOwner && <span className="md:hidden">{place ? ", " : ""}{l.owner}</span>}
                      </span>
                    </span>
                    <span className="order-3 col-span-2 min-w-0 truncate text-sm text-ink-2 md:order-none md:col-span-1">{l.product}</span>
                    <span className="order-4 text-sm tabular-nums text-ink-2 md:order-none">
                      {l.csgNo || "No CSG no."}
                      <span className="hidden text-xs text-muted md:block">{fmtDate(l.csgDate)}</span>
                    </span>
                    <span className={`order-2 inline-flex items-center justify-end gap-2 text-sm font-semibold tabular-nums md:order-none md:justify-start ${tone === "danger" ? "text-danger" : "text-ink"}`}>
                      <span aria-hidden className={`h-2.5 w-2.5 flex-none rounded-sm ${BAND_BG[l.band]}`} />
                      {ageText(l.days)}
                    </span>
                    <span className="order-5 text-right text-sm font-semibold tabular-nums text-ink md:order-none">
                      {fmtInt(l.qty)}<span className="font-normal text-ink-2 md:hidden"> {l.qty === 1 ? "unit" : "units"}</span>
                    </span>
                    {showOwner && <span className="hidden truncate text-sm text-ink-2 md:block">{l.owner}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {lines.length > SHOWN && (
        <button
          type="button" onClick={() => setAll(a => !a)}
          className="mt-2 rounded px-1 text-sm font-semibold text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          {all ? `Show the oldest ${SHOWN}` : `Show all ${fmtInt(lines.length)}`}
        </button>
      )}
    </div>
  );
}
