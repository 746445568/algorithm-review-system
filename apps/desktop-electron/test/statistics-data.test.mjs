import test from "node:test";
import assert from "node:assert/strict";

import {
  collectStatisticsData,
  normalizeSubmissionStats,
  normalizeReviewStats,
} from "../renderer/src/lib/statisticsData.js";

test("normalizeSubmissionStats accepts server byWeek/byTag payloads", () => {
  const normalized = normalizeSubmissionStats({
    byWeek: [{ week: "2026-W22", total: 4, acCount: 3 }],
    byTag: [{ tag: "dp", attempts: 5, acCount: 2 }],
  });

  assert.deepEqual(normalized.weekly, [
    { label: "2026-W22", count: 4, acCount: 3 },
  ]);
  assert.deepEqual(normalized.tagAccuracy, [
    { tag: "dp", total: 5, correct: 2 },
  ]);
});

test("normalizeReviewStats keeps daily data and accepts tagAccuracy fallback", () => {
  const normalized = normalizeReviewStats({
    daily: [{ date: "2026-06-11", count: 2 }],
    tagAccuracy: [{ tag: "graphs", total: 3, correct: 1 }],
  });

  assert.deepEqual(normalized.daily, [{ date: "2026-06-11", count: 2 }]);
  assert.deepEqual(normalized.tagAccuracy, [
    { tag: "graphs", total: 3, correct: 1 },
  ]);
});

test("collectStatisticsData keeps usable panels when an optional request fails", async () => {
  const data = await collectStatisticsData({
    getSubmissionStats: async () => ({ byWeek: [{ week: "2026-W22", total: 4, acCount: 3 }] }),
    getReviewStats: async () => ({ daily: [] }),
    getReviewSummary: async () => ({ total: 2, completed: 1 }),
    getVerdictStats: async () => ({ verdicts: [{ verdict: "AC", count: 3 }] }),
    getKnowledgeGraph: async () => {
      throw new Error("database is busy");
    },
  });

  assert.equal(data.error, "database is busy");
  assert.equal(data.submissionStats.weekly[0].count, 4);
  assert.equal(data.reviewSummary.completed, 1);
  assert.deepEqual(data.knowledgeGraph.nodes, []);
});
