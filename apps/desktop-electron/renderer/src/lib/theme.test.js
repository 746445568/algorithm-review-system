import { describe, expect, it } from "vitest";
import { applyThemeToDOM, resolveEffectiveTheme } from "./theme.js";

describe("theme", () => {
  it("applies a real dark theme attribute", () => {
    expect(resolveEffectiveTheme("dark")).toBe("dark");
    applyThemeToDOM("dark");
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  });
});
