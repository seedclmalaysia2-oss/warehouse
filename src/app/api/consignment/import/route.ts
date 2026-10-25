import ExcelJS from "exceljs";
import { getAccess, guardDept } from "@/lib/auth";
import { ConsignmentError, parseConsignment, type ParsedConsignment } from "@/lib/consignment/parse";
import { importConsignment } from "@/lib/consignment/store";

const MAX_BYTES = 4 * 1024 * 1024; // Vercel caps request bodies at 4.5 MB

export async function POST(req: Request) {
  const denied = await guardDept();
  if (denied) return denied;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Choose the consignment workbook (.xlsx)." }, { status: 400 });
  if (!/\.xlsx$/i.test(file.name)) return Response.json({ error: "The workbook must be an .xlsx file." }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "That file is too large (4 MB max)." }, { status: 413 });

  let parsed: ParsedConsignment;
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    parsed = parseConsignment(wb);
  } catch (e) {
    const msg = e instanceof ConsignmentError ? e.message : "Could not read that file as an .xlsx workbook.";
    return Response.json({ error: msg }, { status: 422 });
  }

  const access = await getAccess();
  const by = access.kind === "ok" ? access.staff.email : "unknown";
  try {
    const saved = await importConsignment(parsed, file.name, by);
    return Response.json({
      ok: true, ...saved,
      sheets: parsed.sheets, ignoredSheets: parsed.ignoredSheets, warnings: parsed.warnings,
    });
  } catch {
    return Response.json({ error: "Could not save. Check that the consignment tables have been created (0004 SQL)." }, { status: 500 });
  }
}
