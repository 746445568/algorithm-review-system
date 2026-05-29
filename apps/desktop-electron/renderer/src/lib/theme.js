const THEME_STORAGE_KEY = "ojreview-theme";
const DEFAULT_THEME_MODE = "dark";

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
  document.documentElement.setAttribute("data-theme", effective);
}

export function persistThemeMode(mode) {
  localStorage.setItem(THEME_STORAGE_KEY, mode);
}

applyThemeToDOM(getStoredThemeMode());
