"use client";
import { ageText, fmtInt, type AgedLine } from "@/lib/consignment/analyze";

const SHOWN = 6;

// Two short lists for the first thing a person asks of this page: what do I
// need to go and swap? The workbook's red text is a manual flag, so the second
// list catches old stock nobody has flagged yet.
export function Attention({ lines, onPick }: { lines: AgedLine[]; onPick: (outlet: string) => void }) {
  const byAge = (a: AgedLine, b: AgedLine) => (b.days ?? -1) - (a.days ?? -1) || b.qty - a.qty;
  const flagged = lines.filter(l => l.needsRefresh).sort(byAge);
  const unflagged = lines.filter(l => !l.needsRefresh && l.band === 3).sort(byAge);

  return (
    <section className="flex flex-col gap-5 rounded-xl border border-line bg-surface p-5" aria-label="Stock to act on">
      <List
        title="Refresh first"
        note="Marked in red in the workbook"
        lines={flagged} tone="danger" onPick={onPick}
        empty="Nothing is marked for refresh in this view."
      />
      <List
        title="Over 2 years, not marked"
        note="Old enough to check, but not flagged"
        lines={unflagged} tone="plain" onPick={onPick}
        empty="No unmarked stock is over 2 years old."
      />
    </section>
  );
}

function List({ title, note, lines, tone, onPick, empty }: {
  title: string; note: string; lines: AgedLine[]; tone: "danger" | "plain"; onPick: (o: string) => void; empty: string;
}) {
  const units = lines.reduce((s, l) => s + l.qty, 0);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
        {lines.length > 0 && (
          <span className="text-sm tabular-nums text-ink-2">
            {lines.length} CSG{lines.length === 1 ? "" : "s"}, {fmtInt(units)} units
          </span>
        )}
      </div>
      <p className="text-sm text-muted">{note}</p>
      {lines.length === 0 ? (
        <p className="mt-2 rounded-lg bg-quiet px-3 py-3 text-sm text-ink-2">{empty}</p>
      ) : (
        <ul className="mt-2 flex flex-col">
          {lines.slice(0, SHOWN).map((l, i) => (
            <li key={`${l.outlet}|${l.csgNo}|${l.product}|${i}`} className="border-t border-line first:border-t-0">
              <button
                type="button" onClick={() => onPick(l.outlet)} title={`Open ${l.outlet} in the outlet list`}
                className="flex w-full items-center justify-between gap-3 rounded-md px-1 py-2 text-left hover:bg-quiet focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-ink">{l.outlet}</span>
                  <span className="block truncate text-sm text-ink-2">{l.product}{l.csgNo ? `, ${l.csgNo}` : ""}</span>
                </span>
                <span className="flex-none text-right">
                  <span className={`block text-sm font-semibold tabular-nums ${tone === "danger" ? "text-danger" : "text-ink"}`}>{ageText(l.days)}</span>
                  <span className="block text-sm tabular-nums text-ink-2">{fmtInt(l.qty)} units</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {lines.length > SHOWN && (
        <p className="mt-1 text-sm text-muted">Oldest {SHOWN} of {lines.length}. The outlet list below has the rest.</p>
      )}
    </div>
  );
}
