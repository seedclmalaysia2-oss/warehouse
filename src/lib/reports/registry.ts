// Every report the Reports page offers, and how each one is built. Server only:
// the loaders read the database. Callers check access (guardDept / the (dash)
// layout) first — Prisma bypasses row level security.
import { prisma } from "@/lib/db";
import {
  BANDS, OVER_YEAR_FROM, UNDATED, ageText, buildOutletRows, csgFiles, docKey, groupLines, matches, todayISO, withAge,
  type AgedLine, type Filters,
} from "@/lib/consignment/analyze";
import { loadSnapshot } from "@/lib/consignment/store";
import { loadDocNumbers } from "@/lib/consignment/doc-store";
import { loadTrash } from "@/lib/consignment/trash-store";
import { loadIssueStatuses } from "@/lib/exchange/store";
import { OVERDUE_DAYS } from "@/lib/exchange/match";
import type { ReportData, ReportFilters, ReportMeta, Row } from "./types";

export const REPORTS: ReportMeta[] = [
  {
    id: "outlet-stock", group: "ECP Consignment", title: "Consignment stock by outlet",
    description: "Every outlet with its units, CSG count, oldest CSG, stock over a year old, refresh flags and CSG files uploaded.",
    use: "Monthly stock review; hand to each salesman for their outlets.", filters: ["owner", "state"],
  },
  {
    id: "ageing", group: "ECP Consignment", title: "Stock ageing by salesman",
    description: "Units per salesman split into age bands (under 6 months to over 2 years), with the share over a year.",
    use: "Management summary: who is carrying old stock.", filters: ["state"],
  },
  {
    id: "csg-lines", group: "ECP Consignment", title: "CSG detail listing",
    description: "One line per CSG and product at every outlet: date, age, quantity and flags. The full stock list.",
    use: "Stock take and reconciliation against the ERP.", filters: ["owner", "state"],
  },
  {
    id: "refresh", group: "ECP Consignment", title: "Refresh and clearance list",
    description: "CSG lines marked red (needs refresh) or yellow (2027 clearance), oldest first.",
    use: "Action list for salesmen to swap or collect stock.", filters: ["owner", "state"],
  },
  {
    id: "missing-files", group: "ECP Consignment", title: "CSG files not uploaded",
    description: "CSGs in the workbook with no ERP CSG document uploaded yet, by outlet.",
    use: "Admin follow-up: which CSG files to find and upload.", filters: ["owner", "state"],
  },
  {
    id: "csr-returns", group: "ECP Consignment", title: "CSR returns register",
    description: "Every CSR uploaded: the CSG it came off, the outlet, date and boxes returned.",
    use: "Month-end returns check.", filters: ["from", "to"],
  },
  {
    id: "exchange-overdue", group: "Exchange Stock", title: "Exchange items not returned",
    description: `Exchange issues still open after ${OVERDUE_DAYS} days, by customer, oldest first.`,
    use: "Weekly chase list for customer service.", filters: [],
  },
  {
    id: "deleted-files", group: "Audit", title: "Deleted files log",
    description: "Every CSG and CSR file deleted, who deleted it and when, and whether it was restored.",
    use: "Audit trail; check nothing was removed by mistake.", filters: ["from", "to"],
  },
];

export const reportMeta = (id: string) => REPORTS.find(r => r.id === id);

const sumBy = (rows: Row[], key: string) => rows.reduce((s, r) => s + (typeof r[key] === "number" ? (r[key] as number) : 0), 0);
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const stamp = (d: Date) =>
  d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur" });
const who = (s: string | null) => (s ? s.split("@")[0] : "");
const dayStart = (s: string) => (s ? new Date(`${s}T00:00:00+08:00`) : undefined);
const dayAfter = (s: string) => (s ? new Date(Date.parse(`${s}T00:00:00+08:00`) + 86_400_000) : undefined);

/** Salesman and state choices for the filter bar. */
export async function filterChoices(): Promise<{ owners: string[]; states: string[] }> {
  try {
    const snap = await loadSnapshot();
    if (!snap) return { owners: [], states: [] };
    const owners = [...new Set(snap.lines.map(l => l.owner).filter(Boolean))].sort();
    const states = [...new Set(snap.outlets.map(o => o.state).filter(Boolean))].sort();
    return { owners, states };
  } catch {
    return { owners: [], states: [] };
  }
}

