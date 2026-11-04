"use client";
import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { ageText, csgFiles, fmtDate, fmtInt, type CsgGroup } from "@/lib/consignment/analyze";
import { BAND_BG, BAND_LABEL } from "./shelf-life";
import { CsgDetails, forgetDetails } from "./csg-details";
import { Chip, TAG_NOTE } from "./outlet-table";

export type DocMeta = { fileName: string | null; uploadedAt: string; uploadedBy: string | null };

type Sent = { ok: true; csgNos: string[]; warnings: string[] } | { ok: false; error: string };
type RowNote = { busy: boolean; error?: string; warnings?: string[] };
type BulkRow = { name: string; state: "waiting" | "sending" | "saved" | "error"; note?: string };

async function sendFile(file: File, expect: string[]): Promise<Sent> {
  try {
    const body = new FormData();
    body.set("file", file);
    body.set("expect", expect.join(","));
    const res = await fetch("/api/consignment/docs", { method: "POST", body });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: json.error ?? "Upload failed." };
    return { ok: true, csgNos: (json.docs ?? []).map((d: { csgNo: string }) => d.csgNo), warnings: json.warnings ?? [] };
  } catch {
    return { ok: false, error: "Upload failed. Check your connection and try again." };
  }
}

/**
 * The checklist of CSG files this outlet needs. Each CSG takes its own file
 * where it sits; dropping several anywhere on the list files each one under the
 * CSG it belongs to.
 */
