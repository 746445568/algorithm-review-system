import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const SHELL_CSS = new URL("../renderer/src/styles/ui-shell.css", import.meta.url);

test("desktop shell top nav stays in normal layout flow", async () => {
  const source = await readFile(SHELL_CSS, "utf8");
  const desktopNavBlock = source.match(/\.app-shell-v2 \.top-nav\.nav\s*\{[^}]+\}/)?.[0] ?? "";
  const workspaceBlock = source.match(/\.app-shell-v2 \.workspace-v2\s*\{[^}]+\}/)?.[0] ?? "";

  assert.doesNotMatch(desktopNavBlock, /position:\s*fixed/);
  assert.match(source, /\.app-shell-v2\s*\{[^}]*display:\s*flex/s);
  assert.match(source, /\.app-shell-v2\s*\{[^}]*flex-direction:\s*column/s);
  assert.match(workspaceBlock, /flex:\s*1/);
  assert.match(workspaceBlock, /margin-top:\s*0/);
});
