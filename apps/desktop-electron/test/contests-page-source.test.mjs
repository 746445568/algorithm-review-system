import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const CONTESTS_PAGE = new URL("../renderer/src/pages/ContestsPage.jsx", import.meta.url);

test("ContestsPage reloads contests after contest sync completes", async () => {
  const source = await readFile(CONTESTS_PAGE, "utf8");

  assert.doesNotMatch(source, /void\s+api\.syncContests\(\)\.catch/);
  assert.match(source, /await\s+api\.syncContests\(\)/);
  assert.match(source, /await\s+loadContests\(statusFilter\)/);
});
