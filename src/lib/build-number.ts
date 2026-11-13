// The running build number shown under the brand in the side menu.
// Vercel builds without the git history, so the number can't be counted from commits at build time.
// Instead each live (production) deployment takes the next number the first time a page is opened,
// kept in the shared table public.app_build (app = 'warehouse'), so every later page view and every
// server instance agrees. Preview deployments and the dev server take no number.
import { prisma } from "@/lib/db";

/** Builds before this scheme started: the 54 commits on main on 13 Nov 2026. The first live build is 55. */
const BEFORE = 54;

const SHA = process.env.VERCEL_GIT_COMMIT_SHA ?? "";
const LIVE = process.env.VERCEL_ENV === "production";

/** The month the build went live (YYYYMM, Malaysia time) and its number. */
export type Build = { month: string; n: number };

/** How the side menu writes it: "202611 build 00055". */
export const buildLabel = (b: Build) => `${b.month} build ${String(b.n).padStart(5, "0")}`;

let cached: Promise<Build | null> | null = null;

/** This deployment's build, or null when it isn't the live site (or the lookup failed; retried next request). */
export function buildNumber(): Promise<Build | null> {
  if (!LIVE || !SHA) return Promise.resolve(null);
  cached ??= assign().then(b => { if (!b) cached = null; return b; }).catch(() => { cached = null; return null; });
  return cached;
}

async function assign(): Promise<Build | null> {
  // Two first views at the same moment: the insert is skipped for the second, and both read the same row.
  await prisma.$executeRaw`
    INSERT INTO public.app_build (app, sha, n)
    SELECT 'warehouse', ${SHA}, COALESCE(MAX(n), ${BEFORE}) + 1
    FROM public.app_build WHERE app = 'warehouse'
    ON CONFLICT (app, sha) DO NOTHING`;
  const rows = await prisma.$queryRaw<{ n: number; went_live: Date }[]>`
    SELECT n, went_live FROM public.app_build WHERE app = 'warehouse' AND sha = ${SHA}`;
  const row = rows[0];
  const n = Number(row?.n);
  if (!row || !Number.isFinite(n)) return null;
  // The row is written once, when the build first went live.
  const month = new Date(new Date(row.went_live).getTime() + 8 * 3600_000).toISOString().slice(0, 7).replace("-", "");
  return { month, n };
}
