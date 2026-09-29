import { getAccess, guardDept } from "@/lib/auth";
import { validate } from "@/lib/email/routes";
import { RouteKeyZ, RouteSettingsZ, saveRoute } from "@/lib/email/store";

export async function PUT(req: Request, ctx: { params: Promise<{ route: string }> }) {
  const denied = await guardDept();
  if (denied) return denied;

  const route = RouteKeyZ.safeParse((await ctx.params).route);
  if (!route.success) return Response.json({ error: "Unknown route." }, { status: 404 });

  const body = RouteSettingsZ.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Invalid settings." }, { status: 400 });

  const issues = validate(route.data, body.data);
  if (issues.length) return Response.json({ error: "Fix the highlighted fields.", issues }, { status: 422 });

  const access = await getAccess();
  const by = access.kind === "ok" ? access.staff.email : "unknown";
  const row = await saveRoute(route.data, body.data, by);
  return Response.json({ ok: true, updatedAt: row.updatedAt.toISOString(), updatedBy: row.updatedBy });
}
