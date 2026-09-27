// Department access control — same model as the GM dashboard.
//
// Identity comes from the shared SEED CL Supabase Auth. Access to THIS
// dashboard means having "warehouse" in `app.staff.departments`, or is_admin.
//
// Prisma connects with the service role and BYPASSES row level security, so
// every server page and route handler that reads data must check access itself.
// Middleware is a convenience redirect only (CVE-2025-29927).
//
// The roster is read through Prisma rather than PostgREST so the `app` schema
// stays out of the exposed-schemas list.
import { prisma } from "@/lib/db";
import { supabaseServer } from "@/lib/supabase/server";

export const DEPARTMENT = "warehouse";

export type Staff = {
  user_id: string;
  email: string;
  full_name: string | null;
  departments: string[];
  is_admin: boolean;
  active: boolean;
};

export type Access =
  | { kind: "signed-out" }
  | { kind: "no-access"; email: string }
  | { kind: "ok"; staff: Staff };

/** The signed-in user's staff row, or null when signed out / not on the roster. */
export async function getStaff(): Promise<Staff | null> {
  const access = await getAccess();
  return access.kind === "ok" ? access.staff : null;
}

/** Who is asking, and whether they may open this dashboard. */
export async function getAccess(): Promise<Access> {
  const supabase = await supabaseServer();
  // getUser() validates the JWT with Supabase rather than trusting the cookie.
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { kind: "signed-out" };

  const rows = await prisma.$queryRaw<Staff[]>`
    select user_id::text, email, full_name, departments, is_admin, active
      from app.staff
     where user_id = ${user.id}::uuid
     limit 1
  `;
  const staff = rows[0];
  if (!staff || !staff.active || !(staff.is_admin || staff.departments.includes(DEPARTMENT))) {
    return { kind: "no-access", email: user.email ?? "" };
  }
  return { kind: "ok", staff };
}

/**
 * One-line guard for API routes:
 *
 *   const denied = await guardDept();
 *   if (denied) return denied;
 */
export async function guardDept(): Promise<Response | null> {
  if ((await getAccess()).kind === "ok") return null;
  return Response.json(
    { error: "You don't have access to the Warehouse dashboard." },
    { status: 403 },
  );
}
