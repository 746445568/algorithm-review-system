import { useCallback, useEffect, useState } from "react";
import { applyThemeToDOM, getStoredThemeMode, persistThemeMode } from "../lib/theme.js";

export function useThemeMode() {
  const [themeMode, setThemeMode] = useState(() => getStoredThemeMode());

  const handleThemeChange = useCallback((mode) => {
    persistThemeMode(mode);
    setThemeMode(mode);
    applyThemeToDOM(mode);
  }, []);

  useEffect(() => {
    applyThemeToDOM(themeMode);
  }, [themeMode]);

  useEffect(() => {
    if (themeMode !== "follow-system") {
      return undefined;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => applyThemeToDOM("follow-system");
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [themeMode]);

  return {
    themeMode,
    onThemeChange: handleThemeChange,
  };
}