async function consignment(f: ReportFilters) {
  const snap = await loadSnapshot();
  if (!snap) throw new ReportUnavailable("No consignment workbook has been uploaded yet.");
  const today = todayISO();
  const filters: Filters = { owner: f.owner, state: f.state, product: "" };
  const lines = snap.lines.filter(l => matches(l, filters)).map(l => withAge(l, today));
  return { snap, lines, filters, today };
}

export class ReportUnavailable extends Error {}

const tone = (l: AgedLine) => (l.needsRefresh ? "danger" : l.tag === "clearance" ? "warn" : null);
const flags = (l: AgedLine) =>
  [l.needsRefresh && "Needs refresh", l.tag === "clearance" && "2027 clearance", l.tag === "new" && "New CSG", l.tag === "adjusted" && "Refreshed", l.added && "Added by upload"]
    .filter(Boolean).join(", ");
const bandName = (b: number) => (b < BANDS.length ? BANDS[b].label : UNDATED.label);

export async function buildReport(id: string, f: ReportFilters): Promise<ReportData> {
  const meta = reportMeta(id);
  if (!meta) throw new ReportUnavailable("Unknown report.");
  const base = { id, title: meta.title, notes: [] as string[], landscape: true };

  switch (id) {
    case "outlet-stock": {
      const { snap, lines, filters } = await consignment(f);
      const docs = new Set((await loadDocNumbers()).map(docKey));
      const outlets = buildOutletRows(lines, snap.outlets, filters).sort((a, b) => a.owners.join().localeCompare(b.owners.join()) || a.name.localeCompare(b.name));
      const rows: Row[] = outlets.map(o => {
        const files = csgFiles(o.lines, docs);
        return {
          outlet: o.name, owner: o.owners.join(", "), town: o.town, state: o.state, units: o.units, csgs: o.csgDocs,
          oldest: o.units ? ageText(o.oldestDays) : "", over: o.overYearUnits, refresh: o.refreshLines,
          files: files.need ? `${files.have} / ${files.need}` : "",
          _tone: o.refreshLines ? "danger" : null,
        };
      });
      return {
        ...base, subtitle: "Units held at each ECP outlet from the latest consignment workbook, with CSRs taken off.",
        columns: [
          { key: "outlet", label: "Outlet", width: 22 }, { key: "owner", label: "Salesman", width: 10 },
          { key: "town", label: "Town", width: 10 }, { key: "state", label: "State", width: 9 },
          { key: "units", label: "Units", kind: "int", width: 7 }, { key: "csgs", label: "CSGs", kind: "int", width: 6 },
          { key: "oldest", label: "Oldest CSG", width: 9 }, { key: "over", label: "Units > 1 yr", kind: "int", width: 8 },
          { key: "refresh", label: "Refresh lines", kind: "int", width: 8 }, { key: "files", label: "CSG files", width: 8 },
        ],
        rows,
        totals: { outlet: `${rows.length} outlets`, units: sumBy(rows, "units"), csgs: sumBy(rows, "csgs"), over: sumBy(rows, "over"), refresh: sumBy(rows, "refresh") },
        summary: [
          { label: "Outlets holding stock", value: String(outlets.filter(o => o.units > 0).length) },
          { label: "Units on consignment", value: sumBy(rows, "units").toLocaleString("en-US") },
          { label: "Units over 1 year", value: sumBy(rows, "over").toLocaleString("en-US"), tone: "warn" },
          { label: "Lines needing refresh", value: String(sumBy(rows, "refresh")), tone: sumBy(rows, "refresh") ? "danger" : "ok" },
        ],
        notes: [`Workbook: ${snap.info.fileName || "consignment workbook"}, uploaded ${stamp(snap.info.uploadedAt)}.`, "Rows in red have lines marked for refresh."],
      };
    }

    case "ageing": {
      const { lines } = await consignment({ ...f, owner: "" });
      const groups = groupLines(lines, "owner").sort((a, b) => a.label.localeCompare(b.label));
      const bandCols = [...BANDS.map((b, i) => ({ key: `b${i}`, label: b.label })), { key: `b${BANDS.length}`, label: UNDATED.label }];
      const rows: Row[] = groups.map(g => ({
        owner: g.label, outlets: g.outlets, units: g.units,
        ...Object.fromEntries(g.bands.map((n, i) => [`b${i}`, n])),
        share: g.units ? g.overYearUnits / g.units : 0,
        _tone: g.units && g.overYearUnits / g.units >= 0.5 ? "danger" : null,
      }));
      const units = sumBy(rows, "units");
      const over = lines.filter(l => l.band >= OVER_YEAR_FROM && l.band < BANDS.length).reduce((s, l) => s + l.qty, 0);
      return {
        ...base, subtitle: "Consignment units per salesman by how long since the CSG date.",
        columns: [
          { key: "owner", label: "Salesman", width: 14 }, { key: "outlets", label: "Outlets", kind: "int", width: 7 },
          { key: "units", label: "Units", kind: "int", width: 8 },
          ...bandCols.map(c => ({ ...c, kind: "int" as const, width: 9 })),
          { key: "share", label: "% over 1 yr", kind: "pct", width: 8 },
        ],
        rows,
        totals: {
          owner: "All salesmen", outlets: null, units,
          ...Object.fromEntries(bandCols.map(c => [c.key, sumBy(rows, c.key)])), share: units ? over / units : 0,
        },
        summary: [
          { label: "Units on consignment", value: units.toLocaleString("en-US") },
          { label: "Over 1 year", value: `${over.toLocaleString("en-US")} (${units ? Math.round((over / units) * 100) : 0}%)`, tone: "warn" },
          { label: "Over 2 years", value: sumBy(rows, `b${BANDS.length - 1}`).toLocaleString("en-US"), tone: "danger" },
        ],
        notes: ["Age = today minus the CSG date. The workbook has no expiry dates.", "Key accounts (Dr Specs, Jac's and others) are listed on their own rows, not inside Alan's.", "Rows in red have half or more of their units over a year old."],
      };
    }

    case "csg-lines":
    case "refresh": {
      const { lines } = await consignment(f);
      const pick = id === "refresh" ? lines.filter(l => l.needsRefresh || l.tag === "clearance") : lines;
      const sorted = [...pick].sort((a, b) =>
        id === "refresh" ? (b.days ?? -1) - (a.days ?? -1) : a.owner.localeCompare(b.owner) || a.outlet.localeCompare(b.outlet) || (b.days ?? -1) - (a.days ?? -1));
      const rows: Row[] = sorted.map(l => ({
        outlet: l.outlet, owner: l.owner, state: l.state, csg: l.csgNo ?? "", csr: l.latestCode ?? "", date: l.csgDate, age: ageText(l.days),
        band: bandName(l.band), product: l.product, qty: l.qty, flags: flags(l), _tone: tone(l),
      }));
      return {
        ...base,
        subtitle: id === "refresh" ? "Lines the workbook marks red (needs refresh) or yellow (2027 clearance)." : "Every CSG line at every outlet in the latest workbook.",
        columns: [
          { key: "outlet", label: "Outlet", width: 18 }, { key: "owner", label: "Salesman", width: 9 }, { key: "state", label: "State", width: 8 },
          { key: "csg", label: "CSG No", kind: "mono", width: 9 }, { key: "csr", label: "Latest CSR", kind: "mono", width: 9 },
          { key: "date", label: "CSG date", kind: "date", width: 8 }, { key: "age", label: "Age", width: 7 },
          { key: "product", label: "Product", width: 16 }, { key: "qty", label: "Qty", kind: "int", width: 5 }, { key: "flags", label: "Flags", width: 11 },
        ],
        rows,
        totals: { outlet: `${rows.length} lines`, qty: sumBy(rows, "qty") },
        summary: id === "refresh"
          ? [
              { label: "Needs refresh", value: `${pick.filter(l => l.needsRefresh).length} lines`, tone: "danger" },
              { label: "2027 clearance", value: `${pick.filter(l => l.tag === "clearance").length} lines`, tone: "warn" },
              { label: "Units affected", value: sumBy(rows, "qty").toLocaleString("en-US") },
            ]
          : [
              { label: "Lines", value: rows.length.toLocaleString("en-US") },
              { label: "Units", value: sumBy(rows, "qty").toLocaleString("en-US") },
              { label: "Outlets", value: String(new Set(pick.map(l => l.outlet)).size) },
            ],
        notes: ["Red rows need refresh; amber rows are 2027 clearance."],
      };
    }

    case "missing-files": {
      const { lines } = await consignment(f);
      const docs = new Set((await loadDocNumbers()).map(docKey));
      const seen = new Map<string, Row>();
      for (const l of lines) {
        if (!l.csgNo || /^CSR/i.test(l.csgNo) || docs.has(docKey(l.csgNo))) continue;
        const k = `${l.outlet}|${docKey(l.csgNo)}`;
        const r = seen.get(k);
        if (r) { r.units = (r.units as number) + l.qty; continue; }
        seen.set(k, { outlet: l.outlet, owner: l.owner, state: l.state, csg: l.csgNo, date: l.csgDate, age: ageText(l.days), units: l.qty });
      }
      const rows = [...seen.values()].sort((a, b) => String(a.owner).localeCompare(String(b.owner)) || String(a.outlet).localeCompare(String(b.outlet)));
      const all = csgFiles(lines.filter(l => l.csgNo && !/^CSR/i.test(l.csgNo)), docs);
      return {
        ...base, subtitle: "CSG numbers in the workbook whose ERP CSG document has not been uploaded.",
        columns: [
          { key: "outlet", label: "Outlet", width: 24 }, { key: "owner", label: "Salesman", width: 10 }, { key: "state", label: "State", width: 10 },
          { key: "csg", label: "CSG No", kind: "mono", width: 11 }, { key: "date", label: "CSG date", kind: "date", width: 10 },
          { key: "age", label: "Age", width: 8 }, { key: "units", label: "Units", kind: "int", width: 7 },
        ],
        rows,
        totals: { outlet: `${rows.length} CSGs`, units: sumBy(rows, "units") },
        summary: [
          { label: "CSG files uploaded", value: `${all.have} of ${all.need}`, tone: all.have === all.need ? "ok" : undefined },
          { label: "Still to upload", value: String(all.need - all.have), tone: all.need - all.have ? "warn" : "ok" },
          { label: "Outlets affected", value: String(new Set(rows.map(r => r.outlet)).size) },
        ],
        notes: ["Upload the files on each outlet's page, or several at once on Upload files."],
      };
    }

    case "csr-returns": {
      const rowsDb = await prisma.consignmentReturn.findMany({
        where: {
          kind: "CSR",
          ...(f.from || f.to ? { uploadedAt: { ...(f.from ? { gte: dayStart(f.from) } : {}), ...(f.to ? { lt: dayAfter(f.to) } : {}) } } : {}),
        },
        orderBy: { uploadedAt: "desc" },
      }).catch(() => { throw new ReportUnavailable("CSR returns are not set up yet (SQL 0007)."); });
      const rows: Row[] = rowsDb.map(r => ({
        code: r.code, csg: r.csgKey, outlet: r.fromOutlet, date: iso(r.docDate), boxes: r.lineTotal,
        file: r.fileName, at: stamp(r.uploadedAt), by: who(r.uploadedBy),
      }));
      return {
        ...base, subtitle: "CSRs uploaded, newest first. Each CSR's boxes come off the CSG it names.",
        columns: [
          { key: "code", label: "CSR No", kind: "mono", width: 11 }, { key: "csg", label: "CSG No", kind: "mono", width: 10 },
          { key: "outlet", label: "Outlet", width: 22 }, { key: "date", label: "CSR date", kind: "date", width: 9 },
          { key: "boxes", label: "Boxes", kind: "int", width: 7 }, { key: "file", label: "File", width: 18 },
          { key: "at", label: "Uploaded", width: 13 }, { key: "by", label: "By", width: 9 },
        ],
        rows,
        totals: { code: `${rows.length} CSRs`, boxes: sumBy(rows, "boxes") },
        summary: [
          { label: "CSRs", value: String(rows.length) },
          { label: "Boxes returned", value: sumBy(rows, "boxes").toLocaleString("en-US") },
          { label: "CSGs affected", value: String(new Set(rowsDb.map(r => r.csgKey)).size) },
        ],
        notes: ["Period filters on the upload date."],
      };
    }

    case "exchange-overdue": {
      const all = await loadIssueStatuses().catch(() => { throw new ReportUnavailable("Exchange Stock is not set up yet (SQL 0003)."); });
      const open = all.filter(s => s.overdue).sort((a, b) => a.location.localeCompare(b.location) || b.ageDays - a.ageDays);
      const rows: Row[] = open.map(s => ({
        customer: s.location, doc: s.docNo, date: iso(s.docDate), product: s.description, power: s.power ?? "",
        issued: s.quantity, returned: s.returned, open: s.open, days: s.ageDays, _tone: s.ageDays > OVERDUE_DAYS * 4 ? "danger" : "warn",
      }));
      return {
        ...base, landscape: true, subtitle: `Exchange stock issued to customers and not returned within ${OVERDUE_DAYS} days.`,
        columns: [
          { key: "customer", label: "Customer", width: 20 }, { key: "doc", label: "Issue doc", kind: "mono", width: 10 },
          { key: "date", label: "Issued", kind: "date", width: 8 }, { key: "product", label: "Product", width: 24 },
          { key: "power", label: "Power", width: 6 }, { key: "issued", label: "Issued qty", kind: "int", width: 6 },
          { key: "returned", label: "Returned", kind: "int", width: 6 }, { key: "open", label: "Open", kind: "int", width: 5 },
          { key: "days", label: "Days out", kind: "int", width: 6 },
        ],
        rows,
        totals: { customer: `${rows.length} lines`, open: sumBy(rows, "open") },
        summary: [
          { label: "Overdue lines", value: String(rows.length), tone: rows.length ? "danger" : "ok" },
          { label: "Units not returned", value: sumBy(rows, "open").toLocaleString("en-US") },
          { label: "Customers", value: String(new Set(open.map(s => s.location)).size) },
        ],
        notes: [`Red rows have been out more than ${OVERDUE_DAYS * 4} days.`, "Lines marked returned or waived on the Exchange Stock page are left out."],
      };
    }

    case "deleted-files": {
      const list = await loadTrash({ from: dayStart(f.from), to: dayAfter(f.to), take: 5000 });
      const rows: Row[] = list.map(e => ({
        kind: e.kind, code: e.code, outlet: e.outlet, boxes: e.boxes, file: e.fileName,
        deleted: stamp(new Date(e.deletedAt)), by: who(e.deletedBy),
        status: e.restoredAt ? `Restored ${stamp(new Date(e.restoredAt))} by ${who(e.restoredBy)}` : "Deleted",
        _tone: e.restoredAt ? "ok" : null,
      }));
      return {
        ...base, subtitle: "CSG and CSR files deleted from the dashboard, newest first.",
        columns: [
          { key: "kind", label: "Type", width: 5 }, { key: "code", label: "Number", kind: "mono", width: 11 },
          { key: "outlet", label: "Outlet", width: 20 }, { key: "boxes", label: "Boxes", kind: "int", width: 6 },
          { key: "file", label: "File", width: 16 }, { key: "deleted", label: "Deleted", width: 13 },
          { key: "by", label: "By", width: 9 }, { key: "status", label: "Status", width: 20 },
        ],
        rows,
        summary: [
          { label: "Deleted", value: String(rows.length) },
          { label: "Restored", value: String(list.filter(e => e.restoredAt).length), tone: "ok" },
          { label: "Still deleted", value: String(list.filter(e => !e.restoredAt).length) },
        ],
        notes: ["Deleted files can be restored from the Deleted files section at the bottom of each outlet's page."],
      };
    }
  }
  throw new ReportUnavailable("Unknown report.");
}

export function readFilters(q: Record<string, string | string[] | undefined> | URLSearchParams): ReportFilters {
  const get = (k: string) => {
    const v = q instanceof URLSearchParams ? q.get(k) : q[k];
    return typeof v === "string" ? v.trim().slice(0, 80) : "";
  };
  const date = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "");
  return { owner: get("owner"), state: get("state"), from: date(get("from")), to: date(get("to")) };
}
