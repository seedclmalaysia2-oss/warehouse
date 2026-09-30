// Validation and persistence for the sending server. Server-only.
import { z } from "zod";
import { prisma } from "@/lib/db";
import { isEmail } from "./routes";
import { ALLOWED_PORTS } from "./providers";

export const ServerInputZ = z.object({
  provider: z.enum(["google", "microsoft", "custom"]),
  host: z.string().trim().min(1, "Enter the server address.").max(253)
    .regex(/^[a-z0-9.-]+$/i, "Server address should look like smtp.example.com."),
  port: z.number().int().refine(p => ALLOWED_PORTS.includes(p), "Pick one of the listed ports."),
  username: z.string().trim().min(1, "Enter the username.").max(254),
  // Blank = keep the saved password.
  password: z.string().max(512).optional().default(""),
  fromName: z.string().trim().max(120),
  fromEmail: z.string().trim().refine(isEmail, "Enter a valid sender address."),
});
export type ServerInput = z.infer<typeof ServerInputZ>;

export type ServerView = {
  provider: "google" | "microsoft" | "custom";
  host: string;
  port: number;
  username: string;
  hasPassword: boolean;
  fromName: string;
  fromEmail: string;
  lastVerifiedAt: string | null;
  lastVerifyOk: boolean | null;
  lastVerifyError: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

/** What the browser is allowed to see — never the password or its ciphertext. */
export async function loadServerView(): Promise<ServerView | null> {
  const r = await prisma.smtpServer.findUnique({ where: { id: 1 } });
  if (!r) return null;
  return {
    provider: (["google", "microsoft", "custom"].includes(r.provider) ? r.provider : "custom") as ServerView["provider"],
    host: r.host, port: r.port, username: r.username, hasPassword: !!r.passwordEnc,
    fromName: r.fromName, fromEmail: r.fromEmail,
    lastVerifiedAt: r.lastVerifiedAt?.toISOString() ?? null,
    lastVerifyOk: r.lastVerifyOk, lastVerifyError: r.lastVerifyError,
    updatedAt: r.updatedAt.toISOString(), updatedBy: r.updatedBy,
  };
}

export function fieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of err.issues) out[String(i.path[0])] ??= i.message;
  return out;
}

/** Friendlier text for the errors people actually hit. */
export function explainSmtpError(err: unknown): string {
  const e = err as { code?: string; responseCode?: number; message?: string };
  if (e.code === "EAUTH" || e.responseCode === 535) return "The server rejected the username or password.";
  if (e.code === "ETIMEDOUT" || e.code === "ECONNECTION") return "Couldn't reach the server — check the address and port.";
  if (e.code === "ENOTFOUND" || e.code === "EDNS") return "That server address doesn't exist.";
  if (e.code === "ESOCKET") return "Secure connection failed — try the other port (465 or 587).";
  return (e.message ?? "Unknown error").slice(0, 300);
}
