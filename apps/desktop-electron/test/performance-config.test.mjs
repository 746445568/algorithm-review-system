import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const MAIN_FILE = new URL("../main/index.mjs", import.meta.url);
const DEV_FILE = new URL("../scripts/dev.mjs", import.meta.url);
const START_STATIC_FILE = new URL("../scripts/start-static.mjs", import.meta.url);
const STYLES_FILE = new URL("../renderer/src/styles.css", import.meta.url);

test("desktop main process keeps GPU acceleration enabled for renderer performance", async () => {
  const source = await readFile(MAIN_FILE, "utf8");

  assert.doesNotMatch(source, /appendSwitch\("disable-gpu"\)/, "main process should not disable GPU globally");
  assert.doesNotMatch(
    source,
    /appendSwitch\("disable-software-rasterizer"\)/,
    "main process should not disable the software rasterizer fallback"
  );
  assert.doesNotMatch(
    source,
    /disableHardwareAcceleration\(\)/,
    "main process should not disable hardware acceleration"
  );
});

test("desktop launch scripts do not pass GPU-disabling flags to Electron", async () => {
  for (const [label, file] of [
    ["dev", DEV_FILE],
    ["start-static", START_STATIC_FILE],
  ]) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /"--disable-gpu"/, `${label} launcher should not pass --disable-gpu`);
    assert.doesNotMatch(
      source,
      /"--disable-software-rasterizer"/,
      `${label} launcher should not pass --disable-software-rasterizer`
    );
  }
});

test("scroll-heavy shell surfaces avoid backdrop blur filters", async () => {
  const source = await readFile(STYLES_FILE, "utf8");

  assert.doesNotMatch(
    source,
    /\.sidebar\s*\{[\s\S]*?backdrop-filter:/,
    "sidebar should avoid backdrop-filter because it repaints during scroll"
  );
  assert.doesNotMatch(
    source,
    /\.stat-card\s*\{[\s\S]*?backdrop-filter:/,
    "stat cards should avoid backdrop-filter on dense statistics screens"
  );
  assert.doesNotMatch(
    source,
    /\.panel\s*\{[\s\S]*?backdrop-filter:/,
    "panel surfaces should avoid backdrop-filter because they appear across scroll-heavy pages"
  );
});
