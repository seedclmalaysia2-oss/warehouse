"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Done = {
  read: number; added: number; updated: number; unchanged: number;
  replaced: { csgNo: string; was: string }[];
  noOutlet: string[];
  outlets: { name: string; csgs: number }[];
  warnings: string[];
};
type Row =
  | { name: string; state: "waiting" | "sending" }
  | ({ name: string; state: "ok" } & Done)
  | { name: string; state: "error"; error: string };

const n = (x: number, one: string, many = `${one}s`) => `${x.toLocaleString("en-MY")} ${x === 1 ? one : many}`;

// Files from the ERP's CSG "page" export hold many CSG documents each. Every
// document is filed under its CSG number, so it shows up in Details on the
// outlet the workbook lists that CSG under.
export function MultiCsgUpload() {
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
        const res = await fetch("/api/consignment/docs/multi", { method: "POST", body });
        const json = await res.json().catch(() => ({}));
        set(i, res.ok
          ? { name: files[i].name, state: "ok", read: json.read ?? 0, added: json.added ?? 0, updated: json.updated ?? 0, unchanged: json.unchanged ?? 0, replaced: json.replaced ?? [], noOutlet: json.noOutlet ?? [], outlets: json.outlets ?? [], warnings: json.warnings ?? [] }
          : { name: files[i].name, state: "error", error: json.error ?? "Upload failed." });
      } catch {
        set(i, { name: files[i].name, state: "error", error: "Upload failed. Check your connection and try again." });
      }
    }
    setBusy(false);
    router.refresh();
  }

  const ok = rows.filter((r): r is Extract<Row, { state: "ok" }> => r.state === "ok");
  const failed = rows.filter(r => r.state === "error").length;
  const sum = (k: "read" | "added" | "updated" | "unchanged") => ok.reduce((s, r) => s + r[k], 0);
  const noOutlet = ok.flatMap(r => r.noOutlet);
  const outlets = new Map<string, number>();
  for (const r of ok) for (const o of r.outlets) outlets.set(o.name, (outlets.get(o.name) ?? 0) + o.csgs);
  // A CSG that two files of this batch both held: the later file's copy is the one kept.
  const names = new Set(rows.map(r => r.name));
  const twice = ok.flatMap(r => r.replaced.filter(x => names.has(x.was) && x.was !== r.name).map(x => ({ ...x, now: r.name })));

  return (
    <section className="rounded-xl border border-line bg-surface p-5" aria-labelledby="multi-csg-h">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div>
          <h2 id="multi-csg-h" className="font-display text-lg font-semibold text-ink">Upload CSG files</h2>
          <p className="mt-0.5 max-w-[62ch] text-sm text-ink-2">
            Files with many CSGs in them. Each CSG is filed to its own outlet by its number and shows under Details there.
            A CSG is kept once: one that is already stored is not added again.
          </p>
        </div>
        <label
          onDragOver={e => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={e => { e.preventDefault(); setOver(false); if (!busy) sendAll([...e.dataTransfer.files]); }}
          className={`flex min-w-[15rem] cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg border-2 border-dashed px-5 py-3 text-sm transition-colors focus-within:border-brand hover:border-brand ${over ? "border-brand bg-quiet" : "border-line-strong"} ${busy ? "opacity-60" : ""}`}
        >
          <span className="font-semibold text-ink">{busy ? "Filing the CSGs…" : "Drop .xlsx files or click to choose"}</span>
          <span className="text-xs text-ink-2">Several at once, 4 MB at most each</span>
          <input
            type="file" accept=".xlsx" multiple className="sr-only" disabled={busy}
            onChange={e => { const f = [...(e.target.files ?? [])]; e.target.value = ""; sendAll(f); }}
          />
        </label>
      </div>

      <div role="status" aria-live="polite">
        {rows.length > 0 && (
          <div className="mt-4 text-sm text-ink-2">
            {!busy && (
              <div className="rounded-lg bg-quiet px-4 py-3">
                <p className={`font-semibold ${failed ? "text-danger" : "text-ok"}`}>
                  {n(sum("read"), "CSG")} read from {n(ok.length, "file")}{failed ? `, ${failed} could not be read` : ""}.
                </p>
                <p className="mt-1 text-ink">
                  {n(sum("added"), "new CSG")} filed to {n(outlets.size, "outlet")}
                  {sum("updated") > 0 && <>, {n(sum("updated"), "CSG")} updated</>}
                  {sum("unchanged") > 0 && <>, {n(sum("unchanged"), "CSG")} already stored and unchanged</>}.
                </p>
                {noOutlet.length > 0 && (
                  <p className="mt-1 text-warn">
                    {n(noOutlet.length, "CSG")} not in the workbook, so no outlet shows {noOutlet.length === 1 ? "it" : "them"} yet: {noOutlet.slice(0, 12).join(", ")}{noOutlet.length > 12 ? ` and ${noOutlet.length - 12} more` : ""}.
                    {noOutlet.length === 1 ? " It is" : " They are"} stored and will appear once the workbook lists {noOutlet.length === 1 ? "it" : "them"}.
                  </p>
                )}
                {twice.length > 0 && (
                  <p className="mt-1 text-warn">
                    In more than one file, kept once (the later file&apos;s copy): {twice.slice(0, 8).map(t => `${t.csgNo} (${t.was} and ${t.now})`).join(", ")}{twice.length > 8 ? ` and ${twice.length - 8} more` : ""}.
                  </p>
                )}
              </div>
            )}
            <ul className="mt-3 flex flex-col gap-1.5">
              {rows.map((r, i) => (
                <li key={i}>
                  <span className="font-semibold text-ink">{r.name}</span>{" "}
                  {r.state === "waiting" && <span className="text-muted">Waiting</span>}
                  {r.state === "sending" && <span>Reading…</span>}
                  {r.state === "error" && <span className="text-danger">{r.error}</span>}
                  {r.state === "ok" && (
                    <>
                      <span className="text-ok">
                        {n(r.read, "CSG")}: {r.added} new{r.updated ? `, ${r.updated} updated` : ""}{r.unchanged ? `, ${r.unchanged} unchanged` : ""}
                      </span>
                      {r.warnings.length > 0 && (
                        <ul className="mt-0.5 list-disc pl-5 text-warn">{r.warnings.map((w, j) => <li key={j}>{w}</li>)}</ul>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
            {!busy && outlets.size > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer font-semibold text-ink">Outlets filled ({outlets.size})</summary>
                <ul className="mt-1 grid gap-x-6 sm:grid-cols-2">
                  {[...outlets].sort(([a], [b]) => a.localeCompare(b)).map(([name, c]) => (
                    <li key={name} className="flex justify-between gap-3 border-b border-line py-1">
                      <span className="truncate text-ink">{name}</span>
                      <span className="tabular-nums">{c}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
