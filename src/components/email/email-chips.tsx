"use client";
import { useState } from "react";
import { isEmail } from "@/lib/email/routes";

/** Address list as chips. Enter, comma, space or leaving the field commits. */
export function EmailChips({ value, onChange, disabled, invalid, placeholder }: {
  value: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
  invalid?: boolean;
  placeholder?: string;
}) {
  const [text, setText] = useState("");

  function commit(raw: string) {
    const parts = raw.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean);
    if (!parts.length) return;
    const next = [...value];
    for (const p of parts) if (!next.some(v => v.toLowerCase() === p.toLowerCase())) next.push(p);
    onChange(next);
    setText("");
  }

  return (
    <div
      className={`flex min-h-[42px] flex-wrap items-center gap-1.5 rounded-lg border px-2 py-1.5 transition-colors
        focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/25
        ${disabled ? "border-line bg-quiet" : "bg-page"} ${invalid ? "border-danger" : disabled ? "" : "border-line-strong"}`}
    >
      {value.map(email => {
        const ok = isEmail(email);
        return (
          <span key={email}
            className={`inline-flex max-w-full items-center gap-1 rounded-md px-2 py-0.5 text-[0.8125rem]
              ${ok ? "bg-surface text-ink ring-1 ring-line-strong" : "bg-danger/10 text-danger ring-1 ring-danger/40"}`}>
            <span className="truncate">{email}</span>
            {!disabled && (
              <button type="button" aria-label={`Remove ${email}`}
                onClick={() => onChange(value.filter(v => v !== email))}
                className="-mr-1 grid size-4 place-items-center rounded text-muted hover:bg-quiet hover:text-ink">
                ×
              </button>
            )}
          </span>
        );
      })}
      {!disabled && (
        <input
          type="email" inputMode="email" value={text}
          placeholder={value.length ? "" : placeholder ?? "Add address"}
          onChange={e => {
            const v = e.target.value;
            if (/[,;\s]$/.test(v)) commit(v); else setText(v);
          }}
          onKeyDown={e => {
            if (e.key === "Enter") { e.preventDefault(); commit(text); }
            if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
          }}
          onBlur={() => commit(text)}
          onPaste={e => { e.preventDefault(); commit(e.clipboardData.getData("text")); }}
          className="min-w-[10rem] flex-1 bg-transparent px-1 py-1 text-ink outline-none placeholder:text-muted"
        />
      )}
      {disabled && value.length === 0 && <span className="px-1 text-sm text-muted">None</span>}
    </div>
  );
}
