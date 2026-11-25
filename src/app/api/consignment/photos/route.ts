import { getAccess, guardDept } from "@/lib/auth";
import { docKey, outletKey } from "@/lib/consignment/analyze";
import { addPhoto, photosReady } from "@/lib/consignment/photo-store";
import { loadCsgOutlets } from "@/lib/consignment/store";
import { DriveError, binPhoto, driveConfigured, uploadPhoto } from "@/lib/gdrive";

// The phone shrinks a photo before sending it; Vercel caps request bodies at 4.5 MB.
const MAX_BYTES = 4 * 1024 * 1024;
export const maxDuration = 60;

const fail = (error: string, status: number) => Response.json({ error }, { status });

/** Keep one proof photo for a CSG at an outlet: the image to Google Drive, its entry to the database. */
export async function POST(req: Request) {
  const denied = await guardDept();
  if (denied) return denied;

  const form = await req.formData().catch(() => null);
  const file = form?.get("photo");
  const csg = String(form?.get("csg") ?? "").trim();
  const wanted = outletKey(String(form?.get("outlet") ?? ""));
  if (!(file instanceof File) || !csg || !wanted) return fail("Take a photo first.", 400);
  if (file.size > MAX_BYTES) return fail("That photo is too large (4 MB max).", 413);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return fail("Only photos (JPEG) can be kept.", 415);

  const key = docKey(csg);
  const outlet = (await loadCsgOutlets()).get(key)?.find(o => outletKey(o) === wanted);
  if (!outlet) return fail(`${key} is not listed at this outlet.`, 422);
  if (!driveConfigured()) return fail("Google Drive is not set up yet.", 503);
  // Check the table first, so a photo never lands in Drive with nothing pointing at it.
  if (!(await photosReady())) return fail("The photo table is missing. Run the 0009 SQL in Supabase.", 503);

  const access = await getAccess();
  const by = access.kind === "ok" ? access.staff.email : "unknown";
  // Malaysia time, as the file name will be read in Drive.
  const stamp = new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 19).replace("T", " ").replace(/:/g, ".");
  const fileName = `${key} ${stamp}.jpg`;
  try {
    const driveFileId = await uploadPhoto(outlet, fileName, bytes);
    try {
      const id = await addPhoto({ csgKey: key, outletKey: wanted, outlet, driveFileId, fileName, bytes: bytes.length, uploadedBy: by });
      return Response.json({ ok: true, id });
    } catch (e) {
      await binPhoto(driveFileId).catch(() => {});
      throw e;
    }
  } catch (e) {
    return fail(e instanceof DriveError ? e.message : "Could not save the photo. Try again.", 502);
  }
}
