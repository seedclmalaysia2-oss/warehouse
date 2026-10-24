import { getAccess, guardDept } from "@/lib/auth";
import { ResolveZ, saveResolution } from "@/lib/exchange/store";

export async function POST(req: Request) {
  const denied = await guardDept();
  if (denied) return denied;

  const body = ResolveZ.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Invalid request." }, { status: 400 });

  const access = await getAccess();
  const by = access.kind === "ok" ? access.staff.email : "unknown";
  try {
    await saveResolution(body.data, by);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Could not save." }, { status: 404 });
  }
  return Response.json({ ok: true });
}
