"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Kind = "issue" | "receive";
type Result = { ok: true; documents: number; rowsAdded: number; rowsUpdated: number } | { ok: false; error: string };

// One drop zone per report type, so a Receive listing can't be filed as an Issue.
export function UploadBox({ kind, title }: { kind: Kind; title: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function send(file: File) {
    setBusy(true);
    setResult(null);
    try {
      const body = new FormData();
      body.set("kind", kind);
      body.set("file", file);
      const res = await fetch("/api/exchange-stock/import", { method: "POST", body });
      const json = await res.json().catch(() => ({}));
      setResult(res.ok ? { ok: true, ...json } : { ok: false, error: json.error ?? "Upload failed." });
      if (res.ok) router.refresh();
    } catch {
      setResult({ ok: false, error: "Upload failed. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
      <p className="mt-1 text-sm text-ink-2">The daily &ldquo;{title} - By Document Number&rdquo; report, as .xlsx. Uploading the same day again updates it, never duplicates.</p>
      <label
        onDragOver={e => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={e => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) send(f); }}
        className={`mt-3 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-8 text-sm transition-colors ${over ? "border-brand bg-quiet" : "border-line-strong"} ${busy ? "opacity-60" : ""}`}
      >
        <span className="font-semibold text-ink">{busy ? "Reading…" : "Drop the .xlsx here or click to choose"}</span>
        <input
          type="file" accept=".xlsx" className="sr-only" disabled={busy}
          onChange={e => { const f = e.target.files?.[0]; if (f) send(f); e.target.value = ""; }}
        />
      </label>
      {result && (
        <p className={`mt-3 text-sm ${result.ok ? "text-ok" : "text-danger"}`} role="status">
          {result.ok
            ? `Saved ${result.documents} document${result.documents === 1 ? "" : "s"}: ${result.rowsAdded} new line${result.rowsAdded === 1 ? "" : "s"}, ${result.rowsUpdated} updated.`
            : result.error}
        </p>
      )}
    </section>
  );
}
