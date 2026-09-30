"use client";
import { useState } from "react";
import { PORTS, PROVIDERS, type ProviderKey } from "@/lib/email/providers";
import { isEmail } from "@/lib/email/routes";
import type { ServerView } from "@/lib/email/server-store";

type Draft = {
  provider: ProviderKey;
  host: string;
  port: number;
  username: string;
  password: string;
  fromName: string;
  fromEmail: string;
};

const fromView = (s: ServerView | null): Draft => s
  ? { provider: s.provider, host: s.host, port: s.port, username: s.username, password: "", fromName: s.fromName, fromEmail: s.fromEmail }
  : { provider: "google", host: PROVIDERS.google.host, port: PROVIDERS.google.port, username: "", password: "", fromName: "SEED CONTACT LENS(M)", fromEmail: "" };

export function ServerForm({ initial, canEncrypt, envFallback }: {
  initial: ServerView | null;
  canEncrypt: boolean;
  envFallback: boolean;
}) {
  const [server, setServer] = useState<ServerView | null>(initial);
  const [draft, setDraft] = useState<Draft>(fromView(initial));
  const [editing, setEditing] = useState(!initial);
  const [replacePw, setReplacePw] = useState(!initial);
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState<"save" | "verify" | "remove" | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setDraft(d => ({ ...d, [k]: v }));
    setErrors(e => ({ ...e, [k]: "" }));
    setNotice(null);
  };

  function pickProvider(p: ProviderKey) {
    const preset = PROVIDERS[p];
    setDraft(d => ({
      ...d, provider: p,
      host: p === "custom" ? (d.provider === "custom" ? d.host : "") : preset.host,
      port: preset.port,
      // Google and Microsoft sign in with the mailbox address itself.
      username: p !== "custom" && !d.username && d.fromEmail ? d.fromEmail : d.username,
    }));
    setNotice(null);
  }

  // Light checks for instant feedback; the API validates for real.
  const local: Record<string, string> = {};
  if (!draft.host.trim()) local.host = "Enter the server address.";
  if (!draft.username.trim()) local.username = "Enter the username.";
  if (replacePw && !draft.password) local.password = server ? "Enter the new password, or keep the saved one." : "Enter the password.";
  if (!isEmail(draft.fromEmail)) local.fromEmail = "Enter a valid sender address.";
  const errFor = (k: string) => errors[k] || (editing && touched(k) ? local[k] : "");
  const [touchedSet, setTouched] = useState<Set<string>>(new Set());
  function touched(k: string) { return touchedSet.has(k); }
  const touch = (k: string) => setTouched(s => new Set(s).add(k));

  async function save() {
    setTouched(new Set(["host", "username", "password", "fromEmail"]));
    if (Object.keys(local).length) return;
    setBusy("save"); setNotice(null);
    const res = await fetch("/api/email-settings/server", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...draft, password: replacePw ? draft.password : "" }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setErrors(json.fields ?? {});
      setNotice({ tone: "err", text: json.error ?? "Couldn't save." });
      return;
    }
    setServer(json.server);
    setDraft(fromView(json.server));
    setEditing(false); setReplacePw(false); setShowPw(false); setTouched(new Set());
    setNotice({ tone: "ok", text: "Saved. Check the connection to confirm it works." });
  }

  async function verify() {
    setBusy("verify"); setNotice(null);
    const res = await fetch("/api/email-settings/server/verify", { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (json.server) setServer(json.server);
    setNotice(res.ok
      ? { tone: "ok", text: "Connected and signed in. Nothing was sent." }
      : { tone: "err", text: json.error ?? "Connection check failed." });
  }

  async function remove() {
    setBusy("remove");
    const res = await fetch("/api/email-settings/server", { method: "DELETE" });
    setBusy(null); setConfirmRemove(false);
    if (!res.ok) { setNotice({ tone: "err", text: "Couldn't remove the server." }); return; }
    setServer(null); setDraft(fromView(null)); setEditing(true); setReplacePw(true);
    setNotice({ tone: "ok", text: "Server removed. Sending is off until a new one is saved." });
  }

  const inputCls = (bad: boolean) =>
    `w-full rounded-lg border bg-page px-3 py-2 text-ink outline-none transition-colors
     focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25
     disabled:cursor-default disabled:border-line disabled:bg-quiet disabled:text-ink-2
     ${bad ? "border-danger" : "border-line-strong"}`;

  const state: { tone: "ok" | "warn" | "err" | "muted"; title: string; detail: string } =
    !server ? { tone: "muted", title: "Not set up", detail: envFallback ? "Using the SMTP_* environment variables until a server is saved here." : "Nothing can be sent until a server is saved." }
    : server.lastVerifyOk === true ? { tone: "ok", title: "Connected", detail: `Signed in successfully ${fmt(server.lastVerifiedAt)}.` }
    : server.lastVerifyOk === false ? { tone: "err", title: "Connection failed", detail: server.lastVerifyError ?? "The server refused the connection." }
    : { tone: "warn", title: "Saved, not checked", detail: "Run a connection check to confirm the details work." };
  const toneText = { ok: "text-ok", warn: "text-warn", err: "text-danger", muted: "text-muted" }[state.tone];
  const toneDot = { ok: "bg-ok", warn: "bg-warn", err: "bg-danger", muted: "bg-muted" }[state.tone];

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      {/* ---------- form ---------- */}
      <section className="rise overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-card" aria-labelledby="server-title">
        <div className="airmail" aria-hidden />
        <header className="flex flex-wrap items-start gap-4 border-b border-line px-6 py-5">
          <div className="min-w-0 flex-1">
            <span className="label">SMTP</span>
            <h2 id="server-title" className="mt-1 font-display text-2xl font-semibold tracking-tight text-ink">Server details</h2>
          </div>
          <div className="flex flex-none items-center gap-2">
            {!editing ? (
              <button type="button" onClick={() => { setEditing(true); setNotice(null); }}
                className="rounded-lg border border-line-strong px-3.5 py-2 text-sm font-semibold text-ink-2 transition-colors hover:border-brand hover:text-ink">
                Edit
              </button>
            ) : (
              <>
                {server && (
                  <button type="button"
                    onClick={() => { setDraft(fromView(server)); setEditing(false); setReplacePw(false); setErrors({}); setTouched(new Set()); setNotice(null); }}
                    className="rounded-lg px-3 py-2 text-sm font-semibold text-ink-2 hover:text-ink">
                    Cancel
                  </button>
                )}
                <button type="button" onClick={save} disabled={busy !== null || !canEncrypt}
                  className="rounded-lg bg-tile px-4 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-45">
                  {busy === "save" ? "Saving…" : "Save"}
                </button>
              </>
            )}
          </div>
        </header>

        <fieldset disabled={!editing} className="flex flex-col gap-6 px-6 py-6">
          <legend className="sr-only">Sending server details</legend>

          <div>
            <span className="text-sm font-semibold text-ink">Email provider</span>
            <div role="radiogroup" aria-label="Email provider" className="mt-2 grid gap-2 sm:grid-cols-3">
              {(Object.keys(PROVIDERS) as ProviderKey[]).map(p => {
                const on = draft.provider === p;
                return (
                  <button key={p} type="button" role="radio" aria-checked={on} onClick={() => pickProvider(p)}
                    className={`rounded-lg border px-3 py-2.5 text-left text-sm transition-colors
                      ${on ? "border-brand bg-quiet font-semibold text-ink ring-2 ring-brand/20" : "border-line-strong text-ink-2 hover:border-brand"}
                      disabled:cursor-default disabled:hover:border-line-strong`}>
                    {PROVIDERS[p].label}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-muted">{PROVIDERS[draft.provider].note}</p>
          </div>

          <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_11rem]">
            <Field label="Server address" error={errFor("host")}>
              <input value={draft.host} onChange={e => set("host", e.target.value.trim())} onBlur={() => touch("host")}
                placeholder="smtp.example.com" autoComplete="off" spellCheck={false}
                className={`${inputCls(!!errFor("host"))} font-mono text-[0.875rem]`} />
            </Field>
            <Field label="Port" error={errFor("port")}>
              <select value={draft.port} onChange={e => set("port", Number(e.target.value))}
                className={inputCls(!!errFor("port"))}>
                {PORTS.map(p => <option key={p.port} value={p.port}>{p.label}</option>)}
              </select>
            </Field>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Username" hint="Usually the full mailbox address." error={errFor("username")}>
              <input value={draft.username} onChange={e => set("username", e.target.value.trim())} onBlur={() => touch("username")}
                autoComplete="off" spellCheck={false} placeholder="orders@your-domain.com"
                className={inputCls(!!errFor("username"))} />
            </Field>

            <Field label="Password" error={errFor("password")}
              hint={draft.provider === "google" ? "A 16-character App Password." : "Stored encrypted. Never shown again."}>
              {server && !replacePw ? (
                <div className="flex items-center gap-3 rounded-lg border border-line bg-quiet px-3 py-2 text-sm">
                  <span className="font-mono tracking-[0.2em] text-ink-2" aria-hidden>••••••••</span>
                  <span className="text-muted">Saved</span>
                  {editing && (
                    <button type="button" onClick={() => { setReplacePw(true); setDraft(d => ({ ...d, password: "" })); }}
                      className="ml-auto text-sm font-semibold text-ink-2 underline underline-offset-2 hover:text-ink">
                      Replace
                    </button>
                  )}
                </div>
              ) : (
                <div className="relative">
                  <input type={showPw ? "text" : "password"} value={draft.password}
                    onChange={e => set("password", e.target.value)} onBlur={() => touch("password")}
                    autoComplete="new-password" spellCheck={false}
                    className={`${inputCls(!!errFor("password"))} pr-16`} />
                  <button type="button" onClick={() => setShowPw(v => !v)}
                    className="absolute inset-y-0 right-2 my-auto h-7 rounded px-2 text-xs font-semibold text-ink-2 hover:text-ink">
                    {showPw ? "Hide" : "Show"}
                  </button>
                  {server && editing && (
                    <button type="button" onClick={() => { setReplacePw(false); setDraft(d => ({ ...d, password: "" })); setErrors(e => ({ ...e, password: "" })); }}
                      className="mt-1.5 text-xs text-ink-2 underline underline-offset-2 hover:text-ink">
                      Keep the saved password
                    </button>
                  )}
                </div>
              )}
            </Field>
          </div>

          <div className="grid gap-5 border-t border-dashed border-line-strong pt-6 sm:grid-cols-2">
            <Field label="Sender name" hint="What recipients see in their inbox.">
              <input value={draft.fromName} onChange={e => set("fromName", e.target.value)}
                className={inputCls(false)} />
            </Field>
            <Field label="Sender address" hint="Must be allowed to send from this mailbox." error={errFor("fromEmail")}>
              <input type="email" value={draft.fromEmail} onBlur={() => touch("fromEmail")}
                onChange={e => {
                  const v = e.target.value.trim();
                  set("fromEmail", v);
                  // Keep the username in step while it still mirrors the address.
                  if (draft.provider !== "custom" && (!draft.username || draft.username === draft.fromEmail)) {
                    setDraft(d => ({ ...d, fromEmail: v, username: v }));
                  }
                }}
                placeholder="orders@your-domain.com" className={inputCls(!!errFor("fromEmail"))} />
            </Field>
          </div>

          <p className="rounded-lg bg-quiet px-3 py-2 text-sm text-ink-2">
            Recipients will see{" "}
            <span className="font-semibold text-ink">
              {draft.fromName ? `${draft.fromName} <${draft.fromEmail || "…"}>` : draft.fromEmail || "…"}
            </span>
          </p>
        </fieldset>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-6 py-3 text-xs text-muted">
          <span>
            {server?.updatedAt
              ? <>Last saved {fmt(server.updatedAt)}{server.updatedBy ? ` by ${server.updatedBy}` : ""}</>
              : "Not saved yet"}
          </span>
          {notice && (
            <span role="status" className={`font-semibold ${notice.tone === "ok" ? "text-ok" : "text-danger"}`}>{notice.text}</span>
          )}
        </footer>
      </section>

      {/* ---------- status ---------- */}
      <aside className="flex flex-col gap-4">
        <section className="rounded-2xl border border-line-strong bg-surface p-5 shadow-card" aria-live="polite">
          <span className="label">Status</span>
          <p className={`mt-2 flex items-center gap-2 font-display text-xl font-semibold ${toneText}`}>
            <span className={`size-2.5 rounded-full ${toneDot}`} aria-hidden />{state.title}
          </p>
          <p className="mt-1 text-sm text-ink-2">{state.detail}</p>
          {server && (
            <dl className="mt-4 grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 gap-y-1 border-t border-dashed border-line-strong pt-3 text-sm">
              <dt className="text-muted">Server</dt><dd className="truncate font-mono text-[0.8125rem] text-ink">{server.host}:{server.port}</dd>
              <dt className="text-muted">Sends as</dt><dd className="truncate text-ink">{server.fromEmail}</dd>
            </dl>
          )}
          <button type="button" onClick={verify} disabled={!server || editing || busy !== null}
            title={editing ? "Save your changes first" : undefined}
            className="mt-4 w-full rounded-lg bg-tile px-4 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-45">
            {busy === "verify" ? "Checking…" : "Check connection"}
          </button>
          <p className="mt-2 text-xs text-muted">Signs in to the saved server. No email is sent.</p>
        </section>

        <section className="rounded-2xl border border-line bg-quiet p-5 text-sm text-ink-2">
          <span className="label">How the password is kept</span>
          <p className="mt-2">
            Encrypted before it's stored, with a key that lives only on the server. It's never sent back
            to any browser — not even yours.
          </p>
          {!canEncrypt && (
            <p className="mt-2 font-semibold text-danger">
              The encryption key isn't configured on this deployment, so saving is disabled.
            </p>
          )}
        </section>

        {server && (
          <div className="px-1 text-sm">
            {!confirmRemove ? (
              <button type="button" onClick={() => setConfirmRemove(true)}
                className="text-ink-2 underline underline-offset-2 hover:text-danger">
                Remove this server
              </button>
            ) : (
              <span className="flex flex-wrap items-center gap-3">
                <span className="text-ink">Stop all sending?</span>
                <button type="button" onClick={remove} disabled={busy !== null}
                  className="rounded-md bg-danger px-3 py-1 font-semibold text-white disabled:opacity-50">
                  {busy === "remove" ? "Removing…" : "Remove"}
                </button>
                <button type="button" onClick={() => setConfirmRemove(false)} className="text-ink-2 hover:text-ink">Cancel</button>
              </span>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

function Field({ label, hint, error, children }: {
  label: string; hint?: string; error?: string; children: React.ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-sm font-semibold text-ink">{label}</span>
      {children}
      {error
        ? <span className="text-xs font-semibold text-danger">{error}</span>
        : hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

function fmt(iso: string | null) {
  return iso ? new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "";
}
