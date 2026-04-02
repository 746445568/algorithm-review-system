import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const APP_FILE = new URL("../renderer/src/App.jsx", import.meta.url);

test("App 向 DashboardPage 传递浏览器模式必需的离线状态 props", async () => {
  const source = await readFile(APP_FILE, "utf8");

  for (const fragment of [
    "connectivity,",
    "cacheStatus,",
    "syncQueue,",
    "cacheStatus={cacheStatus}",
    "connectivity={connectivity}",
    "syncQueue={syncQueue}",
  ]) {
    assert.match(source, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
