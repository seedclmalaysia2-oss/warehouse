import { getAccess, guardDept } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { encrypt, hasSecretKey } from "@/lib/email/crypto";
import { ServerInputZ, fieldErrors, loadServerView } from "@/lib/email/server-store";

export async function PUT(req: Request) {
  const denied = await guardDept();
  if (denied) return denied;

  const parsed = ServerInputZ.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Fix the highlighted fields.", fields: fieldErrors(parsed.error) }, { status: 422 });
  }
  if (!hasSecretKey()) {
    return Response.json({ error: "The server's encryption key (EMAIL_SECRET_KEY) isn't configured, so the password can't be stored safely." }, { status: 503 });
  }

  const { password, ...s } = parsed.data;
  const existing = await prisma.smtpServer.findUnique({ where: { id: 1 }, select: { passwordEnc: true } });
  if (!password && !existing) {
    return Response.json({ error: "Fix the highlighted fields.", fields: { password: "Enter the password." } }, { status: 422 });
  }

  const access = await getAccess();
  const by = access.kind === "ok" ? access.staff.email : "unknown";
  const data = {
    ...s,
    ...(password ? { passwordEnc: encrypt(password) } : {}),
    // Details changed, so the last check no longer applies.
    lastVerifiedAt: null, lastVerifyOk: null, lastVerifyError: null,
    updatedBy: by,
  };
  await prisma.smtpServer.upsert({
    where: { id: 1 },
    create: { id: 1, ...data, passwordEnc: data.passwordEnc ?? existing!.passwordEnc },
    update: data,
  });
  return Response.json({ ok: true, server: await loadServerView() });
}

export async function DELETE() {
  const denied = await guardDept();
  if (denied) return denied;
  await prisma.smtpServer.deleteMany({ where: { id: 1 } });
  return Response.json({ ok: true });
}
