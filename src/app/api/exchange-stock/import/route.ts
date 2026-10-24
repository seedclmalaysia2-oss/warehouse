import { getAccess, guardDept } from "@/lib/auth";
import { ListingError, parseListing } from "@/lib/exchange/parse";
import { importListing } from "@/lib/exchange/store";
import { readGrid } from "@/lib/exchange/xlsx";

const MAX_BYTES = 4 * 1024 * 1024; // Vercel caps request bodies at 4.5 MB

export async function POST(req: Request) {
  const denied = await guardDept();
  if (denied) return denied;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const kind = form?.get("kind");
  if (!(file instanceof File) || (kind !== "issue" && kind !== "receive"))
    return Response.json({ error: "Choose a Stock Issue or Stock Receive listing file." }, { status: 400 });
  if (!/\.xlsx$/i.test(file.name)) return Response.json({ error: "The listing must be an .xlsx file." }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "That file is too large (4 MB max)." }, { status: 413 });

  let parsed;
  try {
    parsed = parseListing(await readGrid(await file.arrayBuffer()));
  } catch (e) {
    const msg = e instanceof ListingError ? e.message : "Could not read that file as an .xlsx listing.";
    return Response.json({ error: msg }, { status: 422 });
  }
  if (parsed.kind !== kind) {
    const is = parsed.kind === "issue" ? "Stock Issue" : "Stock Receive";
    return Response.json({ error: `This is a ${is} listing — drop it in the ${is} box.` }, { status: 422 });
  }

  const access = await getAccess();
  const by = access.kind === "ok" ? access.staff.email : "unknown";
  try {
    const result = await importListing(parsed, file.name, by);
    return Response.json({ ok: true, ...result });
  } catch {
    return Response.json({ error: "Could not save. Check that the exchange tables have been created (0003 SQL)." }, { status: 500 });
  }
}
