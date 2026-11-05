import { guardDept } from "@/lib/auth";
import { docKey, findOutlet, fmtDate, groupCsgs, outletKey, todayISO } from "@/lib/consignment/analyze";
import { buildChecklistPdf, checklistRows } from "@/lib/consignment/checklist-pdf";
import { loadDocMeta } from "@/lib/consignment/doc-store";
import { loadSnapshot } from "@/lib/consignment/store";

// The filled-in stock confirmation for one outlet. ?download=1 saves it; otherwise it opens in the browser.
export async function GET(req: Request, ctx: { params: Promise<{ key: string }> }) {
  const denied = await guardDept();
  if (denied) return denied;

  const key = outletKey(decodeURIComponent((await ctx.params).key));
  try {
    const snap = await loadSnapshot();
    const today = todayISO();
    const row = snap ? findOutlet(snap.lines, snap.outlets, key, today) : undefined;
    if (!row) return Response.json({ error: "This outlet is not in the current workbook." }, { status: 404 });

    const csgs = groupCsgs(row.lines);
    const meta = await loadDocMeta([...new Set(csgs.flatMap(c => (c.docKey ? [c.docKey] : [])))]);
    const pdf = await buildChecklistPdf({
      storeName: row.name,
      state: row.state,
      documentDate: fmtDate(today),
      rows: checklistRows(csgs, new Map(meta.map(m => [docKey(m.csgNo), m.lineTotal]))),
    });

    const name = `Consignment checklist - ${row.name}.pdf`;
    const ascii = name.replace(/[^\x20-\x7e]|["\\]/g, "_");
    const mode = new URL(req.url).searchParams.has("download") ? "attachment" : "inline";
    return new Response(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${mode}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return Response.json({ error: "Could not prepare the checklist." }, { status: 500 });
  }
}
