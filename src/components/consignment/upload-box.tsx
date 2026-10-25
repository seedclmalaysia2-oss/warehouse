"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Result =
  | { ok: true; outlets: number; lines: number; units: number; sheets: { name: string; outlets: number; lines: number }[]; ignoredSheets: string[]; warnings: string[] }
  | { ok: false; error: string };

export function UploadBox() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function send(file: File) {
    setBusy(true);
    setResult(null);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch("/api/consignment/import", { method: "POST", body });
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
    <section className="rounded-xl border border-line bg-surface p-5">
      <h2 className="font-display text-lg font-semibold text-ink">Consignment workbook</h2>
      <p className="mt-1 max-w-[60ch] text-sm text-ink-2">
        The &ldquo;CSG ALL_ECP_Consignment_Stock&rdquo; .xlsx, with one sheet per salesperson. Each upload replaces the
        previous figures, so upload the whole workbook every time it changes.
      </p>
      <label
        onDragOver={e => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={e => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) send(f); }}
        className={`mt-4 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-10 text-sm transition-colors focus-within:border-brand ${over ? "border-brand bg-quiet" : "border-line-strong"} ${busy ? "opacity-60" : ""}`}
      >
        <span className="font-semibold text-ink">{busy ? "Reading the workbook…" : "Drop the .xlsx here or click to choose"}</span>
        <span className="text-ink-2">4 MB at most</span>
        <input
          type="file" accept=".xlsx" className="sr-only" disabled={busy}
          onChange={e => { const f = e.target.files?.[0]; if (f) send(f); e.target.value = ""; }}
        />
      </label>

      <div role="status" aria-live="polite">
        {result && !result.ok && <p className="mt-4 text-sm text-danger">{result.error}</p>}
        {result?.ok && (
          <div className="mt-4 text-sm text-ink-2">
            <p className="font-semibold text-ok">
              Saved {result.units.toLocaleString("en-US")} units across {result.outlets} outlets ({result.lines} CSG lines).
            </p>
            <ul className="mt-2 list-disc pl-5">
              {result.sheets.map(s => <li key={s.name}>{s.name}: {s.outlets} outlets, {s.lines} CSG lines</li>)}
            </ul>
            {result.ignoredSheets.length > 0 && (
              <p className="mt-2">Not counted, because they repeat the outlet sheets: {result.ignoredSheets.join(", ")}.</p>
            )}
            {result.warnings.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer font-semibold text-ink">{result.warnings.length} entries to check in the workbook</summary>
                <ul className="mt-1 list-disc pl-5">{result.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
              </details>
            )}
            <a href="/consignment" className="mt-3 inline-block font-semibold text-brand hover:underline">See the consignment overview</a>
          </div>
        )}
      </div>
    </section>
  );
}
