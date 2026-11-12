"use client";
import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { ageText, csgFiles, docKey, fmtDate, fmtInt, type CsgGroup } from "@/lib/consignment/analyze";
import { BAND_BG, BAND_LABEL } from "./shelf-life";
import { CsgDetails, forgetDetails } from "./csg-details";
import { Chip, TAG_NOTE } from "./outlet-table";

export type DocMeta = { fileName: string | null; uploadedAt: string; uploadedBy: string | null };

type Sent = { ok: true; csgNos: string[]; warnings: string[] } | { ok: false; error: string };
type RowNote = { busy: boolean; error?: string; warnings?: string[] };
type BulkRow = { name: string; state: "waiting" | "sending" | "saved" | "error"; note?: string };
type OutletResult =
  | { ok: true; filed: { csgNo: string; boxes: number }[]; added: { csgNo: string; boxes: number }[]; skipped: { csgNo: string; at: string[] }[]; warnings: string[] }
  | { ok: false; error: string };
type CsrDoc = { code: string; csgKey: string | null; outlet: string; boxes: number; state: "saved" | "confirm" | "no-csg" | "not-csr"; reason?: string; left?: number; short?: { description: string; power: string | null; qty: number }[] };
type CsrState = { busy: boolean; name: string; file?: File; csg?: string; docs?: CsrDoc[]; confirm?: boolean; warnings?: string[]; error?: string };

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

async function sendOutletFile(file: File, outletKey: string): Promise<OutletResult> {
  try {
    const body = new FormData();
    body.set("file", file);
    const res = await fetch(`/api/consignment/outlets/${encodeURIComponent(outletKey)}/docs`, { method: "POST", body });
    const json = await res.json().catch(() => ({}));
    return res.ok ? json : { ok: false, error: json.error ?? "Upload failed." };
  } catch {
    return { ok: false, error: "Upload failed. Check your connection and try again." };
  }
}

const boxes = (n: number) => `${n.toLocaleString("en-MY")} ${n === 1 ? "box" : "boxes"}`;

const btn = "whitespace-nowrap rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm font-semibold text-ink-2 transition-colors hover:border-brand hover:text-ink focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-brand";
const small = "whitespace-nowrap rounded-md border border-line-strong px-2 py-0.5 text-xs font-semibold text-ink-2 transition-colors hover:border-brand hover:text-ink focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-brand";

/**
 * The checklist of CSG files this outlet needs. "Upload CSG file" and "Upload
 * CSR file" take one file each and match it to the right CSG in the list by its
 * number; each row has the same two buttons for its own CSG, and a Delete for a
 * file uploaded by mistake.
 */
