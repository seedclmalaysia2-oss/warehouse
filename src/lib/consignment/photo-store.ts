// The list of CSG proof photos. Pages and routes call guardDept() / the (dash)
// layout first, because Prisma bypasses row level security.
import { prisma } from "@/lib/db";

export type PhotoMeta = { id: number; uploadedAt: string; uploadedBy: string | null };

/** False until 0009 has been applied. */
export async function photosReady(): Promise<boolean> {
  try {
    await prisma.consignmentPhoto.findFirst({ select: { id: true } });
    return true;
  } catch {
    return false;
  }
}

/** An outlet's photos by CSG (normalised number), newest first. Never throws. */
export async function loadPhotos(outletKey: string): Promise<Record<string, PhotoMeta[]>> {
  try {
    const rows = await prisma.consignmentPhoto.findMany({
      where: { outletKey, deletedAt: null }, orderBy: { uploadedAt: "desc" },
      select: { id: true, csgKey: true, uploadedAt: true, uploadedBy: true },
    });
    const out: Record<string, PhotoMeta[]> = {};
    for (const r of rows) {
      (out[r.csgKey] ??= []).push({ id: Number(r.id), uploadedAt: r.uploadedAt.toISOString(), uploadedBy: r.uploadedBy });
    }
    return out;
  } catch {
    return {};
  }
}

export async function addPhoto(data: {
  csgKey: string; outletKey: string; outlet: string; driveFileId: string; fileName: string; bytes: number; uploadedBy: string;
}): Promise<number> {
  const row = await prisma.consignmentPhoto.create({ data, select: { id: true } });
  return Number(row.id);
}

/** A photo that has not been deleted. */
export function findPhoto(id: number) {
  return prisma.consignmentPhoto.findFirst({
    where: { id: BigInt(id), deletedAt: null }, select: { driveFileId: true, fileName: true },
  });
}

export async function markPhotoDeleted(id: number, by: string) {
  await prisma.consignmentPhoto.update({ where: { id: BigInt(id) }, data: { deletedAt: new Date(), deletedBy: by } });
}
