"use client";
import { supabaseBrowser } from "@/lib/supabase/client";

export function SignOutButton({ label = "Sign out", className = "signout", icon = false }: { label?: string; className?: string; icon?: boolean }) {
  async function signOut() {
    await supabaseBrowser().auth.signOut();
    // Hard navigation so the middleware sees the cleared cookie.
    window.location.assign("/login");
  }
  return (
    <button type="button" className={className} onClick={signOut} aria-label={icon ? label : undefined} title={icon ? label : undefined}>
      {icon ? (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" />
        </svg>
      ) : label}
    </button>
  );
}
