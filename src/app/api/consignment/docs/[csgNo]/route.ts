import { guardDept } from "@/lib/auth";
import { buildMatrix } from "@/lib/consignment/doc-matrix";
import { deleteDoc, loadDoc } from "@/lib/consignment/doc-store";

export async function GET(_req: Request, ctx: { params: Promise<{ csgNo: string }> }) {
  const denied = await guardDept();
  if (denied) return denied;

  const csgNo = decodeURIComponent((await ctx.params).csgNo).trim().toUpperCase();
  if (!/^CS[GF]?\d+$/.test(csgNo)) return Response.json({ error: "Unknown CSG number." }, { status: 400 });
  try {
    const doc = await loadDoc(csgNo);
    if (!doc) return Response.json({ error: "No details have been uploaded for this CSG." }, { status: 404 });
    const { lines, ...head } = doc;
    return Response.json({ doc: head, matrix: buildMatrix(lines) });
  } catch {
    return Response.json({ error: "Could not load the details." }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ csgNo: string }> }) {
  const denied = await guardDept();
  if (denied) return denied;

  const csgNo = decodeURIComponent((await ctx.params).csgNo).trim().toUpperCase();
  if (!/^CS[GF]?\d+$/.test(csgNo)) return Response.json({ error: "Unknown CSG number." }, { status: 400 });
  try {
    const removed = await deleteDoc(csgNo);
    return removed ? Response.json({ ok: true }) : Response.json({ error: "That CSG has no uploaded details." }, { status: 404 });
  } catch {
    return Response.json({ error: "Could not remove the details." }, { status: 500 });
  }
}
