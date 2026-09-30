// Sending-server presets. Shared by the form (client) and the API.
export type ProviderKey = "google" | "microsoft" | "custom";

export const PROVIDERS: Record<ProviderKey, { label: string; host: string; port: number; note: string }> = {
  google: {
    label: "Google Workspace / Gmail",
    host: "smtp.gmail.com",
    port: 465,
    note: "Use an App Password (Google Account → Security → 2-Step Verification → App passwords), not the normal sign-in password.",
  },
  microsoft: {
    label: "Microsoft 365 / Outlook",
    host: "smtp.office365.com",
    port: 587,
    note: "SMTP AUTH must be enabled for this mailbox in the Microsoft 365 admin centre.",
  },
  custom: {
    label: "Other provider",
    host: "",
    port: 587,
    note: "Your email host's SMTP details — usually in their help pages or your hosting control panel.",
  },
};

export const PORTS = [
  { port: 465, label: "465 — SSL" },
  { port: 587, label: "587 — STARTTLS" },
  { port: 2525, label: "2525 — alternate" },
  { port: 25, label: "25 — plain" },
] as const;

export const ALLOWED_PORTS = PORTS.map(p => p.port) as number[];
