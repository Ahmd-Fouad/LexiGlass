// Theme selection for the glassmorphism UI: dark (default) or light.
//
// Resolution order: saved preference → system preference → dark.
// The pure helpers here are unit-tested; the browser wrappers guard every
// window/localStorage access so they are safe to import from server modules.

export type Theme = "dark" | "light";

export const THEME_STORAGE_KEY = "lexiglass_theme";

export function isTheme(value: unknown): value is Theme {
  return value === "dark" || value === "light";
}

/**
 * Picks the theme to apply. `saved` is whatever came out of storage
 * (invalid values are ignored); `systemTheme` is the OS preference or null
 * when it can't be detected.
 */
export function resolveTheme(saved: unknown, systemTheme: Theme | null): Theme {
  if (isTheme(saved)) return saved;
  if (systemTheme) return systemTheme;
  return "dark";
}

/** OS-level preference via matchMedia, or null when unavailable (SSR, old browsers). */
export function resolveSystemTheme(): Theme | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null;
  try {
    if (window.matchMedia("(prefers-color-scheme: light)").matches) return "light";
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
  } catch {
    /* matchMedia can throw in exotic embedders — fall through to null */
  }
  return null;
}

export function loadThemePreference(): Theme | null {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(value) ? value : null;
  } catch {
    return null;
  }
}

export function saveThemePreference(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* private mode / storage full — the toggle still works for this page */
  }
}

/** The theme the app should start with in this browser. */
export function getInitialTheme(): Theme {
  return resolveTheme(loadThemePreference(), resolveSystemTheme());
}

/** Applies the theme to <html data-theme="…"> (what globals.css keys off). */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

/**
 * Inline bootstrap run in <head> before paint so the first frame already has
 * the right theme (no dark→light flash). Must stay dependency-free and match
 * the resolution rules above.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t!=="light"&&t!=="dark"){t=window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";}document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme="dark";}})();`;
