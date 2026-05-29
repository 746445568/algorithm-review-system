import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const DASHBOARD_FILE = new URL("../renderer/src/components/Dashboard/DashboardPage.jsx", import.meta.url);

test("DashboardPage binds all hook values it uses during render", async () => {
  const source = await readFile(DASHBOARD_FILE, "utf8");

  assert.match(
    source,
    /const\s+\{[\s\S]*?data,[\s\S]*?error,[\s\S]*?isLoading,[\s\S]*?mutate:\s*mutateDashboard,[\s\S]*?\}\s*=\s*useDashboardData\(serviceStatus\);/,
    "DashboardPage should alias dashboard SWR mutate before calling refresh helpers"
  );

  assert.match(
    source,
    /const\s+combinedError\s*=/,
    "DashboardPage should define combinedError before passing it to AccountManager"
  );

  assert.match(
    source,
    /const\s+dashboardData\s*=\s*data\s*\?\?\s*[A-Z_]+;/,
    "DashboardPage should provide a non-null dashboardData fallback while the service is still starting"
  );

  assert.doesNotMatch(
    source,
    /data\.goals\.length|data\.syncTasks\[0\]/,
    "DashboardPage should read render-time collections from dashboardData instead of nullable data"
  );
});
