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

  // Supabase sends people back here with type=recovery in the fragment and a
  // short-lived session already established — enough for one updateUser call.
  useEffect(() => {
    if ((window.location.hash || "").includes("type=recovery")) {
      setMode("reset");
      history.replaceState(null, "", window.location.pathname);
      setInfo("You clicked a reset link. Set a new password below.");
    }
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
    if (error) { setErr(error.message); return; }
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
