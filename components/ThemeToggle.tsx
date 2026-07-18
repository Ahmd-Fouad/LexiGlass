"use client";

import { useEffect, useState } from "react";
import { applyTheme, getInitialTheme, saveThemePreference, type Theme } from "@/lib/theme";

/**
 * Dark/light switch. Preference resolution happens after mount without unsafe
 * inline script; SSR renders the neutral disabled state first.
 */
export default function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const initial = getInitialTheme();
    applyTheme(initial);
    setTheme(initial);
  }, []);

  function toggle() {
    const next: Theme = theme === "light" ? "dark" : "light";
    setTheme(next);
    applyTheme(next);
    saveThemePreference(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={theme === null}
      aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
      title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
      className={`inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-ink-muted transition-colors hover:bg-white/10 hover:text-ink ${className}`}
    >
      <span aria-hidden>{theme === "light" ? "☀" : "☾"}</span>
      <span>{theme === "light" ? "Light" : "Dark"}</span>
    </button>
  );
}
