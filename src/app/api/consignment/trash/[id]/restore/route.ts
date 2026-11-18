import { getAccess, guardDept } from "@/lib/auth";
import { RestoreError, restoreTrash } from "@/lib/consignment/trash-store";

/** Put a deleted CSG or CSR file back, from the deleted-files log. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guardDept();
  if (denied) return denied;

  const id = Number((await ctx.params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return Response.json({ error: "Unknown log entry." }, { status: 400 });
  const access = await getAccess();
  const by = access.kind === "ok" ? access.staff.email : "unknown";
  try {
    const entry = await restoreTrash(id, by);
    return Response.json({ ok: true, entry });
  } catch (e) {
    if (e instanceof RestoreError) return Response.json({ error: e.message }, { status: 409 });
    return Response.json({ error: "Could not restore it." }, { status: 500 });
  }
}
