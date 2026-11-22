"use client";

// The welcome screen shown right after signing in, while the dashboard loads (GM's choice, 2026-11-21:
// navy, the SEED logo in a white disc with a turning blue arc). It adds no wait: the login page shows it
// and starts the navigation at the same moment, and the browser keeps it on screen until the next page paints.
// The logo is the company file, only resized.
export function WelcomeSplash({ name }: { name: string }) {
  return (
    <div className="welcome" role="status" aria-live="polite">
      <div className="welcome-ring" aria-hidden="true">
        <div className="welcome-disc">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/seed-logo.png" alt="" width={130} height={68} />
        </div>
      </div>
      <p className="welcome-hi">Welcome back,</p>
      <p className="welcome-name">{name || " "}</p>
      <p className="welcome-co">SEED CONTACT LENS (M) SDN BHD</p>
      <p className="welcome-by">Powered by SEEDCLMALAYSIA</p>
    </div>
  );
}

const KEY = "wh_welcome_name";

/** The name shown last time on this phone, so the screen can show it at once; the server's answer replaces it. */
export function rememberedName(email: string): string {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null") as { email?: string; name?: string } | null;
    return v && v.email === email.trim().toLowerCase() ? v.name || "" : "";
  } catch {
    return "";
  }
}

export function rememberName(email: string, name: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ email: email.trim().toLowerCase(), name }));
  } catch {
    /* private mode: the name simply arrives from the server each time */
  }
}
