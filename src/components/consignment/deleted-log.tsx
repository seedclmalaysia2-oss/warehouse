"use client";
import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import type { TrashEntry } from "@/lib/consignment/trash-store";
import { forgetDetails } from "./csg-details";
import { docKey } from "@/lib/consignment/analyze";

const HIDE_KEY = "warehouse.deletedLog.hidden";
const when = (s: string) =>
  new Date(s).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur" });
const who = (s: string | null) => (s ? s.split("@")[0] : "unknown");
const boxes = (n: number) => `${n.toLocaleString("en-MY")} ${n === 1 ? "box" : "boxes"}`;

/**
 * Every CSG / CSR file deleted at this outlet, newest first, with Restore. Kept
 * apart from the live list above (dashed, muted) and can be hidden, so a deleted
 * file is never mistaken for one that is still on the outlet.
 */
export function DeletedLog({ entries, ready }: { entries: TrashEntry[]; /** False until SQL 0008 is applied. */ ready: boolean }) {
  const router = useRouter();
  const body = useId();
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    try { setHidden(localStorage.getItem(HIDE_KEY) === "1"); } catch { /* storage blocked: stay shown */ }
  }, []);
  const toggle = () => {
    const next = !hidden;
    setHidden(next);
    try { localStorage.setItem(HIDE_KEY, next ? "1" : "0"); } catch { /* fine */ }
  };

  async function restore(e: TrashEntry) {
    const what = e.kind === "CSR"
      ? `Restore ${e.code}? Its ${boxes(e.boxes)} come off the CSG again.`
      : `Restore the CSG file for ${e.code}? Details come back exactly as they were before the delete.`;
    if (!window.confirm(what)) return;
    setBusy(e.id);
    setMsg(null);
    try {
      const res = await fetch(`/api/consignment/trash/${e.id}/restore`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg({ ok: false, text: json.error ?? "Could not restore it." }); return; }
      forgetDetails(docKey(e.kind === "CSR" ? e.code.replace(/^CSR/, "CSG") : e.code));
      setMsg({ ok: true, text: `${e.code} restored.` });
      router.refresh();
    } catch {
      setMsg({ ok: false, text: "Could not restore it. Check your connection and try again." });
    } finally {
      setBusy(null);
    }
  }

  const open = entries.filter(e => !e.restoredAt).length;

  return (
    <section aria-labelledby="deleted-h" className="rounded-xl border border-dashed border-line-strong bg-quiet/60 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <h2 id="deleted-h" className="flex items-center gap-2 font-display text-base font-semibold text-ink-2">
            <TrashIcon />
            Deleted files
            <span className="rounded-full border border-line-strong px-2 py-0.5 text-xs font-semibold tabular-nums text-ink-2">{entries.length}</span>
          </h2>
          <p className="text-sm text-muted">
            {!ready
              ? "The delete log starts once SQL 0008 is applied in Supabase. Until then deletes are not kept."
              : entries.length
                ? `A log of every CSG and CSR file deleted here. Not part of the outlet's stock.${open ? ` ${open} can be restored.` : ""}`
                : "Nothing has been deleted at this outlet. Deleted CSG and CSR files are kept here so they can be restored."}
          </p>
        </div>
        {entries.length > 0 && (
          <button
            type="button" onClick={toggle} aria-expanded={!hidden} aria-controls={body}
            className="whitespace-nowrap rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm font-semibold text-ink-2 hover:border-brand hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
          >
            {hidden ? "Show" : "Hide"}
          </button>
        )}
      </div>

      {msg && (
        <p role="status" className={`border-t border-line px-4 py-2 text-sm font-semibold ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</p>
      )}

      {!hidden && entries.length > 0 && (
        <div id={body} className="overflow-x-auto border-t border-dashed border-line-strong">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted">
                <th scope="col" className="px-4 py-2 font-semibold">File</th>
                <th scope="col" className="px-2 py-2 text-right font-semibold">Boxes</th>
                <th scope="col" className="px-2 py-2 font-semibold">Deleted</th>
                <th scope="col" className="px-2 py-2 font-semibold">Status</th>
                <th scope="col" className="px-4 py-2"><span className="sr-only">Action</span></th>
              </tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.id} className="border-t border-line align-top">
                  <td className="px-4 py-2.5">
                    <span className={`mr-2 rounded px-1.5 py-0.5 text-[0.6875rem] font-bold ${e.kind === "CSR" ? "bg-brand/15 text-brand" : "bg-line text-ink-2"}`}>{e.kind}</span>
                    <span className={`font-mono font-semibold ${e.restoredAt ? "text-ink" : "text-ink-2 line-through decoration-danger/60"}`}>{e.code}</span>
                    {e.fileName && <p className="mt-0.5 truncate text-xs text-muted" title={e.fileName}>{e.fileName}</p>}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-ink-2">{e.boxes.toLocaleString("en-MY")}</td>
                  <td className="px-2 py-2.5 text-ink-2">
                    {when(e.deletedAt)}
                    <p className="text-xs text-muted">by {who(e.deletedBy)}</p>
                  </td>
                  <td className="px-2 py-2.5">
                    {e.restoredAt ? (
                      <span className="text-ok">
                        Restored
                        <span className="block text-xs text-muted">{when(e.restoredAt)} by {who(e.restoredBy)}</span>
                      </span>
                    ) : (
                      <span className="text-danger">Deleted</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {!e.restoredAt && (
                      <button
                        type="button" disabled={busy !== null} onClick={() => restore(e)}
                        className="whitespace-nowrap rounded-md border border-line-strong bg-surface px-2.5 py-1 text-xs font-semibold text-ink-2 hover:border-ok hover:text-ok focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand disabled:opacity-50"
                      >
                        {busy === e.id ? "Restoring…" : "Restore"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4 text-muted" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 5.5h13M8 5.5V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M5.5 5.5l.7 10a1.5 1.5 0 0 0 1.5 1.4h4.6a1.5 1.5 0 0 0 1.5-1.4l.7-10" />
    </svg>
  );
}
