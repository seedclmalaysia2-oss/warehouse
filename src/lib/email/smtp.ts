// Outgoing mail goes through SMTP. The server is configured on
// /email-settings/server and stored in warehouse.smtp_server with the
// password encrypted. The plain password never reaches the browser.
//
// Env vars (SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_PORT) still work
// as a fallback when nothing has been saved in the dashboard.
import nodemailer from "nodemailer";
import { prisma } from "@/lib/db";
import { decrypt } from "./crypto";

export type SmtpConfig = {
  source: "dashboard" | "env";
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
};

export type SmtpStatus =
  | { configured: false; reason: string }
  | { configured: true; source: SmtpConfig["source"]; host: string; from: string };

export function formatFrom(name: string, email: string) {
  return name ? `"${name.replace(/"/g, "'")}" <${email}>` : email;
}

export async function getSmtpConfig(): Promise<SmtpConfig | null> {
  const row = await prisma.smtpServer.findUnique({ where: { id: 1 } });
  if (row) {
    return {
      source: "dashboard", host: row.host, port: row.port, user: row.username,
      pass: decrypt(row.passwordEnc), from: formatFrom(row.fromName, row.fromEmail),
    };
  }
  const e = process.env;
  if (e.SMTP_HOST && e.SMTP_USER && e.SMTP_PASS && e.SMTP_FROM) {
    return { source: "env", host: e.SMTP_HOST, port: Number(e.SMTP_PORT || 587), user: e.SMTP_USER, pass: e.SMTP_PASS, from: e.SMTP_FROM };
  }
  return null;
}

export async function smtpStatus(): Promise<SmtpStatus> {
  try {
    const c = await getSmtpConfig();
    if (!c) return { configured: false, reason: "No sending server has been set up yet." };
    return { configured: true, source: c.source, host: c.host, from: c.from };
  } catch {
    return { configured: false, reason: "The saved server can't be read — re-enter its password." };
  }
}

export function transport(c: Pick<SmtpConfig, "host" | "port" | "user" | "pass">) {
  return nodemailer.createTransport({
    host: c.host,
    port: c.port,
    secure: c.port === 465,
    requireTLS: c.port === 587,
    auth: { user: c.user, pass: c.pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
}
