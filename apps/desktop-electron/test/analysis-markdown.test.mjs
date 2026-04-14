import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const SIMPLE_MARKDOWN_FILE = new URL("../renderer/src/components/SimpleMarkdown.jsx", import.meta.url);
const ANALYSIS_RESULT_FILE = new URL("../renderer/src/components/Analysis/AnalysisResult.jsx", import.meta.url);
const STATE_TAB_FILE = new URL("../renderer/src/components/ReviewDetail/tabs/StateTab.jsx", import.meta.url);
const ANALYSIS_TAB_FILE = new URL("../renderer/src/components/ReviewDetail/tabs/AnalysisTab.jsx", import.meta.url);

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

test("SimpleMarkdown 组件支持高级块级语法", async () => {
  await assertMarkdownRendererSupportsAdvancedBlocks(SIMPLE_MARKDOWN_FILE, "SimpleMarkdown");
});

test("AnalysisResult 引用 SimpleMarkdown 组件", async () => {
  const source = await readFile(ANALYSIS_RESULT_FILE, "utf8");
  assert.match(
    source,
    /import.*SimpleMarkdown.*from/,
    "AnalysisResult 应引用 SimpleMarkdown 组件"
  );
});

test("StateTab 引用 SimpleMarkdown 组件", async () => {
  const source = await readFile(STATE_TAB_FILE, "utf8");
  assert.match(
    source,
    /import.*SimpleMarkdown.*from/,
    "StateTab 应引用 SimpleMarkdown 组件"
  );
});

test("AnalysisTab 引用 SimpleMarkdown 组件", async () => {
  const source = await readFile(ANALYSIS_TAB_FILE, "utf8");
  assert.match(
    source,
    /import.*SimpleMarkdown.*from/,
    "AnalysisTab 应引用 SimpleMarkdown 组件"
  );
});
