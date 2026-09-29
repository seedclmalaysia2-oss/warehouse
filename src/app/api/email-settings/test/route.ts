// Sends the rendered sample to the signed-in user only — never to HQ or a
// customer — so a route can be checked end to end without a real order.
import { getAccess } from "@/lib/auth";
import { render, sampleValues, validate } from "@/lib/email/routes";
import { RouteKeyZ, RouteSettingsZ } from "@/lib/email/store";
import { smtpStatus, transport } from "@/lib/email/smtp";

export async function POST(req: Request) {
  const access = await getAccess();
  if (access.kind !== "ok") {
    return Response.json({ error: "You don't have access to the Warehouse dashboard." }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const route = RouteKeyZ.safeParse(json?.route);
  const settings = RouteSettingsZ.safeParse(json?.settings);
  if (!route.success || !settings.success) return Response.json({ error: "Invalid request." }, { status: 400 });

  const issues = validate(route.data, settings.data);
  if (issues.length) return Response.json({ error: "Fix the highlighted fields first.", issues }, { status: 422 });

  const status = smtpStatus();
  if (!status.configured) {
    return Response.json({ error: `Email sending isn't set up: missing ${status.missing.join(", ")}.` }, { status: 503 });
  }

  const s = settings.data;
  const values = sampleValues(route.data, access.staff.full_name ?? access.staff.email);
  const intended = [
    `To: ${s.toList.join(", ") || "—"}`,
    s.ccList.length ? `Cc: ${s.ccList.join(", ")}` : null,
    s.bccList.length ? `Bcc: ${s.bccList.join(", ")}` : null,
    s.attachmentName ? `Attachment: ${render(s.attachmentName, values)}` : null,
  ].filter(Boolean).join("\n");

  try {
    await transport().sendMail({
      from: status.from,
      to: access.staff.email,
      replyTo: route.data === "outward" && s.mailbox ? s.mailbox : undefined,
      subject: `[TEST] ${render(s.subjectTemplate, values)}`,
      text:
        `This is a test from the Warehouse dashboard. Sample values, sent only to you.\n` +
        `The real email would go to:\n${intended}\n\n` +
        `────────────────────────────\n\n` +
        render(s.bodyTemplate, values),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: `The mail server refused it: ${message}` }, { status: 502 });
  }
  return Response.json({ ok: true, sentTo: access.staff.email });
}
