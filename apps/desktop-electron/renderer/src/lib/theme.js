const THEME_STORAGE_KEY = "ojreview-theme";
const DEFAULT_THEME_MODE = "follow-system";

export function getStoredThemeMode() {
  return localStorage.getItem(THEME_STORAGE_KEY) ?? DEFAULT_THEME_MODE;
}

export function resolveEffectiveTheme(mode) {
  if (mode === "dark") return "dark";
  if (mode === "light") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyThemeToDOM(mode) {
  const effective = resolveEffectiveTheme(mode);
  if (effective === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
    return;
  }
  document.documentElement.removeAttribute("data-theme");
}

export function persistThemeMode(mode) {
  localStorage.setItem(THEME_STORAGE_KEY, mode);
}

applyThemeToDOM(getStoredThemeMode());
