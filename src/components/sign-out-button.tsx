"use client";
import { supabaseBrowser } from "@/lib/supabase/client";

export function SignOutButton() {
  async function signOut() {
    await supabaseBrowser().auth.signOut();
    // Hard navigation so the middleware sees the cleared cookie.
    window.location.assign("/login");
  }
  return (
    <button type="button" className="signout" onClick={signOut}>
      Sign out
    </button>
  );
}
