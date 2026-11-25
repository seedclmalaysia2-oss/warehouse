import { getAccess, guardDept } from "@/lib/auth";
import { findPhoto, markPhotoDeleted } from "@/lib/consignment/photo-store";
import { DriveError, binPhoto, downloadPhoto } from "@/lib/gdrive";

type Ctx = { params: Promise<{ id: string }> };

const idOf = async (ctx: Ctx) => {
  const raw = (await ctx.params).id;
  return /^\d{1,15}$/.test(raw) ? Number(raw) : null;
};
const fail = (error: string, status: number) => Response.json({ error }, { status });
const driveFail = (e: unknown, fallback: string) => fail(e instanceof DriveError ? e.message : fallback, 502);

/** The image, passed through from Drive so only signed-in warehouse staff can see it. */
export async function GET(_req: Request, ctx: Ctx) {
  const denied = await guardDept();
  if (denied) return denied;
  const id = await idOf(ctx);
  if (id === null) return fail("Unknown photo.", 400);
  try {
    const photo = await findPhoto(id);
    if (!photo) return fail("That photo has been removed.", 404);
    const file = await downloadPhoto(photo.driveFileId);
    return new Response(file.body, {
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Disposition": `inline; filename="${photo.fileName.replace(/[^\x20-\x7e]|["\\]/g, "_")}"`,
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (e) {
    return driveFail(e, "Could not load the photo.");
  }
}

/** Remove a photo taken by mistake. The Drive file goes to the bin; the database row is kept, marked deleted. */
export async function DELETE(_req: Request, ctx: Ctx) {
  const denied = await guardDept();
  if (denied) return denied;
  const id = await idOf(ctx);
  if (id === null) return fail("Unknown photo.", 400);
  try {
    const photo = await findPhoto(id);
    if (!photo) return fail("That photo has already been removed.", 404);
    await binPhoto(photo.driveFileId);
    const access = await getAccess();
    await markPhotoDeleted(id, access.kind === "ok" ? access.staff.email : "unknown");
    return Response.json({ ok: true });
  } catch (e) {
    return driveFail(e, "Could not delete the photo.");
  }
}
