import { getAccess, guardDept } from "@/lib/auth";
import { outletKey } from "@/lib/consignment/analyze";
import { trashCsr } from "@/lib/consignment/trash-store";

/**
 * Remove one CSR. Its boxes go back onto the CSG it came off, and a copy goes in
 * the deleted-files log. `?outlet=` names the outlet page it was deleted from.
 */
export async function DELETE(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const denied = await guardDept();
  if (denied) return denied;

  const code = decodeURIComponent((await ctx.params).code).trim().toUpperCase();
  if (!/^CSR\d+(\(\d+\))?$/.test(code)) return Response.json({ error: "Unknown CSR number." }, { status: 400 });
  try {
    const access = await getAccess();
    const by = access.kind === "ok" ? access.staff.email : "unknown";
    const outlet = new URL(req.url).searchParams.get("outlet");
    const r = await trashCsr(code, by, outlet ? outletKey(outlet) : null);
    return r.removed ? Response.json({ ok: true, logged: r.logged }) : Response.json({ error: "That CSR is not stored." }, { status: 404 });
  } catch {
    return Response.json({ error: "Could not remove the CSR." }, { status: 500 });
  }
}
