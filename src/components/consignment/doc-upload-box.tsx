"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Row =
  | { name: string; state: "waiting" | "sending" }
  | { name: string; state: "ok"; docs: { csgNo: string; toCounter: string; boxes: number }[]; warnings: string[] }
  | { name: string; state: "error"; error: string };

export function DocUploadBox() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);

  async function sendAll(files: File[]) {
    if (!files.length) return;
    setBusy(true);
    setRows(files.map(f => ({ name: f.name, state: "waiting" })));
    const set = (i: number, r: Row) => setRows(prev => prev.map((p, j) => (j === i ? r : p)));
    // One request per file, in turn, so each file reports on its own.
    for (let i = 0; i < files.length; i++) {
      set(i, { name: files[i].name, state: "sending" });
      try {
        const body = new FormData();
        body.set("file", files[i]);
        const res = await fetch("/api/consignment/docs", { method: "POST", body });
        const json = await res.json().catch(() => ({}));
        set(i, res.ok
          ? { name: files[i].name, state: "ok", docs: json.docs ?? [], warnings: json.warnings ?? [] }
          : { name: files[i].name, state: "error", error: json.error ?? "Upload failed." });
      } catch {
        set(i, { name: files[i].name, state: "error", error: "Upload failed. Check your connection and try again." });
      }
    }
    setBusy(false);
    router.refresh();
  }

  const saved = rows.filter(r => r.state === "ok").length;
  const failed = rows.filter(r => r.state === "error").length;

  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <h2 className="font-display text-lg font-semibold text-ink">CSG documents</h2>
      <p className="mt-1 max-w-[60ch] text-sm text-ink-2">
        The ERP&apos;s printed CONSIGNMENT .xlsx, one per CSG number. Choose as many as you like at once. They fill the Details
        button beside each CSG on the consignment page with its colours, powers and quantities. Uploading a CSG again replaces it.
      </p>
      <label
        onDragOver={e => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={e => { e.preventDefault(); setOver(false); if (!busy) sendAll([...e.dataTransfer.files]); }}
        className={`mt-4 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-8 text-sm transition-colors focus-within:border-brand ${over ? "border-brand bg-quiet" : "border-line-strong"} ${busy ? "opacity-60" : ""}`}
      >
        <span className="font-semibold text-ink">{busy ? "Reading the documents…" : "Drop the CSG .xlsx files here or click to choose"}</span>
        <span className="text-ink-2">4 MB at most for each file</span>
        <input
          type="file" accept=".xlsx" multiple className="sr-only" disabled={busy}
          onChange={e => { const f = [...(e.target.files ?? [])]; e.target.value = ""; sendAll(f); }}
        />
      </label>

      <div role="status" aria-live="polite">
        {rows.length > 0 && (
          <div className="mt-4 text-sm text-ink-2">
            {!busy && (
              <p className={`font-semibold ${failed ? "text-danger" : "text-ok"}`}>
                {saved} of {rows.length} {rows.length === 1 ? "file" : "files"} saved{failed ? `, ${failed} could not be read` : ""}.
              </p>
            )}
            <ul className="mt-2 flex flex-col gap-1.5">
              {rows.map((r, i) => (
                <li key={i}>
                  <span className="font-semibold text-ink">{r.name}</span>{" "}
                  {r.state === "waiting" && <span className="text-muted">Waiting</span>}
                  {r.state === "sending" && <span>Reading…</span>}
                  {r.state === "error" && <span className="text-danger">{r.error}</span>}
                  {r.state === "ok" && (
                    <>
                      <span className="text-ok">
                        Saved {r.docs.map(d => `${d.csgNo} (${d.boxes} boxes${d.toCounter ? `, ${d.toCounter}` : ""})`).join(", ")}
                      </span>
                      {r.warnings.length > 0 && (
                        <ul className="mt-0.5 list-disc pl-5 text-warn">{r.warnings.map((w, j) => <li key={j}>{w}</li>)}</ul>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
