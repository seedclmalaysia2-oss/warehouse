"use client";
import { useMemo, useRef, useState } from "react";
import {
  DEFAULTS, HQ_ORDER_ADDRESS, PLACEHOLDERS, render, sampleValues, validate,
  type Issue, type RouteKey, type RouteSettings,
} from "@/lib/email/routes";
import type { StoredRoute } from "@/lib/email/store";
import { EmailChips } from "./email-chips";

const COPY: Record<RouteKey, {
  kicker: string; title: string; blurb: string;
  mailboxLabel: string; mailboxHint: string;
  toLabel: string; toHint: string;
  subjectLabel: string; bodyLabel: string;
}> = {
  outward: {
    kicker: "Outward PO",
    title: "To SEED HQ, Tokyo",
    blurb: "The final BOC order sheet goes to the SCM Purchasing Group (管理購買G). HQ asks for \"BOC\" in the subject and the file kept as Excel.",
    mailboxLabel: "Reply-to",
    mailboxHint: "Where HQ's replies should land. Leave blank to use the sending address.",
    toLabel: "To",
    toHint: "HQ's order address is kanri_koubai@seed.co.jp.",
    subjectLabel: "Subject",
    bodyLabel: "Message",
  },
  inward: {
    kicker: "Inward PO",
    title: "From customers, into Malaysia",
    blurb: "Where outlets send their purchase orders, who on the team is told, and the acknowledgement that goes back.",
    mailboxLabel: "PO inbox",
    mailboxHint: "The address customers send purchase orders to.",
    toLabel: "Notify",
    toHint: "Team members told when a PO arrives.",
    subjectLabel: "Acknowledgement subject",
    bodyLabel: "Acknowledgement message",
  },
};

type TemplateField = "subjectTemplate" | "bodyTemplate" | "attachmentName";

