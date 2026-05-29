import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const REVIEW_PAGE_FILE = new URL("../renderer/src/pages/ReviewPage.jsx", import.meta.url);
const ANALYSIS_PAGE_FILE = new URL("../renderer/src/pages/AnalysisPage.jsx", import.meta.url);

test("ReviewPage imports React when using React.useEffect", async () => {
  const source = await readFile(REVIEW_PAGE_FILE, "utf8");

  assert.match(source, /React\.useEffect\(/, "ReviewPage should still use React.useEffect in this regression test");
  assert.match(
    source,
    /^import\s+React\s*,\s*\{[\s\S]*\}\s+from\s+"react";/m,
    "ReviewPage should default-import React before calling React.useEffect"
  );
});

test("AnalysisPage imports useEffect when calling it directly", async () => {
  const source = await readFile(ANALYSIS_PAGE_FILE, "utf8");

  assert.match(source, /\buseEffect\(/, "AnalysisPage should call useEffect in this regression test");
  assert.match(
    source,
    /^import\s+(?:React\s*,\s*)?\{[\s\S]*\buseEffect\b[\s\S]*\}\s+from\s+"react";/m,
    "AnalysisPage should import useEffect from react before calling it directly"
  );
  assert.match(
    source,
    /^import\s+React\s*,\s*\{[\s\S]*\}\s+from\s+"react";/m,
    "AnalysisPage should default-import React before calling React.useEffect"
  );
});
