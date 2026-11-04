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

// Light / Dark / Auto. Auto removes the override so the device setting decides.
export function ThemeToggle() {
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
