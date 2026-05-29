import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const APP_FILE = new URL("../renderer/src/App.jsx", import.meta.url);

test("App imports every page component it renders at the top level", async () => {
  const source = await readFile(APP_FILE, "utf8");

  for (const componentName of [
    "AnalysisPage",
    "ContestsPage",
    "DashboardPage",
    "OnboardingPage",
    "ReviewPage",
    "SettingsPage",
    "StatisticsPage",
  ]) {
    assert.match(
      source,
      new RegExp(`import\\s+\\{\\s*${componentName}\\s*\\}\\s+from\\s+"\\.\\/pages\\/${componentName}\\.jsx";`),
      `App.jsx should import ${componentName} before rendering it`
    );
  }
});
