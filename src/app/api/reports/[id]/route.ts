import { getAccess, guardDept } from "@/lib/auth";
import { todayISO } from "@/lib/consignment/analyze";
import { fileStem, reportPdf, reportXlsx } from "@/lib/reports/export";
import { ReportUnavailable, buildReport, readFilters, reportMeta } from "@/lib/reports/registry";
import { filterLine } from "@/lib/reports/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** A report as a download: ?format=xlsx (Excel) or ?format=pdf, plus the same filters as the page. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guardDept();
  if (denied) return denied;

  const id = (await ctx.params).id;
  const meta = reportMeta(id);
  if (!meta) return Response.json({ error: "Unknown report." }, { status: 404 });
  const url = new URL(req.url);
  const format = url.searchParams.get("format");
  if (format !== "xlsx" && format !== "pdf") return Response.json({ error: "Format must be xlsx or pdf." }, { status: 400 });

  const filters = readFilters(url.searchParams);
  const access = await getAccess();
  const by = access.kind === "ok" ? access.staff.full_name || access.staff.email : "unknown";
  try {
    const data = await buildReport(id, filters);
    const head = {
      filters: filterLine(filters, meta.filters),
      generatedAt: new Date().toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur" }),
      by,
    };
    const stem = fileStem(data, todayISO());
    const body = format === "xlsx" ? await reportXlsx(data, head) : await reportPdf(data, head);
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": format === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/pdf",
        // PDF opens in the browser tab (view / print); Excel downloads.
        "Content-Disposition": `${format === "pdf" && url.searchParams.get("download") !== "1" ? "inline" : "attachment"}; filename="${stem}.${format}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof ReportUnavailable) return Response.json({ error: e.message }, { status: 409 });
    console.error(e);
    return Response.json({ error: "Could not build the report." }, { status: 500 });
  }
}
