"use client";
import { useEffect, useState } from "react";
import { fmtDate, fmtInt } from "@/lib/consignment/analyze";
import type { Matrix } from "@/lib/consignment/doc-matrix";

type Head = {
  csgNo: string;
  docDate: string | null;
  toCounter: string;
  salesperson: string;
  createdBy: string;
  printedTotal: number | null;
  lineTotal: number;
  remark: string;
};
type Loaded = { doc: Head; matrix: Matrix };

// Details already fetched in this visit, so closing and reopening is instant.
const cache = new Map<string, Loaded>();

/**
 * The colour x power grid for one CSG, read from the uploaded ERP document.
 * Mounted only while the row is open, so nothing is fetched until asked for.
 */
export function CsgDetails({ csgNo, workbookQty }: { csgNo: string; workbookQty: number }) {
  const [data, setData] = useState<Loaded | null>(cache.get(csgNo) ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cache.has(csgNo)) return;
    let live = true;
    fetch(`/api/consignment/docs/${encodeURIComponent(csgNo)}`)
      .then(async res => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? "Could not load the details.");
        cache.set(csgNo, json);
        if (live) setData(json);
      })
      .catch(e => { if (live) setError(e instanceof Error ? e.message : "Could not load the details."); });
    return () => { live = false; };
  }, [csgNo]);

  if (error) return <p role="alert" className="px-3 py-3 text-sm text-danger">{error}</p>;
  if (!data) return <p role="status" className="px-3 py-3 text-sm text-ink-2">Loading the details…</p>;

  const { doc, matrix } = data;
  const mismatch = workbookQty !== matrix.total;

  return (
    <div className="px-3 py-3">
      <p className="text-sm text-ink-2">
        <span className="font-semibold text-ink">{doc.csgNo}</span>
        {doc.docDate ? `, ${fmtDate(doc.docDate)}` : ""}
        {doc.toCounter ? `, to ${doc.toCounter}` : ""}
        {doc.salesperson ? `, salesperson ${doc.salesperson}` : ""}
        {doc.createdBy ? `, created by ${doc.createdBy}` : ""}
      </p>

      <div className="mt-2 overflow-x-auto rounded-lg border border-line">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Quantity of each colour at each power for {doc.csgNo}</caption>
          <thead>
            <tr className="border-b border-line bg-quiet">
              <th scope="col" className="sticky left-0 z-10 whitespace-nowrap bg-quiet px-3 py-2 text-left font-semibold text-ink-2">Colour</th>
              {matrix.powers.map(p => (
                <th key={p} scope="col" className="whitespace-nowrap px-2 py-2 text-right font-semibold tabular-nums text-ink-2">{p}</th>
              ))}
              <th scope="col" className="whitespace-nowrap border-l border-line px-3 py-2 text-right font-semibold text-ink">Total</th>
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map(r => (
              <tr key={r.colour + r.product} className="border-b border-line">
                <th scope="row" className="sticky left-0 z-10 bg-surface px-3 py-1.5 text-left font-normal text-ink">
                  <span className="block whitespace-nowrap font-semibold">{r.colour}</span>
                  {r.expiry && (
                    <span className="block whitespace-nowrap text-xs text-muted">
                      {r.mixedExpiry ? "Earliest expiry" : "Expires"} {r.expiry}
                    </span>
                  )}
                </th>
                {r.cells.map((n, i) => (
                  <td key={i} className={`px-2 py-1.5 text-right tabular-nums ${n ? "text-ink" : "text-muted"}`}>
                    {n ? fmtInt(n) : <span aria-hidden>·</span>}
                    {!n && <span className="sr-only">0</span>}
                  </td>
                ))}
                <td className="border-l border-line px-3 py-1.5 text-right font-semibold tabular-nums text-ink">{fmtInt(r.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-quiet">
              <th scope="row" className="sticky left-0 z-10 bg-quiet px-3 py-2 text-left font-semibold text-ink">Total</th>
              {matrix.colTotals.map((n, i) => (
                <td key={i} className="px-2 py-2 text-right font-semibold tabular-nums text-ink">{fmtInt(n)}</td>
              ))}
              <td className="border-l border-line px-3 py-2 text-right font-semibold tabular-nums text-ink">{fmtInt(matrix.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="mt-2 text-sm text-muted">
        {fmtInt(matrix.total)} boxes on {fmtInt(matrix.lineCount)} lines.
        {doc.printedTotal !== null && doc.printedTotal !== matrix.total ? ` The document prints a total of ${fmtInt(doc.printedTotal)}.` : ""}
        {doc.remark ? ` Remark: ${doc.remark}` : ""}
      </p>
      {mismatch && (
        <p className="mt-1 text-sm text-warn">
          The workbook lists {fmtInt(workbookQty)} units for this CSG, but the document totals {fmtInt(matrix.total)}.
          The workbook may have been updated since the document was printed.
        </p>
      )}
    </div>
  );
}
