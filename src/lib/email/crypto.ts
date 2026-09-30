// AES-256-GCM for the SMTP password at rest. The key is EMAIL_SECRET_KEY
// (32 random bytes, base64), set in Vercel and .env — never in the database,
// so a database dump alone can't reveal the mailbox password.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function key(): Buffer {
  const raw = process.env.EMAIL_SECRET_KEY;
  if (!raw) throw new Error("EMAIL_SECRET_KEY is not set.");
  const k = Buffer.from(raw, "base64");
  if (k.length !== 32) throw new Error("EMAIL_SECRET_KEY must be 32 bytes, base64-encoded.");
  return k;
}

export const hasSecretKey = () => {
  try { key(); return true; } catch { return false; }
};

/** "v1.<iv>.<tag>.<ciphertext>", each part base64. */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), data.toString("base64")].join(".");
}

export function decrypt(blob: string): string {
  const [v, iv, tag, data] = blob.split(".");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Unrecognised encrypted value.");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
}
