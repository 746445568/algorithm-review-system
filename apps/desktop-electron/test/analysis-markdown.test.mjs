import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ANALYSIS_PAGE_FILE = new URL("../renderer/src/pages/AnalysisPage.jsx", import.meta.url);
const REVIEW_DETAIL_FILE = new URL("../renderer/src/pages/ReviewDetail.jsx", import.meta.url);

async function assertMarkdownRendererSupportsAdvancedBlocks(fileUrl, label) {
  const source = await readFile(fileUrl, "utf8");

  assert.match(
    source,
    /line\.startsWith\("```"\)/,
    `${label} 的 SimpleMarkdown 应支持代码块围栏`
  );
  assert.match(
    source,
    /\^\\d\+\\\.\\s/,
    `${label} 的 SimpleMarkdown 应支持有序列表`
  );
  assert.match(
    source,
    /line\.startsWith\("### "\)/,
    `${label} 的 SimpleMarkdown 应支持三级标题`
  );
  assert.match(
    source,
    /className="md-h3"/,
    `${label} 的 SimpleMarkdown 应渲染 md-h3`
  );
}

test("AnalysisPage 的 Markdown 渲染器支持高级块级语法", async () => {
  await assertMarkdownRendererSupportsAdvancedBlocks(ANALYSIS_PAGE_FILE, "AnalysisPage");
});

test("ReviewDetail 的 Markdown 渲染器支持高级块级语法", async () => {
  await assertMarkdownRendererSupportsAdvancedBlocks(REVIEW_DETAIL_FILE, "ReviewDetail");
});
