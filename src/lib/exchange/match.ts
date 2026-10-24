// Which exchange issues have not come back? Pure logic, no I/O.
//
// An "issue" line sends stock to a customer (Location) in an exchange; a
// "receive" line is the exchange return. Returns are matched to issues per
// Location + product (the description, see productKey), oldest issue first, and
// only against receives dated on or after the issue. Stock ID is a lot code and
// is NOT used: a diff-power return comes back under a different Stock ID.
// An issue still open after OVERDUE_DAYS is overdue.
//
// Dates are UTC-midnight Dates (what Prisma gives for @db.Date columns).

export const OVERDUE_DAYS = 7;

export type IssueLine = {
  id: number;
  docNo: string;
  docDate: Date;
  location: string;
  stockId: string;
  description: string;
  power?: string | null;
  quantity: number;
};

export type ReceiveLine = {
  location: string;
  description: string;
  docDate: Date;
  quantity: number;
};

export type Resolution = { issueId: number; status: "returned" | "waived" };

export type IssueStatus = IssueLine & {
  returned: number;
  open: number;
  ageDays: number;
  overdue: boolean;
  resolved: "returned" | "waived" | null;
};

const DAY = 86_400_000;
/** Product identity for matching: description, ignoring case and extra spaces. */
export const productKey = (description: string) => description.trim().replace(/\s+/g, " ").toUpperCase();
const key = (l: { location: string; description: string }) =>
  `${l.location.trim().toUpperCase()}\u0000${productKey(l.description)}`;

/** Today's calendar date in Malaysia (UTC+8) as a UTC-midnight Date. */
export function todayMYT(now: number = Date.now()): Date {
  const d = new Date(now + 8 * 3_600_000);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function matchExchanges(
  issues: IssueLine[],
  receives: ReceiveLine[],
  resolutions: Resolution[],
  today: Date,
  overdueDays: number = OVERDUE_DAYS,
): IssueStatus[] {
  const resolved = new Map(resolutions.map(r => [r.issueId, r.status]));

  // Receive pools per Location + product, oldest first, each with what is left to give.
  const pools = new Map<string, { date: number; left: number }[]>();
  for (const r of [...receives].sort((a, b) => a.docDate.getTime() - b.docDate.getTime())) {
    const k = key(r);
    if (!pools.has(k)) pools.set(k, []);
    pools.get(k)!.push({ date: r.docDate.getTime(), left: r.quantity });
  }

  const byId = new Map<number, IssueStatus>();
  const ordered = [...issues].sort((a, b) => a.docDate.getTime() - b.docDate.getTime() || a.id - b.id);
  for (const issue of ordered) {
    const manual = resolved.get(issue.id) ?? null;
    let returned = 0;
    if (!manual) {
      // Resolved issues don't consume receives: those receives belong to other issues.
      for (const lot of pools.get(key(issue)) ?? []) {
        if (returned >= issue.quantity) break;
        if (lot.left <= 0 || lot.date < issue.docDate.getTime()) continue;
        const take = Math.min(lot.left, issue.quantity - returned);
        lot.left -= take;
        returned += take;
      }
    }
    const open = manual ? 0 : issue.quantity - returned;
    const ageDays = Math.max(0, Math.round((today.getTime() - issue.docDate.getTime()) / DAY));
    byId.set(issue.id, {
      ...issue,
      returned: manual === "returned" ? issue.quantity : returned,
      open,
      ageDays,
      overdue: open > 0 && ageDays > overdueDays,
      resolved: manual,
    });
  }
  // Keep the caller's order.
  return issues.map(i => byId.get(i.id)!);
}
