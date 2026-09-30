// Connects and signs in to the SAVED server without sending anything, and
// records the result. Only saved details are checked, so the page can't be
// used to probe arbitrary hosts with unsaved input.
import { guardDept } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/email/crypto";
import { transport } from "@/lib/email/smtp";
import { explainSmtpError, loadServerView } from "@/lib/email/server-store";

export async function POST() {
  const denied = await guardDept();
  if (denied) return denied;

  const row = await prisma.smtpServer.findUnique({ where: { id: 1 } });
  if (!row) return Response.json({ error: "Save the server details first." }, { status: 409 });

  let ok = false;
  let error: string | null = null;
  try {
    const pass = decrypt(row.passwordEnc);
    await transport({ host: row.host, port: row.port, user: row.username, pass }).verify();
    ok = true;
  } catch (err) {
    error = err instanceof Error && err.message.includes("EMAIL_SECRET_KEY")
      ? "The encryption key changed since this password was saved — enter the password again."
      : explainSmtpError(err);
  }

  await prisma.smtpServer.update({
    where: { id: 1 },
    data: { lastVerifiedAt: new Date(), lastVerifyOk: ok, lastVerifyError: error },
  });
  return Response.json({ ok, error, server: await loadServerView() }, { status: ok ? 200 : 502 });
}
