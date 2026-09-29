// Server-side read/write of email route settings.
import { z } from "zod";
import { prisma } from "@/lib/db";
import { DEFAULTS, type RouteKey, type RouteSettings } from "./routes";

export const RouteKeyZ = z.enum(["outward", "inward"]);

const list = z.array(z.string().trim().max(254)).max(30);
export const RouteSettingsZ = z.object({
  enabled: z.boolean(),
  mailbox: z.string().trim().max(254),
  toList: list,
  ccList: list,
  bccList: list,
  subjectTemplate: z.string().max(300),
  bodyTemplate: z.string().max(10_000),
  attachmentName: z.string().trim().max(200),
  autoAck: z.boolean(),
});

export type StoredRoute = RouteSettings & { saved: boolean; updatedAt: string | null; updatedBy: string | null };

export async function loadRoutes(): Promise<Record<RouteKey, StoredRoute>> {
  const rows = await prisma.emailRoute.findMany();
  const out = {} as Record<RouteKey, StoredRoute>;
  for (const key of ["outward", "inward"] as const) {
    const row = rows.find(r => r.route === key);
    out[key] = row
      ? {
          enabled: row.enabled, mailbox: row.mailbox, toList: row.toList, ccList: row.ccList,
          bccList: row.bccList, subjectTemplate: row.subjectTemplate, bodyTemplate: row.bodyTemplate,
          attachmentName: row.attachmentName, autoAck: row.autoAck,
          saved: true, updatedAt: row.updatedAt.toISOString(), updatedBy: row.updatedBy,
        }
      : { ...DEFAULTS[key], saved: false, updatedAt: null, updatedBy: null };
  }
  return out;
}

export async function saveRoute(route: RouteKey, s: RouteSettings, by: string) {
  const data = { ...s, updatedBy: by };
  return prisma.emailRoute.upsert({ where: { route }, create: { route, ...data }, update: data });
}
