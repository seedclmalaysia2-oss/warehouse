"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Sort, SortKey } from "./outlet-table";

type Option = { value: string; count: number };

type Common = {
  label: string;
  sortKey: SortKey;
  sort: Sort;
  onSort: (s: Sort) => void;
  /** Wording for the two sort directions, e.g. A to Z / Z to A. */
  sortWords: [string, string];
  align?: "left" | "right";
};

type Props =
  | (Common & { kind: "list"; options: Option[]; selected: Set<string>; onSelected: (s: Set<string>) => void; searchHint: string })
  | (Common & { kind: "range"; min: string; max: string; onRange: (min: string, max: string) => void });

const WIDTH = 272;

// A column header that opens a small panel: sort, then choose what to show.
// The panel is portalled and fixed-positioned because the table sits inside
// scrolling, clipped wrappers.
export function ColumnMenu(props: Props) {
  const { label, sortKey, sort, onSort, sortWords, align = "left" } = props;
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [q, setQ] = useState("");
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const active = props.kind === "list" ? props.selected.size > 0 : props.min !== "" || props.max !== "";
  const sorted = sort.key === sortKey;

  const place = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const left = align === "right" ? r.right - WIDTH : r.left;
    setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(left, window.innerWidth - WIDTH - 8)) });
  };

  useLayoutEffect(() => { if (open) place(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !btn.current?.contains(t)) setOpen(false);
    };
    const onMove = (e: Event) => { if (!panel.current?.contains(e.target as Node)) place(); };
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", onMove, true);
    panel.current?.querySelector<HTMLElement>("input, button")?.focus();
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const shownOptions = useMemo(() => {
    if (props.kind !== "list") return [];
    const s = q.trim().toLowerCase();
    return s ? props.options.filter(o => o.value.toLowerCase().includes(s)) : props.options;
  }, [props, q]);

  const sortBtn = (dir: "asc" | "desc", text: string) => {
    const on = sorted && sort.dir === dir;
    return (
      <button
        type="button" onClick={() => { onSort({ key: sortKey, dir }); setOpen(false); }} aria-pressed={on}
        className={`flex-1 rounded-md border px-2 py-1.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand ${
          on ? "border-tile bg-tile text-white" : "border-line-strong text-ink-2 hover:border-brand hover:text-ink"
        }`}
      >
        {text}
      </button>
    );
  };

  return (
    <>
      <button
        ref={btn} type="button" aria-haspopup="dialog" aria-expanded={open}
        onClick={() => { setOpen(o => !o); setQ(""); }}
        className={`inline-flex items-center gap-1 rounded font-semibold hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${align === "right" ? "flex-row-reverse" : ""} ${active || sorted ? "text-ink" : ""}`}
      >
        {label}
        {sorted && <span aria-hidden className="text-xs">{sort.dir === "asc" ? "▲" : "▼"}</span>}
        <span aria-hidden className="text-xs text-muted">▾</span>
        {active && <span aria-hidden className="h-2 w-2 rounded-full bg-brand" />}
        {active && <span className="sr-only">(filtered)</span>}
      </button>

      {open && pos && createPortal(
        <div
          ref={panel} role="dialog" aria-label={`${label} sort and filter`}
          onKeyDown={e => { if (e.key === "Escape") { setOpen(false); btn.current?.focus(); } }}
          style={{ position: "fixed", top: pos.top, left: pos.left, width: WIDTH }}
          className="z-50 flex flex-col gap-3 rounded-xl border border-line-strong bg-surface p-3 text-ink shadow-lift"
        >
          <div className="flex gap-2">{sortBtn("asc", sortWords[0])}{sortBtn("desc", sortWords[1])}</div>

          {props.kind === "list" ? (
            <>
              <input
                type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={props.searchHint}
                aria-label={`Search ${label.toLowerCase()} values`}
                className="rounded-lg border border-line-strong bg-page px-3 py-1.5 text-sm placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
              />
              <ul className="max-h-60 overflow-y-auto rounded-lg border border-line">
                {shownOptions.length === 0 && <li className="px-3 py-3 text-sm text-ink-2">Nothing matches.</li>}
                {shownOptions.map(o => (
                  <li key={o.value}>
                    <label className="flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-sm hover:bg-quiet">
                      <input
                        type="checkbox" checked={props.selected.has(o.value)}
                        onChange={() => {
                          const n = new Set(props.selected);
                          if (!n.delete(o.value)) n.add(o.value);
                          props.onSelected(n);
                        }}
                        className="h-4 w-4 flex-none accent-[var(--ink-600)]"
                      />
                      <span className="min-w-0 flex-1 truncate">{o.value}</span>
                      <span className="flex-none tabular-nums text-muted">{o.count}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="text-ink-2">
                  {props.selected.size ? `${props.selected.size} chosen` : "Showing all"}
                </span>
                <span className="flex gap-3">
                  {q.trim() && shownOptions.length > 0 && (
                    <button
                      type="button" className="font-semibold text-brand hover:underline"
                      onClick={() => props.onSelected(new Set([...props.selected, ...shownOptions.map(o => o.value)]))}
                    >
                      Choose these {shownOptions.length}
                    </button>
                  )}
                  {props.selected.size > 0 && (
                    <button type="button" className="font-semibold text-brand hover:underline" onClick={() => props.onSelected(new Set())}>
                      Show all
                    </button>
                  )}
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                {([["At least", "min"], ["At most", "max"]] as const).map(([text, k]) => (
                  <label key={k} className="flex flex-col gap-1 text-sm font-semibold text-ink-2">
                    {text}
                    <input
                      type="number" inputMode="numeric" min={0} value={props[k]} placeholder="Any"
                      onChange={e => props.onRange(k === "min" ? e.target.value : props.min, k === "max" ? e.target.value : props.max)}
                      className="rounded-lg border border-line-strong bg-page px-3 py-1.5 text-sm font-normal tabular-nums text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
                    />
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[["Nothing out", "0", "0"], ["Under 100", "", "99"], ["100 to 499", "100", "499"], ["500 and over", "500", ""]].map(([t, lo, hi]) => (
                  <button
                    key={t} type="button" onClick={() => props.onRange(lo, hi)}
                    className="rounded-full border border-line-strong px-2.5 py-0.5 text-sm text-ink-2 hover:border-brand hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
                  >
                    {t}
                  </button>
                ))}
              </div>
              {active && (
                <button type="button" className="self-start text-sm font-semibold text-brand hover:underline" onClick={() => props.onRange("", "")}>
                  Show all
                </button>
              )}
            </>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
