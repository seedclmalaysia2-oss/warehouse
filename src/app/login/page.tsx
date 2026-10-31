"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

type Mode = "signin" | "forgot" | "reset";

function LoginForm() {
  const sp = useSearchParams();
  const supabase = supabaseBrowser();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");

  // Reset links come back here in three shapes. The @supabase/ssr browser
  // client runs the PKCE flow, so on its own it only understands ?code= —
  // the #access_token fragment was ignored, leaving no session and
  // updateUser failing with "Auth session missing!".
  //  • #access_token=…&refresh_token=…&type=recovery — implicit links (the
  //    sales dashboard sends these; same Supabase project). Adopt the session.
  //  • ?code=… — PKCE links requested on this site. Only the browser that
  //    asked for the link holds the code verifier needed to redeem it.
  //  • #error=…&error_code=otp_expired — expired or already-used link.
  useEffect(() => {
    const hash = new URLSearchParams((window.location.hash || "").replace(/^#/, ""));
    const code = new URLSearchParams(window.location.search).get("code");
    const clean = () => history.replaceState(null, "", window.location.pathname);
    const toReset = () => {
      setMode("reset"); setErr("");
      setInfo("You clicked a reset link. Set a new password below.");
    };
    const linkDead = (msg: string) => { setMode("forgot"); setInfo(""); setErr(msg); };
    const EXPIRED = "That reset link has expired or was already used. Enter your email to get a new one.";

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") toReset();
    });

    (async () => {
      if (hash.get("error") || hash.get("error_description")) {
        clean(); linkDead(EXPIRED); return;
      }
      const access_token = hash.get("access_token");
      const refresh_token = hash.get("refresh_token");
      if (hash.get("type") === "recovery" && access_token && refresh_token) {
        const { error } = await supabase.auth.setSession({ access_token, refresh_token });
        clean();
        if (error) linkDead(EXPIRED); else toReset();
        return;
      }
      if (code) {
        // The client may already have redeemed it while loading.
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            clean();
            linkDead("Open the reset link in the same browser you asked for it from — or request a new link here.");
            return;
          }
        }
        clean(); toReset();
      }
    })();
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setInfo("");

    if (mode === "signin") {
      setBusy(true);
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setBusy(false);
        setErr(error.message === "Invalid login credentials"
          ? "That email and password don't match."
          : error.message);
        return;
      }
      // Hard navigation so the browser sends the fresh session cookie.
      window.location.assign(sp.get("next") || "/");
      return;
    }

    if (mode === "forgot") {
      if (!email) { setErr("Enter the email you sign in with."); return; }
      setBusy(true);
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/login`,
      });
      setBusy(false);
      if (error) setErr(error.message);
      else setInfo(`Reset link sent to ${email}. It opens back here.`);
      return;
    }

    if (password.length < 8) { setErr("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setErr("Those two passwords don't match."); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      if (/session missing/i.test(error.message)) {
        setMode("forgot");
        setErr("That reset link didn't sign you in (expired, already used, or opened in another browser). Enter your email to get a new one.");
      } else setErr(error.message);
      return;
    }
    window.location.assign("/");
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="mark">SC</div>
        <h1>{mode === "reset" ? "Set a new password" : "SEED CL Malaysia"}</h1>
        <p>
          {mode === "signin" && "Sign in with your work email — the same account you use for the sales dashboard and the hub."}
          {mode === "forgot" && "We'll email you a link to set a new password."}
          {mode === "reset" && "Pick something at least 8 characters long."}
        </p>

        {mode !== "reset" && (
          <input
            className="field" type="email" value={email} autoFocus
            autoComplete="username" placeholder="you@seedclmalaysia.com"
            onChange={e => setEmail(e.target.value)}
          />
        )}

        {mode === "signin" && (
          <input
            className="field" type="password" value={password}
            autoComplete="current-password" placeholder="Password"
            onChange={e => setPassword(e.target.value)}
          />
        )}

        {mode === "reset" && (
          <>
            <input
              className="field" type="password" value={password} autoFocus
              autoComplete="new-password" placeholder="New password"
              onChange={e => setPassword(e.target.value)}
            />
            <input
              className="field" type="password" value={confirm}
              autoComplete="new-password" placeholder="Repeat new password"
              onChange={e => setConfirm(e.target.value)}
            />
          </>
        )}

        {err && <p className="err">{err}</p>}
        {info && <p className="info">{info}</p>}

        <button className="submit" disabled={busy}>
          {busy ? "Working…"
            : mode === "signin" ? "Sign in"
            : mode === "forgot" ? "Send reset link"
            : "Save password"}
        </button>

        {mode === "signin" && (
          <button type="button" className="linkish"
            onClick={() => { setMode("forgot"); setErr(""); setInfo(""); }}>
            Forgot your password?
          </button>
        )}
        {mode === "forgot" && (
          <button type="button" className="linkish"
            onClick={() => { setMode("signin"); setErr(""); setInfo(""); }}>
            Back to sign in
          </button>
        )}
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="login-wrap" />}>
      <LoginForm />
    </Suspense>
  );
}
