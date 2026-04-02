import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const API_FILE = new URL("../renderer/src/lib/api.js", import.meta.url);
const REVIEW_DETAIL_FILE = new URL("../renderer/src/pages/ReviewDetail.jsx", import.meta.url);

test("桌面端 API 暴露单题分析接口", async () => {
  const source = await readFile(API_FILE, "utf8");

  assert.match(
    source,
    /generateProblemAnalysis:\s*\(problemId,\s*opts\s*=\s*\{\}\)\s*=>/,
    "api.js 应提供 generateProblemAnalysis(problemId, opts)"
  );
  assert.match(
    source,
    /request\(`\/api\/analysis\/generate-problem\/\$\{problemId\}`,\s*\{/,
    "单题分析应请求 /api/analysis/generate-problem/{problemId}"
  );
});

test("单题详情页触发单题分析而不是全局分析", async () => {
  const source = await readFile(REVIEW_DETAIL_FILE, "utf8");

  assert.match(
    source,
    /api\.generateProblemAnalysis\(selectedProblemId,\s*\{\}\)/,
    "ReviewDetail 应把当前 selectedProblemId 传给单题分析接口"
  );
  assert.doesNotMatch(
    source,
    /api\.generateAnalysis\(\{\}\)/,
    "ReviewDetail 不应在单题详情里调用全局分析接口"
  );
});
