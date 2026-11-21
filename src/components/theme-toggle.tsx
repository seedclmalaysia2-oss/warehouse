"use client";
import { useEffect, useState } from "react";
import { THEME_KEY } from "@/lib/theme";

type Choice = "light" | "dark" | "system";

const OPTIONS: { value: Choice; label: string; title: string }[] = [
  { value: "light", label: "Light", title: "Always light" },
  { value: "dark", label: "Dark", title: "Always dark" },
  { value: "system", label: "Auto", title: "Match this device" },
];

const stored = (): Choice => {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
};

function apply(c: Choice) {
  const root = document.documentElement;
  if (c === "system") delete root.dataset.theme;
  else root.dataset.theme = c;
}

const NEXT: Record<Choice, Choice> = { light: "dark", dark: "system", system: "light" };

const ICONS: Record<Choice, React.ReactNode> = {
  light: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  dark: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />,
  system: <><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5v17A8.5 8.5 0 0 0 12 3.5Z" fill="currentColor" /></>,
};

// Light / Dark / Auto. Auto removes the override so the device setting decides.
// `icon`: one small round button for the top bar showing the current choice; each press moves
// Light -> Dark -> Auto, so all three choices stay available.
export function ThemeToggle({ icon = false }: { icon?: boolean }) {
  // Unknown until mounted, so the server HTML and first client render agree.
  const [choice, setChoice] = useState<Choice | null>(null);

  useEffect(() => {
    setChoice(stored());
    // Keep other open tabs of this dashboard in step.
    const onStorage = (e: StorageEvent) => {
      if (e.key !== THEME_KEY) return;
      const c = stored();
      setChoice(c);
      apply(c);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  function pick(c: Choice) {
    setChoice(c);
    apply(c);
    try {
      if (c === "system") localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, c);
    } catch {
      // Storage blocked (private window): the choice still applies until reload.
    }
  }

  if (icon) {
    const now = choice ?? "system";
    const label = OPTIONS.find(o => o.value === now)!;
    const next = OPTIONS.find(o => o.value === NEXT[now])!;
    return (
      <button type="button" className="icon-btn" onClick={() => pick(NEXT[now])}
              aria-label={`Colour theme: ${label.label}. Switch to ${next.label}`} title={`${label.title} (press for ${next.label})`}>
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {ICONS[now]}
        </svg>
      </button>
    );
  }

  return (
    <div className="theme-toggle" role="group" aria-label="Colour theme">
      {OPTIONS.map(o => (
        <button
          key={o.value} type="button" title={o.title}
          aria-pressed={choice === o.value}
          onClick={() => pick(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
