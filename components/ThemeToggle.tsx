"use client";

import { useEffect, useState } from "react";
import { applyTheme, saveThemePreference, type Theme } from "@/lib/theme";

/**
 * Dark/light switch. The initial theme is stamped on <html data-theme> by the
 * inline bootstrap script in the root layout before paint; this component only
 * reads it after mount, so SSR always renders the same neutral placeholder.
 */
export default function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
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
