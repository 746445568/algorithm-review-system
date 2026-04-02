import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const STYLES_FILE = new URL("../renderer/src/styles.css", import.meta.url);
const MAIN_FILE = new URL("../main/index.mjs", import.meta.url);

test("复习页为 SM-2 评分按钮提供独立样式", async () => {
  const source = await readFile(STYLES_FILE, "utf8");

  for (const selector of [
    ".rd-rate-btns",
    ".rd-rate-btn",
    ".rd-rate-btn--forgot",
    ".rd-rate-btn--hard",
    ".rd-rate-btn--medium",
    ".rd-rate-btn--easy",
    ".rd-rate-key",
    ".rd-srs-hint",
  ]) {
    assert.match(source, new RegExp(selector.replaceAll(".", "\\.")), `styles.css 缺少 ${selector}`);
  }
});

test("开发态桌面服务默认使用仓库内可写运行目录", async () => {
  const source = await readFile(MAIN_FILE, "utf8");

  assert.match(
    source,
    /process\.env\.OJREVIEW_APP_DIR\s*\?\?\s*\(isDev\s*\?\s*path\.join\(app\.getAppPath\(\),\s*"\.ojreview-runtime"\)\s*:\s*path\.join\(app\.getPath\("appData"\),\s*"OJReviewDesktop"\)\)/,
    "开发态应回退到 appRoot/.ojreview-runtime，避免默认用户目录不可写导致服务启动失败"
  );
});
