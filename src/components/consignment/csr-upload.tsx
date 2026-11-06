"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { forgetDetails } from "./csg-details";

type Doc = {
  code: string;
  csgKey: string | null;
  outlet: string;
  boxes: number;
  state: "saved" | "confirm" | "no-csg" | "not-csr";
  reason?: string;
  left?: number;
  short?: { description: string; power: string | null; qty: number }[];
};
type Row =
  | { name: string; state: "waiting" | "sending" }
  | { name: string; state: "done"; docs: Doc[]; warnings: string[] }
  | { name: string; state: "confirm"; docs: Doc[]; file: File }
  | { name: string; state: "skipped"; docs: Doc[] }
  | { name: string; state: "error"; error: string };

const n = (x: number, one: string, many = `${one}s`) => `${x.toLocaleString("en-MY")} ${x === 1 ? one : many}`;

// The paperwork runs CSG, then CSA, then CSR. CSA can be skipped, but not
// silently: a CSR whose CSG has no CSA waits for the user's go-ahead.
const STEPS = [
  { label: "CSG", note: "stock goes out" },
  { label: "CSA", note: "optional" },
  { label: "CSR", note: "this upload" },
];

export function CsrUpload({ onClose }: { onClose?: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const touched = useRef(new Set<string>());

  const set = (i: number, r: Row) => setRows(prev => prev.map((p, j) => (j === i ? r : p)));

  async function post(file: File, proceed: boolean): Promise<Row> {
    try {
      const body = new FormData();
      body.set("file", file);
      if (proceed) body.set("proceed", "1");
      const res = await fetch("/api/consignment/returns", { method: "POST", body });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return { name: file.name, state: "error", error: json.error ?? "Upload failed." };
      const docs: Doc[] = json.docs ?? [];
      for (const d of docs) if (d.state === "saved" && d.csgKey) touched.current.add(d.csgKey);
      return json.needsConfirm
        ? { name: file.name, state: "confirm", docs, file }
        : { name: file.name, state: "done", docs, warnings: json.warnings ?? [] };
    } catch {
      return { name: file.name, state: "error", error: "Upload failed. Check your connection and try again." };
    }
  }

  function finish() {
    if (touched.current.size === 0) return;
    touched.current.forEach(forgetDetails);
    touched.current.clear();
    router.refresh();
  }

  async function sendAll(files: File[]) {
    if (!files.length) return;
    setBusy(true);
    setRows(files.map(f => ({ name: f.name, state: "waiting" })));
    for (let i = 0; i < files.length; i++) {
      set(i, { name: files[i].name, state: "sending" });
      set(i, await post(files[i], false));
    }
    setBusy(false);
    finish();
  }

  // The user chose to go ahead without a CSA for the files that asked.
  async function proceedAll() {
    setBusy(true);
    const idx = rows.flatMap((r, i) => (r.state === "confirm" ? [i] : []));
    for (const i of idx) {
      const r = rows[i];
      if (r.state !== "confirm") continue;
      set(i, { name: r.name, state: "sending" });
      set(i, await post(r.file, true));
    }
    setBusy(false);
    finish();
  }

  function skipAll() {
    setRows(prev => prev.map(r => (r.state === "confirm" ? { name: r.name, state: "skipped", docs: r.docs } : r)));
  }

  const waiting = rows.filter((r): r is Extract<Row, { state: "confirm" }> => r.state === "confirm");
  const waitingDocs = waiting.flatMap(r => r.docs.filter(d => d.state === "confirm"));
  const done = rows.filter((r): r is Extract<Row, { state: "done" }> => r.state === "done");
  const savedDocs = done.flatMap(r => r.docs.filter(d => d.state === "saved"));
  const finished = !busy && rows.length > 0 && waiting.length === 0;

  return (
    <section className="rounded-xl border border-line bg-surface p-5" aria-labelledby="csr-h">
      <div className="flex items-start justify-between gap-4">
        <h2 id="csr-h" className="font-display text-lg font-semibold text-ink">Upload CSR files</h2>
        {onClose && (
          <button
            type="button" onClick={onClose}
            className="rounded px-2 py-1 text-sm font-semibold text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-brand"
          >
            Close
          </button>
        )}
      </div>

      <ol className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm" aria-label="Order of the paperwork">
        {STEPS.map((s, i) => (
          <li key={s.label} className="flex items-center gap-2" aria-current={s.label === "CSR" ? "step" : undefined}>
            {i > 0 && <span aria-hidden className="text-muted">then</span>}
            <span className={`rounded-full border px-3 py-0.5 ${s.label === "CSR" ? "border-tile bg-tile font-semibold text-white" : "border-line-strong text-ink-2"}`}>
              {s.label} <span className="text-xs opacity-80">{s.note}</span>
            </span>
          </li>
        ))}
      </ol>

      <p className="mt-3 max-w-[64ch] text-sm text-ink-2">
        A CSR is matched to its CSG by number: CSR03935(1) comes off CSG03935. The boxes on the CSR are taken off that CSG in
        Details, the outlet&apos;s balance is brought in line, and the CSR&apos;s number is shown beside the CSG as the latest
        one. A file can hold one CSR or many, and more than one file is fine.
      </p>

      <label
        onDragOver={e => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={e => { e.preventDefault(); setOver(false); if (!busy && waiting.length === 0) sendAll([...e.dataTransfer.files]); }}
        className={`mt-4 flex cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg border-2 border-dashed px-5 py-5 text-sm transition-colors focus-within:border-brand hover:border-brand ${over ? "border-brand bg-quiet" : "border-line-strong"} ${busy || waiting.length ? "opacity-60" : ""}`}
      >
        <span className="font-semibold text-ink">{busy ? "Reading the CSRs…" : "Drop the CSR .xlsx files or click to choose"}</span>
        <span className="text-xs text-ink-2">Any number of CSRs per file · 4 MB max</span>
        <input
          type="file" accept=".xlsx" multiple className="sr-only" disabled={busy || waiting.length > 0}
          onChange={e => { const f = [...(e.target.files ?? [])]; e.target.value = ""; sendAll(f); }}
        />
      </label>

      <div role="status" aria-live="polite">
        {waiting.length > 0 && !busy && (
          <div className="mt-4 rounded-lg border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-ink">
            <p className="font-semibold">No CSA on record. Apply these CSRs without one?</p>
            <p className="mt-1 text-ink-2">
              The paperwork runs CSG, then CSA, then CSR. {waitingDocs.length === 1 ? "This CSR has" : "These CSRs have"} a CSG
              but no CSA. Nothing has been saved yet.
            </p>
            <ul className="mt-2 flex flex-col gap-0.5">
              {waitingDocs.map(d => (
                <li key={d.code} className="tabular-nums">
                  <span className="font-mono font-semibold">{d.code}</span>, {n(d.boxes, "box", "boxes")} from {d.outlet || "an outlet"}, for {d.csgKey}
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button" onClick={proceedAll}
                className="rounded-lg bg-brand px-3 py-1.5 font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                Proceed without CSA
              </button>
              <button
                type="button" onClick={skipAll}
                className="rounded-lg border border-line-strong bg-surface px-3 py-1.5 font-semibold text-ink-2 hover:border-brand hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                Don&apos;t apply
              </button>
            </div>
          </div>
        )}

        {rows.length > 0 && (
          <div className="mt-4 text-sm text-ink-2">
            {finished && savedDocs.length > 0 && (
              <p className="rounded-lg bg-quiet px-4 py-3 font-semibold text-ok">
                {n(savedDocs.length, "CSR")} applied: {n(savedDocs.reduce((s, d) => s + d.boxes, 0), "box", "boxes")} taken off{" "}
                {n(new Set(savedDocs.map(d => d.csgKey)).size, "CSG")}.
              </p>
            )}
            <ul className="mt-3 flex flex-col gap-2">
              {rows.map((r, i) => (
                <li key={i}>
                  <span className="font-semibold text-ink">{r.name}</span>{" "}
                  {r.state === "waiting" && <span className="text-muted">Waiting</span>}
                  {r.state === "sending" && <span>Reading…</span>}
                  {r.state === "error" && <span className="text-danger">{r.error}</span>}
                  {r.state === "confirm" && <span className="text-warn">Waiting for your go-ahead</span>}
                  {r.state === "skipped" && <span className="text-muted">Not applied</span>}
                  {r.state === "done" && r.docs.length === 0 && <span className="text-warn">No CSR found in this file.</span>}
                  {(r.state === "done" || r.state === "skipped") && r.docs.length > 0 && (
                    <ul className="mt-0.5 flex flex-col gap-0.5 pl-4">
                      {r.docs.map(d => (
                        <li key={d.code} className="tabular-nums">
                          <span className="font-mono font-semibold text-ink">{d.code}</span>{" "}
                          {r.state === "skipped" && <span className="text-muted">not applied</span>}
                          {r.state === "done" && d.state === "saved" && (
                            <span className="text-ok">
                              {n(d.boxes, "box", "boxes")} taken off {d.csgKey}{d.left !== undefined ? `, ${n(d.left, "box", "boxes")} left` : ""}
                            </span>
                          )}
                          {r.state === "done" && (d.state === "no-csg" || d.state === "not-csr") && <span className="text-danger">{d.reason}</span>}
                          {r.state === "done" && d.state === "confirm" && <span className="text-warn">{d.reason}</span>}
                          {r.state === "done" && d.short && d.short.length > 0 && (
                            <ul className="list-disc pl-5 text-warn">
                              {d.short.map((s, j) => (
                                <li key={j}>{s.description}{s.power ? ` ${s.power}` : ""}: {n(s.qty, "box", "boxes")} not on {d.csgKey}, so nothing was taken off for {s.qty === 1 ? "it" : "them"}.</li>
                              ))}
                            </ul>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {r.state === "done" && r.warnings.length > 0 && (
                    <ul className="mt-0.5 list-disc pl-9 text-warn">{r.warnings.map((w, j) => <li key={j}>{w}</li>)}</ul>
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
