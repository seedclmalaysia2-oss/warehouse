"use client";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { fmtInt, outletHref, type OutletChoice } from "@/lib/consignment/analyze";

const WIDTH = 340;

/**
 * Jumps to another outlet without going back to the list. With over 200 outlets
 * a plain select is too slow to scan, so it searches as you type. `from` keeps
 * the breadcrumb pointing at the list view the user came from.
 */
export function OutletSwitcher({ outlets, current, from }: { outlets: OutletChoice[]; current: string; from: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? outlets.filter(o => `${o.name} ${o.place}`.toLowerCase().includes(s)) : outlets;
  }, [outlets, q]);

  const place = () => {
    const r = btn.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - WIDTH - 8)) });
  };
  useLayoutEffect(() => { if (open) place(); }, [open]);

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
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open]);

  useEffect(() => {
    if (open && pos) list.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, pos, active]);

  const toggle = () => {
    setQ("");
    // Opens on this outlet, so its neighbours are in view.
    setActive(Math.max(0, outlets.findIndex(o => o.key === current)));
    setOpen(o => !o);
  };
  const choose = (o: OutletChoice) => {
    setOpen(false);
    if (o.key !== current) router.push(outletHref(o.key, from));
  };
  const close = () => {
    setOpen(false);
    btn.current?.focus();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") close();
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (shown.length) setActive(a => (a + (e.key === "ArrowDown" ? 1 : -1) + shown.length) % shown.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (shown[active]) choose(shown[active]);
    }
  };

  return (
    <>
      <button
        ref={btn} type="button" aria-haspopup="dialog" aria-expanded={open} onClick={toggle}
        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm font-semibold text-ink-2 transition-colors hover:border-brand hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        Change outlet
        <span aria-hidden className="text-xs text-muted">▾</span>
      </button>

      {open && pos && createPortal(
        <div
          ref={panel} role="dialog" aria-label="Change outlet" onKeyDown={onKey}
          style={{ position: "fixed", top: pos.top, left: pos.left, width: `min(${WIDTH}px, calc(100vw - 16px))` }}
          className="z-50 flex flex-col gap-2 rounded-xl border border-line-strong bg-surface p-3 text-ink shadow-lift"
        >
          <input
            autoFocus type="search" value={q} placeholder="Search outlet, town or state"
            role="combobox" aria-expanded aria-controls={listId} aria-label="Search outlets"
            aria-activedescendant={shown[active] ? `${listId}-${active}` : undefined}
            onChange={e => { setQ(e.target.value); setActive(0); }}
            className="rounded-lg border border-line-strong bg-page px-3 py-1.5 text-sm placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
          />
          <ul ref={list} id={listId} role="listbox" aria-label="Outlets" className="max-h-72 overflow-y-auto rounded-lg border border-line">
            {shown.length === 0 && <li className="px-3 py-3 text-sm text-ink-2">Nothing matches.</li>}
            {shown.map((o, i) => (
              <li
                key={o.key} id={`${listId}-${i}`} data-i={i} role="option" aria-selected={o.key === current}
                onClick={() => choose(o)} onPointerMove={() => setActive(i)}
                className={`flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-sm ${i === active ? "bg-quiet" : ""}`}
              >
                <span className="min-w-0 flex-1">
                  <span className={`block truncate ${o.key === current ? "font-bold" : "font-semibold"} text-ink`}>{o.name}</span>
                  {o.place && <span className="block truncate text-ink-2">{o.place}</span>}
                </span>
                {o.key === current
                  ? <span className="flex-none text-sm font-semibold text-ink-2">Open now</span>
                  : <span className="flex-none tabular-nums text-muted">{fmtInt(o.units)}</span>}
              </li>
            ))}
          </ul>
          <p aria-live="polite" className="text-sm text-ink-2">
            {shown.length} {shown.length === 1 ? "outlet" : "outlets"}, with units on the right
          </p>
        </div>,
        document.body,
      )}
    </>
  );
}