export function RouteEditor({ route, initial, sender, canSend }: {
  route: RouteKey;
  initial: StoredRoute;
  sender: string;
  canSend: boolean;
}) {
  const copy = COPY[route];
  const pick = (s: RouteSettings): RouteSettings => ({
    enabled: s.enabled, mailbox: s.mailbox, toList: s.toList, ccList: s.ccList, bccList: s.bccList,
    subjectTemplate: s.subjectTemplate, bodyTemplate: s.bodyTemplate,
    attachmentName: s.attachmentName, autoAck: s.autoAck,
  });

  const [saved, setSaved] = useState<RouteSettings>(pick(initial));
  const [draft, setDraft] = useState<RouteSettings>(pick(initial));
  const [meta, setMeta] = useState({ saved: initial.saved, updatedAt: initial.updatedAt, updatedBy: initial.updatedBy });
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [serverIssues, setServerIssues] = useState<Issue[]>([]);

  const refs = {
    subjectTemplate: useRef<HTMLInputElement>(null),
    bodyTemplate: useRef<HTMLTextAreaElement>(null),
    attachmentName: useRef<HTMLInputElement>(null),
  };
  const lastField = useRef<TemplateField>("bodyTemplate");

  const issues = useMemo(() => validate(route, draft), [route, draft]);
  const shownIssues = editing ? issues : serverIssues;
  const issueFor = (f: keyof RouteSettings) => shownIssues.filter(i => i.field === f).map(i => i.message);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const values = sampleValues(route, sender || "Your name");

  const set = <K extends keyof RouteSettings>(k: K, v: RouteSettings[K]) => {
    setDraft(d => ({ ...d, [k]: v }));
    setNotice(null);
  };

  function insertToken(key: string) {
    const field = lastField.current;
    const el = refs[field].current;
    const token = `{${key}}`;
    const current = draft[field];
    const start = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? current.length;
    set(field, current.slice(0, start) + token + current.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  async function save() {
    setBusy("save"); setNotice(null);
    const res = await fetch(`/api/email-settings/${route}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(draft),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setServerIssues(json.issues ?? []);
      setNotice({ tone: "err", text: json.error ?? "Couldn't save." });
      return;
    }
    setSaved(draft);
    setMeta({ saved: true, updatedAt: json.updatedAt, updatedBy: json.updatedBy });
    setServerIssues([]);
    setEditing(false);
    setNotice({ tone: "ok", text: "Saved." });
  }

  async function sendTest() {
    setBusy("test"); setNotice(null);
    const res = await fetch("/api/email-settings/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ route, settings: draft }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    setNotice(res.ok
      ? { tone: "ok", text: `Test sent to ${json.sentTo}. Only you received it.` }
      : { tone: "err", text: json.error ?? "Couldn't send the test." });
  }

  const hqChecks = route === "outward" ? [
    { ok: draft.toList.some(e => e.toLowerCase() === HQ_ORDER_ADDRESS), label: "Addressed to 管理購買G" },
    { ok: draft.subjectTemplate.includes("BOC"), label: "\"BOC\" in the subject" },
    { ok: /\.xlsx?$/i.test(draft.attachmentName.trim()), label: "Order sheet sent as Excel" },
  ] : null;

  const inputCls = (bad: boolean) =>
    `w-full rounded-lg border bg-page px-3 py-2 text-ink outline-none transition-colors
     focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25
     disabled:cursor-default disabled:border-line disabled:bg-quiet disabled:text-ink-2
     ${bad ? "border-danger" : "border-line-strong"}`;

  return (
    <section
      aria-labelledby={`${route}-title`}
      className="rise overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-card"
    >
      {route === "outward" ? <div className="airmail" aria-hidden /> : <div className="h-1.5 bg-tile" aria-hidden />}

      <header className="flex flex-wrap items-start gap-4 border-b border-line px-6 pb-5 pt-5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <span className="label">{copy.kicker}</span>
            <span className={`pill ${saved.enabled ? "live" : "queued"}`}>
              <span className="dot" />{saved.enabled ? "On" : "Off"}
            </span>
          </div>
          <h2 id={`${route}-title`} className="mt-1 font-display text-2xl font-semibold tracking-tight text-ink">
            {copy.title}
          </h2>
          <p className="mt-1 max-w-[62ch] text-sm text-ink-2">{copy.blurb}</p>
        </div>
        <div className="flex flex-none items-center gap-2">
          {!editing ? (
            <button type="button" onClick={() => { setEditing(true); setNotice(null); }}
              className="rounded-lg border border-line-strong px-3.5 py-2 text-sm font-semibold text-ink-2 transition-colors hover:border-brand hover:text-ink">
              Edit
            </button>
          ) : (
            <>
              <button type="button" onClick={() => { setDraft(saved); setEditing(false); setNotice(null); setServerIssues([]); }}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-ink-2 hover:text-ink">
                Cancel
              </button>
              <button type="button" onClick={save} disabled={!dirty || issues.length > 0 || busy !== null}
                className="rounded-lg bg-tile px-4 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-45">
                {busy === "save" ? "Saving…" : "Save"}
              </button>
            </>
          )}
        </div>
      </header>

      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
        {/* ---------- settings ---------- */}
        <fieldset disabled={!editing} className="flex min-w-0 flex-col gap-5 px-6 py-6">
          <legend className="sr-only">{copy.kicker} settings</legend>

          <label className="flex items-center justify-between gap-4 rounded-lg bg-quiet px-3 py-2.5">
            <span className="text-sm">
              <span className="font-semibold text-ink">{route === "outward" ? "Send orders to HQ from this dashboard" : "Receive customer POs"}</span>
              <span className="block text-muted">Turn off to pause this route without losing its settings.</span>
            </span>
            <Toggle checked={draft.enabled} onChange={v => set("enabled", v)} />
          </label>

          <Field label={copy.mailboxLabel} hint={copy.mailboxHint} errors={issueFor("mailbox")}>
            <input type="email" value={draft.mailbox} onChange={e => set("mailbox", e.target.value.trim())}
              placeholder={route === "inward" ? "po@your-domain.com" : "Same as sender"}
              className={inputCls(issueFor("mailbox").length > 0)} />
          </Field>

          <Field label={copy.toLabel} hint={copy.toHint} errors={issueFor("toList")}>
            <EmailChips value={draft.toList} onChange={v => set("toList", v)} disabled={!editing}
              invalid={issueFor("toList").length > 0} placeholder="name@company.com" />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Cc" errors={issueFor("ccList")}>
              <EmailChips value={draft.ccList} onChange={v => set("ccList", v)} disabled={!editing}
                invalid={issueFor("ccList").length > 0} />
            </Field>
            <Field label="Bcc" errors={issueFor("bccList")}>
              <EmailChips value={draft.bccList} onChange={v => set("bccList", v)} disabled={!editing}
                invalid={issueFor("bccList").length > 0} />
            </Field>
          </div>

          {route === "inward" && (
            <label className="flex items-center justify-between gap-4 rounded-lg bg-quiet px-3 py-2.5">
              <span className="text-sm">
                <span className="font-semibold text-ink">Auto-acknowledge</span>
                <span className="block text-muted">Reply to the customer as soon as their PO is logged.</span>
              </span>
              <Toggle checked={draft.autoAck} onChange={v => set("autoAck", v)} />
            </label>
          )}

          <Field label={copy.subjectLabel} errors={issueFor("subjectTemplate")}>
            <input ref={refs.subjectTemplate} value={draft.subjectTemplate}
              onFocus={() => (lastField.current = "subjectTemplate")}
              onChange={e => set("subjectTemplate", e.target.value)}
              className={inputCls(issueFor("subjectTemplate").length > 0)} />
          </Field>

          <Field label={copy.bodyLabel} errors={issueFor("bodyTemplate")}>
            <textarea ref={refs.bodyTemplate} value={draft.bodyTemplate} rows={route === "outward" ? 14 : 9}
              onFocus={() => (lastField.current = "bodyTemplate")}
              onChange={e => set("bodyTemplate", e.target.value)}
              className={`${inputCls(issueFor("bodyTemplate").length > 0)} resize-y font-body leading-relaxed`} />
          </Field>

          {route === "outward" && (
            <Field label="Attachment file name" hint="The order sheet, renamed when it's attached." errors={issueFor("attachmentName")}>
              <input ref={refs.attachmentName} value={draft.attachmentName}
                onFocus={() => (lastField.current = "attachmentName")}
                onChange={e => set("attachmentName", e.target.value)}
                className={`${inputCls(issueFor("attachmentName").length > 0)} font-mono text-[0.8125rem]`} />
            </Field>
          )}

          {editing && (
            <div>
              <span className="label">Insert</span>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {PLACEHOLDERS[route].map(p => (
                  <button key={p.key} type="button" onClick={() => insertToken(p.key)}
                    title={`Insert {${p.key}}`}
                    className="rounded-md border border-line-strong bg-quiet px-2 py-1 text-xs font-semibold text-ink-2 transition-colors hover:border-brand hover:text-ink">
                    {p.label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted">Goes into whichever field you last clicked.</p>
            </div>
          )}
        </fieldset>

        {/* ---------- live preview ---------- */}
        <div className="flex min-w-0 flex-col gap-4 border-t border-line bg-quiet px-6 py-6 lg:border-l lg:border-t-0">
          <div className="flex items-center justify-between">
            <span className="label">Preview</span>
            <span className="text-xs text-muted">Sample order values</span>
          </div>

          <article className="overflow-hidden rounded-xl border border-line-strong bg-paper shadow-card">
            <dl className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 border-b border-dashed border-line-strong px-5 py-4 text-sm">
              {route === "inward" ? (
                <>
                  <dt className="text-muted">From</dt><dd className="truncate text-ink">{draft.mailbox || "PO inbox not set"}</dd>
                  <dt className="text-muted">To</dt><dd className="truncate text-ink">Customer who sent the PO</dd>
                </>
              ) : (
                <>
                  <dt className="text-muted">Reply-to</dt><dd className="truncate text-ink">{draft.mailbox || "Sending address"}</dd>
                  <dt className="text-muted">To</dt><dd className="break-words text-ink">{draft.toList.join(", ") || "—"}</dd>
                </>
              )}
              {draft.ccList.length > 0 && (<><dt className="text-muted">Cc</dt><dd className="break-words text-ink">{draft.ccList.join(", ")}</dd></>)}
              {draft.bccList.length > 0 && (<><dt className="text-muted">Bcc</dt><dd className="break-words text-ink">{draft.bccList.join(", ")}</dd></>)}
              <dt className="text-muted">Subject</dt>
              <dd className="font-semibold text-ink">{render(draft.subjectTemplate, values) || "—"}</dd>
            </dl>
            <div className="letter-rule whitespace-pre-wrap px-5 py-4 text-[0.9375rem] leading-7 text-ink">
              {render(draft.bodyTemplate, values)}
            </div>
            {route === "outward" && draft.attachmentName && (
              <div className="flex items-center gap-3 border-t border-line px-5 py-3">
                <span className="grid size-9 flex-none place-items-center rounded-md bg-[#1d6f42] font-mono text-[0.625rem] font-bold text-white">XLS</span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-ink">{render(draft.attachmentName, values)}</span>
                  <span className="block text-xs text-muted">BOC order sheet — attached when the order is sent</span>
                </span>
              </div>
            )}
          </article>

          {hqChecks && (
            <ul className="flex flex-col gap-1.5 text-sm" aria-label="HQ requirements">
              {hqChecks.map(c => (
                <li key={c.label} className={`flex items-center gap-2 ${c.ok ? "text-ok" : "text-danger"}`}>
                  <span aria-hidden className="grid size-4 place-items-center rounded-full border border-current text-[0.625rem] leading-none">
                    {c.ok ? "✓" : "!"}
                  </span>
                  <span className={c.ok ? "text-ink-2" : "font-semibold"}>{c.label}</span>
                </li>
              ))}
            </ul>
          )}

          {route === "inward" && (
            <p className="text-sm text-muted">
              {draft.autoAck
                ? "This acknowledgement goes to the customer automatically once inbound PO logging is switched on."
                : "Auto-acknowledge is off — the team replies by hand."}
            </p>
          )}

          <div className="mt-auto flex flex-wrap items-center gap-3 pt-2">
            <button type="button" onClick={sendTest} disabled={!canSend || issues.length > 0 || busy !== null}
              title={canSend ? "Send this preview to your own inbox" : "Sending server not set up yet"}
              className="rounded-lg border border-line-strong bg-surface px-3.5 py-2 text-sm font-semibold text-ink-2 transition-colors hover:border-brand hover:text-ink disabled:opacity-45 disabled:hover:border-line-strong">
              {busy === "test" ? "Sending…" : "Send test to me"}
            </button>
            {editing && (
              <button type="button" onClick={() => setDraft({ ...DEFAULTS[route], enabled: draft.enabled })}
                className="text-sm text-ink-2 underline underline-offset-2 hover:text-ink">
                Restore defaults
              </button>
            )}
          </div>
        </div>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-6 py-3 text-xs text-muted">
        <span>
          {meta.saved && meta.updatedAt
            ? <>Last saved {new Date(meta.updatedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}{meta.updatedBy ? ` by ${meta.updatedBy}` : ""}</>
            : "Not saved yet — showing defaults"}
          {editing && dirty && <span className="ml-2 font-semibold text-warn">· Unsaved changes</span>}
        </span>
        {notice && (
          <span role="status" className={`font-semibold ${notice.tone === "ok" ? "text-ok" : "text-danger"}`}>{notice.text}</span>
        )}
      </footer>
    </section>
  );
}

function Field({ label, hint, errors, children }: {
  label: string; hint?: string; errors: string[]; children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-sm font-semibold text-ink">{label}</span>
      {children}
      {errors.length > 0
        ? errors.map(e => <span key={e} className="text-xs font-semibold text-danger">{e}</span>)
        : hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 flex-none rounded-full transition-colors disabled:opacity-60
        ${checked ? "bg-tile" : "bg-line-strong"}`}>
      <span className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow transition-transform
        ${checked ? "translate-x-5" : ""}`} />
    </button>
  );
}

