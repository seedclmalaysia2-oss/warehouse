"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Status = "returned" | "waived" | "open";

// Manual override on an issue line: returned outside the system, waived, or back to open.
export function ResolveButtons({ issueId, resolved }: { issueId: number; resolved: "returned" | "waived" | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function set(status: Status) {
    const note = status === "open" ? "" : window.prompt(status === "returned" ? "Note (optional): how was it returned?" : "Note (optional): why waive?") ?? null;
    if (note === null) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/exchange-stock/resolve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ issueId, status, note }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Could not save.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  const btn = "rounded-md border border-line-strong bg-surface px-2 py-1 text-xs font-semibold text-ink-2 transition-colors hover:border-brand hover:text-ink disabled:opacity-50";
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {resolved ? (
        <button className={btn} disabled={busy} onClick={() => set("open")}>Reopen</button>
      ) : (
        <>
          <button className={btn} disabled={busy} onClick={() => set("returned")}>Mark returned</button>
          <button className={btn} disabled={busy} onClick={() => set("waived")}>Waive</button>
        </>
      )}
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  );
}