export function OutletFiles({ csgs, docs }: { csgs: CsgGroup[]; docs: Record<string, DocMeta> }) {
  const router = useRouter();
  const [notes, setNotes] = useState<Record<string, RowNote>>({});
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<BulkRow[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [over, setOver] = useState(false);

  const uploadable = csgs.filter(c => c.csgNo);
  const expectAll = uploadable.map(c => c.csgNo!);
  const files = csgFiles(uploadable, new Set(Object.keys(docs)));
  const done = files.need > 0 && files.have === files.need;

  async function uploadOne(c: CsgGroup, file: File) {
    setNotes(n => ({ ...n, [c.id]: { busy: true } }));
    const r = await sendFile(file, [c.csgNo!]);
    if (r.ok) {
      forgetDetails(c.docKey!);
      setOpen(s => new Set(s).add(c.id));
      setNotes(n => ({ ...n, [c.id]: { busy: false, warnings: r.warnings } }));
      router.refresh();
    } else {
      setNotes(n => ({ ...n, [c.id]: { busy: false, error: r.error } }));
    }
  }

  async function uploadMany(list: File[]) {
    if (!list.length) return;
    setBulkBusy(true);
    setBulk(list.map(f => ({ name: f.name, state: "waiting" })));
    const set = (i: number, r: BulkRow) => setBulk(prev => prev.map((p, j) => (j === i ? r : p)));
    // One request per file, in turn, so each file reports on its own.
    for (let i = 0; i < list.length; i++) {
      set(i, { name: list[i].name, state: "sending" });
      const r = await sendFile(list[i], expectAll);
      if (r.ok) {
        r.csgNos.forEach(forgetDetails);
        set(i, { name: list[i].name, state: "saved", note: [`Saved as ${r.csgNos.join(", ")}.`, ...r.warnings].join(" ") });
      } else {
        set(i, { name: list[i].name, state: "error", note: r.error });
      }
    }
    setBulkBusy(false);
    router.refresh();
  }

  const saved = bulk.filter(b => b.state === "saved").length;
  const failed = bulk.filter(b => b.state === "error").length;

  return (
    <section
      aria-labelledby="csg-files-h"
      onDragOver={e => { if (expectAll.length) { e.preventDefault(); setOver(true); } }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false); }}
      onDrop={e => { e.preventDefault(); setOver(false); if (!bulkBusy && expectAll.length) uploadMany([...e.dataTransfer.files]); }}
      className={`rounded-xl border bg-surface transition-colors ${over ? "border-brand ring-2 ring-brand/30" : "border-line"}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div>
          <h2 id="csg-files-h" className="font-display text-lg font-semibold text-ink">CSG files</h2>
          <p className={`text-sm ${done ? "font-semibold text-ok" : "text-ink-2"}`}>
            {files.need === 0
              ? "This outlet has no CSG numbers in the workbook."
              : done
                ? "All uploaded."
                : `${files.have} of ${files.need} uploaded. Upload each file on its row, or drop several anywhere on this list.`}
          </p>
        </div>
        {files.need > 1 && (
          <label className={`cursor-pointer rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm font-semibold text-ink-2 transition-colors hover:border-brand hover:text-ink focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-brand ${bulkBusy ? "pointer-events-none opacity-50" : ""}`}>
            {bulkBusy ? "Uploading…" : "Upload several files"}
            <input
              type="file" accept=".xlsx" multiple className="sr-only" disabled={bulkBusy}
              onChange={e => { const f = [...(e.target.files ?? [])]; e.target.value = ""; uploadMany(f); }}
            />
          </label>
        )}
      </div>

      <div role="status" aria-live="polite">
        {bulk.length > 0 && (
          <div className="border-t border-line bg-quiet px-4 py-2.5 text-sm text-ink-2">
            {!bulkBusy && (
              <p className={`font-semibold ${failed ? "text-danger" : "text-ok"}`}>
                {saved} of {bulk.length} {bulk.length === 1 ? "file" : "files"} saved{failed ? `, ${failed} not saved` : ""}.
              </p>
            )}
            <ul className="mt-1 flex flex-col gap-0.5">
              {bulk.map((b, i) => (
                <li key={i}>
                  <span className="font-semibold text-ink">{b.name}</span>{" "}
                  {b.state === "waiting" && <span className="text-muted">Waiting</span>}
                  {b.state === "sending" && <span>Reading…</span>}
                  {b.state === "saved" && <span className="text-ok">{b.note}</span>}
                  {b.state === "error" && <span className="text-danger">{b.note}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <ul>
        {csgs.map(c => (
          <CsgRow
            key={c.id} c={c} doc={c.docKey ? docs[c.docKey] : undefined} note={notes[c.id]} isOpen={open.has(c.id)}
            onToggle={() => setOpen(s => { const n = new Set(s); if (!n.delete(c.id)) n.add(c.id); return n; })}
            onFile={f => uploadOne(c, f)}
          />
        ))}
      </ul>
    </section>
  );
}

function CsgRow({ c, doc, note, isOpen, onToggle, onFile }: {
  c: CsgGroup; doc?: DocMeta; note?: RowNote; isOpen: boolean; onToggle: () => void; onFile: (f: File) => void;
}) {
  const panel = useId();
  const [over, setOver] = useState(false);
  const busy = !!note?.busy;

  const drop = {
    onDragOver: (e: React.DragEvent) => { if (c.csgNo) { e.preventDefault(); setOver(true); } },
    onDragLeave: (e: React.DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false); },
    // One file lands on this CSG. Several carry on to the whole list, which sorts them out.
    onDrop: (e: React.DragEvent) => {
      setOver(false);
      if (!c.csgNo || e.dataTransfer.files.length !== 1) return;
      e.preventDefault();
      e.stopPropagation();
      if (!busy) onFile(e.dataTransfer.files[0]);
    },
  };

  const picker = (label: React.ReactNode, cls: string) => (
    <label className={`${cls} ${busy ? "pointer-events-none opacity-60" : "cursor-pointer"} focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-brand`}>
      {busy ? "Reading…" : label}
      <input
        type="file" accept=".xlsx" className="sr-only" disabled={busy}
        aria-label={`Upload the file for ${c.csgNo}`}
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onFile(f); }}
      />
    </label>
  );

  return (
    <li {...drop} className={`border-t border-line ${over ? "bg-quiet" : ""}`}>
      <div className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 px-4 py-3 md:grid-cols-[1.25rem_13rem_minmax(0,1fr)_3.5rem_10.5rem]">
        <span
          aria-hidden
          className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${
            doc ? "bg-ok text-white" : c.csgNo ? "border-2 border-dashed border-line-strong" : "border-2 border-line"
          }`}
        >
          {doc ? "✓" : ""}
        </span>

        <div className="min-w-0">
          <p className="font-mono text-[0.8125rem] font-semibold text-ink">{c.csgNo ?? "No CSG number"}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm tabular-nums text-ink-2">
            <span aria-hidden title={BAND_LABEL[c.band]} className={`h-2.5 w-2.5 flex-none rounded-sm ${BAND_BG[c.band]}`} />
            {c.csgDate ? `${fmtDate(c.csgDate)}, ${ageText(c.days)}` : "No date"}
          </p>
        </div>

        <div className="col-start-2 row-start-2 min-w-0 md:col-start-3 md:row-start-1">
          {c.products.map(p => (
            <p key={p.product} className="text-sm text-ink">
              {p.product}
              {c.products.length > 1 && <span className="ml-1.5 tabular-nums text-ink-2">{fmtInt(p.qty)}</span>}
            </p>
          ))}
          {(c.needsRefresh || c.tags.length > 0) && (
            <div className="mt-1 flex flex-wrap gap-1">
              {c.needsRefresh && <Chip tone="danger">Needs refresh</Chip>}
              {c.tags.includes("clearance") && <Chip tone="warn">{TAG_NOTE.clearance}</Chip>}
              {c.tags.includes("adjusted") && <Chip tone="info">{TAG_NOTE.adjusted}</Chip>}
              {c.tags.includes("new") && <Chip tone="ok">{TAG_NOTE.new}</Chip>}
            </div>
          )}
        </div>

        <p className="col-start-3 row-start-2 text-right text-sm font-semibold tabular-nums text-ink md:col-start-4 md:row-start-1">
          {fmtInt(c.units)}<span className="text-xs font-normal text-muted md:sr-only"> units</span>
        </p>

        <div className="col-start-3 row-start-1 flex flex-wrap items-center justify-end gap-2 md:col-start-5">
          {!c.csgNo ? (
            <span className="text-right text-sm text-muted">Add its number in the workbook</span>
          ) : doc ? (
            <>
              <button
                type="button" aria-expanded={isOpen} aria-controls={panel} onClick={onToggle}
                className="whitespace-nowrap rounded-lg border border-line-strong px-3 py-1 text-sm font-semibold text-ink-2 hover:border-brand hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
              >
                {isOpen ? "Hide details" : "Details"}
              </button>
              {picker("Replace", "rounded px-1 py-1 text-sm font-semibold text-ink-2 underline hover:text-ink")}
            </>
          ) : (
            // The dashed slot is the file this row is waiting for.
            picker(
              "Upload file",
              "whitespace-nowrap rounded-lg border-2 border-dashed border-line-strong px-3 py-1 text-sm font-semibold text-ink transition-colors hover:border-brand hover:bg-quiet",
            )
          )}
        </div>
      </div>

      {note?.error && <p role="alert" className="px-4 pb-3 pl-12 text-sm text-danger">{note.error}</p>}
      {note?.warnings && note.warnings.length > 0 && (
        <ul className="list-disc px-4 pb-3 pl-16 text-sm text-warn">{note.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
      )}

      {isOpen && doc && c.docKey && (
        <div id={panel} className="border-t border-line bg-page">
          {/* w-0 + min-w-full: the grid scrolls inside this box instead of widening the page */}
          <div className="w-0 min-w-full">
            <CsgDetails key={doc.uploadedAt} csgNo={c.docKey} workbookQty={c.units} />
            <p className="px-3 pb-3 text-sm text-muted">
              {doc.fileName || "File"} uploaded {new Date(doc.uploadedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kuala_Lumpur" })}
              {doc.uploadedBy ? ` by ${doc.uploadedBy}` : ""}.
            </p>
          </div>
        </div>
      )}
    </li>
  );
}
