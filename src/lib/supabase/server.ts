// Supabase client for server components and route handlers.
//
// The hub shares its identity with every SEED CL department dashboard: one
// Supabase project, one auth.users table, one session cookie. Someone signed in
// at sales.seedclmalaysiastore.com is already signed in here.
//
// The `cookieMethods` variable is annotated deliberately. `createServerClient`
// accepts `CookieMethodsServer | CookieMethodsServerDeprecated`, and TypeScript
// will not contextually type a callback's parameters through a union — passing
// the object inline makes `setAll`'s parameter an implicit `any` and fails the
// build. Annotating with the single type gives the callbacks their real types.
import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function supabaseServer() {
  const cookieStore = await cookies();

  const cookieMethods: CookieMethodsServer = {
    getAll: () => cookieStore.getAll(),
    setAll: (cookiesToSet) => {
      try {
        cookiesToSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options),
        );
      } catch {
        // Read-only cookie store inside a Server Component. The middleware
        // refreshes the session, so there is nothing to do here.
      }
    },
  };

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: cookieMethods },
  );
}
