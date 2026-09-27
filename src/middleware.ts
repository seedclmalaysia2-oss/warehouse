import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";

/**
 * Refreshes the Supabase session cookie and bounces signed-out visitors to
 * /login before any page HTML is produced.
 *
 * The important part
 * is that it runs on the server: no warehouse data reaches a browser
 * that hasn't signed in, so there is nothing to find in "View source".
 *
 * The page itself checks the session again (see src/app/(dash)/layout.tsx). Middleware
 * has had bypass vulnerabilities in Next.js, so it is a convenience redirect
 * here, not the only thing standing between a stranger and the data.
 */
export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });

  // Annotated for the same reason as in src/lib/supabase/server.ts.
  const cookieMethods: CookieMethodsServer = {
    getAll: () => req.cookies.getAll(),
    setAll: (cookiesToSet) => {
      cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
      res = NextResponse.next({ request: req });
      cookiesToSet.forEach(({ name, value, options }) =>
        res.cookies.set(name, value, options),
      );
    },
  };

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: cookieMethods },
  );

  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = req.nextUrl;
  const onLogin = pathname.startsWith("/login");

  if (!user && !onLogin) {
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && onLogin) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
