// Outgoing mail goes through SMTP. Credentials live only in env vars
// (locally in .env, in production in Vercel) — never in the database and
// never sent to the browser. The page only learns whether it's configured.
import nodemailer from "nodemailer";

export type SmtpStatus =
  | { configured: false; missing: string[] }
  | { configured: true; host: string; from: string };

const REQUIRED = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"] as const;

export function smtpStatus(): SmtpStatus {
  const missing = REQUIRED.filter(k => !process.env[k]);
  if (missing.length) return { configured: false, missing };
  return { configured: true, host: process.env.SMTP_HOST!, from: process.env.SMTP_FROM! };
}

export function transport() {
  const port = Number(process.env.SMTP_PORT || 587);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}
