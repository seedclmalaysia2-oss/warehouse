import { guardDept } from "@/lib/auth";
import { docKey, outletKey } from "@/lib/consignment/analyze";
import { deleteDocsByKey } from "@/lib/consignment/doc-store";
import { removeOutletLines } from "@/lib/consignment/store";

/**
 * Take back a CSG uploaded by mistake: its document goes (Details back to "Not
 * uploaded"), and a CSG that was added to this outlet by an upload comes off the
 * outlet. Lines that come from the workbook are never touched. CSRs stored
 * against the CSG are removed one by one, with their own Delete.
 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ key: string; csgNo: string }> }) {
  const denied = await guardDept();
  if (denied) return denied;

  const p = await ctx.params;
  const key = outletKey(decodeURIComponent(p.key));
  const csgNo = decodeURIComponent(p.csgNo).trim().toUpperCase();
  if (!/^(CS[GF]?\d+(\(\d+\))?|CSR\d+(\(\d+\))?)$/.test(csgNo)) return Response.json({ error: "Unknown CSG number." }, { status: 400 });
  try {
    const [docs, lines] = await Promise.all([deleteDocsByKey(docKey(csgNo)), removeOutletLines(key, csgNo)]);
    if (!docs && !lines) return Response.json({ error: "Nothing was uploaded for that CSG." }, { status: 404 });
    return Response.json({ ok: true, docs, lines });
  } catch {
    return Response.json({ error: "Could not remove it." }, { status: 500 });
  }
}
