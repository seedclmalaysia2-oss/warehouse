import { guardDept } from "@/lib/auth";
import { deleteReturn } from "@/lib/consignment/return-store";

/** Remove one CSR. Its boxes go back onto the CSG it came off. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  const denied = await guardDept();
  if (denied) return denied;

  const code = decodeURIComponent((await ctx.params).code).trim().toUpperCase();
  if (!/^CSR\d+(\(\d+\))?$/.test(code)) return Response.json({ error: "Unknown CSR number." }, { status: 400 });
  try {
    const removed = await deleteReturn(code);
    return removed ? Response.json({ ok: true }) : Response.json({ error: "That CSR is not stored." }, { status: 404 });
  } catch {
    return Response.json({ error: "Could not remove the CSR." }, { status: 500 });
  }
}
