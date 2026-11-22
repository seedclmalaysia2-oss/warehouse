import { NextResponse } from "next/server";
import { getAccess } from "@/lib/auth";

// The signed-in person's own name, for the welcome screen shown while the dashboard loads after sign-in
// (components/welcome-splash.tsx). Nothing about anyone else; nothing at all unless signed in with access.
export const dynamic = "force-dynamic";

export async function GET() {
  const a = await getAccess();
  const name = a.kind === "ok" ? a.staff.full_name?.trim() || null : null;
  return NextResponse.json({ name }, { headers: { "Cache-Control": "private, no-store" } });
}