export function OutletFiles({ csgs, docs, returns, outletKey }: {
  csgs: CsgGroup[]; docs: Record<string, DocMeta>; /** CSR codes stored against each CSG, by normalised number. */ returns: Record<string, string[]>; outletKey: string;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState<Record<string, RowNote>>({});
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<BulkRow[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [whole, setWhole] = useState<{ busy: boolean; name?: string; result?: OutletResult }>({ busy: false });
  const [csr, setCsr] = useState<CsrState | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const uploadable = csgs.filter(c => c.csgNo && !/^CSR/i.test(c.csgNo));
  const expectAll = uploadable.map(c => c.csgNo!);
  const files = csgFiles(uploadable, new Set(Object.keys(docs)));
  const done = files.need > 0 && files.have === files.need;
  const anyBusy = whole.busy || !!csr?.busy || bulkBusy;

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

  // One file with this outlet's CSG documents; each is matched to its row and goes live as soon as it is saved.
  async function uploadWhole(file: File) {
    setCsr(null);
    setWhole({ busy: true, name: file.name });
    const r = await sendOutletFile(file, outletKey);
    if (r.ok) [...r.filed, ...r.added].forEach(d => forgetDetails(docKey(d.csgNo)));
    setWhole({ busy: false, name: file.name, result: r });
    if (r.ok) router.refresh();
  }

  // One CSR file. `csg` limits it to one row's CSG; without it, each CSR is matched to its CSG in the list by number.
  async function uploadCsr(file: File, csg?: string, proceed = false) {
    setWhole({ busy: false });
    setCsr({ busy: true, name: file.name, file, csg });
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("outlet", outletKey);
      if (csg) body.set("csg", csg);
      if (proceed) body.set("proceed", "1");
      const res = await fetch("/api/consignment/returns", { method: "POST", body });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setCsr({ busy: false, name: file.name, error: json.error ?? "Upload failed." }); return; }
      const got: CsrDoc[] = json.docs ?? [];
      setCsr({ busy: false, name: file.name, file, csg, docs: got, confirm: !!json.needsConfirm, warnings: json.warnings ?? [] });
      const saved = got.filter(d => d.state === "saved" && d.csgKey);
      if (saved.length) {
        saved.forEach(d => forgetDetails(d.csgKey!));
        router.refresh();
      }
    } catch {
      setCsr({ busy: false, name: file.name, error: "Upload failed. Check your connection and try again." });
    }
  }

  async function removeCsg(c: CsgGroup) {
    const what = c.added
      ? `Remove ${c.csgNo} from this outlet? Its file is deleted and the ${fmtInt(c.units)} units it added come off the outlet.`
      : `Delete the file for ${c.csgNo}? Details go back to "Not uploaded". The workbook figures stay as they are, and any CSRs are kept.`;
    if (!window.confirm(what)) return;
    await remove(`csg:${c.id}`, `/api/consignment/outlets/${encodeURIComponent(outletKey)}/docs/${encodeURIComponent(c.csgNo!)}`, () => c.docKey && forgetDetails(c.docKey));
  }

  async function removeCsr(code: string, key: string | null) {
    if (!window.confirm(`Delete ${code}? Its boxes go back onto the CSG they came off.`)) return;
    await remove(`csr:${code}`, `/api/consignment/returns/${encodeURIComponent(code)}`, () => key && forgetDetails(key));
  }

  async function remove(id: string, url: string, after: () => unknown) {
    setRemoving(id);
    setRemoveError(null);
    try {
      const res = await fetch(url, { method: "DELETE" });
      if (!res.ok) setRemoveError((await res.json().catch(() => ({}))).error ?? "Could not delete it.");
      else { after(); router.refresh(); }
    } catch {
      setRemoveError("Could not delete it. Check your connection and try again.");
    } finally {
      setRemoving(null);
    }
  }

  const saved = bulk.filter(b => b.state === "saved").length;
  const failed = bulk.filter(b => b.state === "error").length;
  const waitingDocs = (csr?.docs ?? []).filter(d => d.state === "confirm");

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
                : `${files.have} of ${files.need} uploaded. Upload each file on its row, or use the buttons here and it finds its row.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className={`cursor-pointer ${btn} ${anyBusy ? "pointer-events-none opacity-50" : ""}`}>
            {whole.busy ? "Uploading…" : "Upload CSG file"}
            <input
              type="file" accept=".xlsx" className="sr-only" disabled={anyBusy}
              aria-label="Upload a CSG file. It is matched to its CSG in the list"
              onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) uploadWhole(f); }}
            />
          </label>
          <label className={`cursor-pointer ${btn} ${anyBusy ? "pointer-events-none opacity-50" : ""}`}>
            {csr?.busy && !csr.csg ? "Uploading…" : "Upload CSR file"}
            <input
              type="file" accept=".xlsx" className="sr-only" disabled={anyBusy}
              aria-label="Upload a CSR file. Each CSR is matched to its CSG in the list"
              onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) uploadCsr(f); }}
            />
          </label>
          {files.need > 1 && (
            <label className={`cursor-pointer ${btn} ${bulkBusy ? "pointer-events-none opacity-50" : ""}`}>
              {bulkBusy ? "Uploading…" : "Upload several files"}
              <input
                type="file" accept=".xlsx" multiple className="sr-only" disabled={anyBusy}
                onChange={e => { const f = [...(e.target.files ?? [])]; e.target.value = ""; uploadMany(f); }}
              />
            </label>
          )}
        </div>
      </div>

      <div role="status" aria-live="polite">
        {removeError && <p role="alert" className="border-t border-line bg-quiet px-4 py-2.5 text-sm font-semibold text-danger">{removeError}</p>}

        {whole.result && (
          <div className="border-t border-line bg-quiet px-4 py-2.5 text-sm text-ink-2">
            {whole.result.ok ? (
              <>
                <p className="font-semibold text-ok">
                  {whole.name} is live: {whole.result.filed.length + whole.result.added.length} {whole.result.filed.length + whole.result.added.length === 1 ? "CSG" : "CSGs"} saved.
                </p>
                <ul className="mt-1 flex flex-col gap-0.5">
                  {whole.result.filed.length > 0 && (
                    <li>Matched to the list: {whole.result.filed.map(d => `${d.csgNo} (${boxes(d.boxes)})`).join(", ")}.</li>
                  )}
                  {whole.result.added.length > 0 && (
                    <li className="text-ink">Added to this outlet: {whole.result.added.map(d => `${d.csgNo} (${boxes(d.boxes)})`).join(", ")}.</li>
                  )}
                  {whole.result.skipped.map(s => (
                    <li key={s.csgNo} className="text-warn">{s.csgNo} left out: the workbook has it at {s.at.join(", ")}.</li>
                  ))}
                  {whole.result.warnings.map((w, i) => <li key={i} className="text-warn">{w}</li>)}
                </ul>
              </>
            ) : (
              <p role="alert" className="font-semibold text-danger">{whole.name}: {whole.result.error}</p>
            )}
          </div>
        )}

        {csr && !csr.busy && (
          <div className="border-t border-line bg-quiet px-4 py-2.5 text-sm text-ink-2">
            {csr.error ? (
              <p role="alert" className="font-semibold text-danger">{csr.name}: {csr.error}</p>
            ) : (
              <>
                {csr.confirm ? (
                  <div className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2.5 text-ink">
                    <p className="font-semibold">No CSA on record. Apply {waitingDocs.length === 1 ? "this CSR" : "these CSRs"} without one?</p>
                    <p className="mt-0.5 text-ink-2">The paperwork runs CSG, then CSA, then CSR. Nothing has been saved yet.</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button" onClick={() => csr.file && uploadCsr(csr.file, csr.csg, true)}
                        className="rounded-lg bg-brand px-3 py-1.5 font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                      >
                        Proceed without CSA
                      </button>
                      <button
                        type="button" onClick={() => setCsr(null)}
                        className="rounded-lg border border-line-strong bg-surface px-3 py-1.5 font-semibold text-ink-2 hover:border-brand hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                      >
                        Don&apos;t apply
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className={`font-semibold ${csr.docs?.some(d => d.state === "saved") ? "text-ok" : "text-danger"}`}>
                    {csr.name}: {csr.docs?.length ? `${csr.docs.filter(d => d.state === "saved").length} of ${csr.docs.length} CSR saved.` : "No CSR found in this file."}
                  </p>
                )}
                <ul className="mt-1 flex flex-col gap-0.5 tabular-nums">
                  {(csr.docs ?? []).map(d => (
                    <li key={d.code}>
                      <span className="font-mono font-semibold text-ink">{d.code}</span>{" "}
                      {d.state === "saved" && (
                        <span className="text-ok">{boxes(d.boxes)} taken off {d.csgKey}{d.left !== undefined ? `, ${boxes(d.left)} left` : ""}</span>
                      )}
                      {d.state === "confirm" && <span className="text-warn">{csr.confirm ? `${boxes(d.boxes)} for ${d.csgKey}` : d.reason}</span>}
                      {(d.state === "no-csg" || d.state === "not-csr") && <span className="text-danger">{d.reason}</span>}
                      {d.short && d.short.length > 0 && (
                        <ul className="list-disc pl-5 text-warn">
                          {d.short.map((s, j) => <li key={j}>{s.description}{s.power ? ` ${s.power}` : ""}: {boxes(s.qty)} not on {d.csgKey}, so nothing was taken off for {s.qty === 1 ? "it" : "them"}.</li>)}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
                {csr.warnings && csr.warnings.length > 0 && <ul className="mt-1 list-disc pl-5 text-warn">{csr.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
              </>
            )}
          </div>
        )}

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
            csrCodes={c.docKey ? returns[c.docKey] ?? [] : []} locked={anyBusy} removing={removing}
            onToggle={() => setOpen(s => { const n = new Set(s); if (!n.delete(c.id)) n.add(c.id); return n; })}
            onFile={f => uploadOne(c, f)}
            onCsr={f => uploadCsr(f, c.docKey!)}
            onRemove={() => removeCsg(c)}
            onRemoveCsr={code => removeCsr(code, c.docKey)}
          />
        ))}
      </ul>
    </section>
  );
}

function CsgRow({ c, doc, note, isOpen, csrCodes, locked, removing, onToggle, onFile, onCsr, onRemove, onRemoveCsr }: {
  c: CsgGroup; doc?: DocMeta; note?: RowNote; isOpen: boolean; csrCodes: string[]; locked: boolean; removing: string | null;
  onToggle: () => void; onFile: (f: File) => void; onCsr: (f: File) => void; onRemove: () => void; onRemoveCsr: (code: string) => void;
}) {
  const panel = useId();
  const [over, setOver] = useState(false);
  const busy = !!note?.busy;
  // A "CSR" number in the list is a return that was filed as stock by mistake: it can only be removed.
  const isCsr = !!c.csgNo && /^CSR/i.test(c.csgNo);
  const off = busy || locked;

  const drop = {
    onDragOver: (e: React.DragEvent) => { if (c.csgNo && !isCsr) { e.preventDefault(); setOver(true); } },
    onDragLeave: (e: React.DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false); },
    // One file lands on this CSG. Several carry on to the whole list, which sorts them out.
    onDrop: (e: React.DragEvent) => {
      setOver(false);
      if (!c.csgNo || isCsr || e.dataTransfer.files.length !== 1) return;
      e.preventDefault();
      e.stopPropagation();
      if (!off) onFile(e.dataTransfer.files[0]);
    },
  };

  const picker = (label: React.ReactNode, cls: string, send: (f: File) => void, aria: string) => (
    <label className={`${cls} ${off ? "pointer-events-none opacity-60" : "cursor-pointer"} focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-brand`}>
      {busy && label === "Upload CSG" ? "Reading…" : label}
      <input
        type="file" accept=".xlsx" className="sr-only" disabled={off} aria-label={aria}
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) send(f); }}
      />
    </label>
  );

  const canDelete = !!doc || c.added;

  return (
    <li {...drop} className={`border-t border-line ${over ? "bg-quiet" : ""}`}>
      <div className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 px-4 py-3 md:grid-cols-[1.25rem_13rem_minmax(0,1fr)_3.5rem_11.5rem]">
        <span
          aria-hidden
          className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${
            doc ? "bg-ok text-white" : c.csgNo && !isCsr ? "border-2 border-dashed border-line-strong" : "border-2 border-line"
          }`}
        >
          {doc ? "✓" : ""}
        </span>

        <div className="min-w-0">
          <p className="font-mono text-[0.8125rem] font-semibold text-ink">{c.csgNo ?? "No CSG number"}</p>
          {csrCodes.length > 0 ? (
            <ul className="mt-0.5 flex flex-col gap-0.5">
              {csrCodes.map(code => (
                <li key={code} className="flex items-center gap-2 font-mono text-xs text-brand">
                  <span title="A CSR uploaded against this CSG">{code}</span>
                  <button
                    type="button" disabled={removing === `csr:${code}`} onClick={() => onRemoveCsr(code)} aria-label={`Delete ${code}`}
                    className="rounded font-sans text-xs font-semibold text-danger hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand disabled:opacity-50"
                  >
                    {removing === `csr:${code}` ? "Deleting…" : "Delete"}
                  </button>
                </li>
              ))}
            </ul>
          ) : c.latestCode ? (
            <p className="mt-0.5 font-mono text-xs text-brand" title="The latest CSR uploaded against this CSG">{c.latestCode}</p>
          ) : null}
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
          {(c.needsRefresh || c.tags.length > 0 || c.added) && (
            <div className="mt-1 flex flex-wrap gap-1">
              {c.needsRefresh && <Chip tone="danger">Needs refresh</Chip>}
              {c.tags.includes("clearance") && <Chip tone="warn">{TAG_NOTE.clearance}</Chip>}
              {c.tags.includes("adjusted") && <Chip tone="info">{TAG_NOTE.adjusted}</Chip>}
              {c.tags.includes("new") && <Chip tone="ok">{TAG_NOTE.new}</Chip>}
              {c.added && <Chip tone="info">{isCsr ? "A CSR, not stock" : "Added by upload"}</Chip>}
            </div>
          )}
        </div>

        <p className="col-start-3 row-start-2 text-right text-sm font-semibold tabular-nums text-ink md:col-start-4 md:row-start-1">
          {fmtInt(c.units)}<span className="text-xs font-normal text-muted md:sr-only"> units</span>
        </p>

        <div className="col-start-3 row-start-1 flex flex-col items-end gap-1.5 md:col-start-5">
          {!c.csgNo ? (
            <span className="text-right text-sm text-muted">Add its number in the workbook</span>
          ) : (
            <>
              {doc && (
                <button
                  type="button" aria-expanded={isOpen} aria-controls={panel} onClick={onToggle}
                  className="whitespace-nowrap rounded-lg border border-line-strong px-3 py-1 text-sm font-semibold text-ink-2 hover:border-brand hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
                >
                  {isOpen ? "Hide details" : "Details"}
                </button>
              )}
              {!isCsr && (
                <div className="flex flex-wrap justify-end gap-1.5">
                  {picker(
                    "Upload CSG",
                    doc ? small : "whitespace-nowrap rounded-lg border-2 border-dashed border-line-strong px-3 py-1 text-sm font-semibold text-ink transition-colors hover:border-brand hover:bg-quiet",
                    onFile, `Upload the CSG file for ${c.csgNo}`,
                  )}
                  {picker("Upload CSR", small, onCsr, `Upload a CSR file for ${c.csgNo}`)}
                </div>
              )}
              {canDelete && (
                <button
                  type="button" disabled={removing === `csg:${c.id}` || locked} onClick={onRemove}
                  className="rounded px-1 text-xs font-semibold text-danger hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand disabled:opacity-50"
                >
                  {removing === `csg:${c.id}` ? "Deleting…" : c.added ? "Remove from outlet" : "Delete CSG file"}
                </button>
              )}
            </>
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
