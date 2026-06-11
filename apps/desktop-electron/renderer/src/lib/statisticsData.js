const EMPTY_SUBMISSION_STATS = { weekly: [], tagAccuracy: [] };
const EMPTY_REVIEW_STATS = { daily: [], tagAccuracy: [] };
const EMPTY_REVIEW_SUMMARY = { total: 0, completed: 0 };
const EMPTY_VERDICT_STATS = { verdicts: [] };
const EMPTY_KNOWLEDGE_GRAPH = { nodes: [] };

export function normalizeSubmissionStats(payload) {
  const rawWeekly = payload?.weekly ?? payload?.byWeek ?? [];
  const rawTags = payload?.tagAccuracy ?? payload?.byTag ?? [];

  return {
    weekly: normalizeWeeklyData(rawWeekly),
    tagAccuracy: normalizeTagAccuracy(rawTags),
  };
}

export function normalizeReviewStats(payload) {
  return {
    daily: Array.isArray(payload?.daily) ? payload.daily : [],
    tagAccuracy: normalizeTagAccuracy(payload?.tagAccuracy ?? payload?.byTag ?? []),
  };
}

export async function collectStatisticsData(statisticsApi) {
  const requests = await Promise.allSettled([
    statisticsApi.getSubmissionStats(),
    statisticsApi.getReviewStats(),
    statisticsApi.getReviewSummary(),
    statisticsApi.getVerdictStats(),
    statisticsApi.getKnowledgeGraph(),
  ]);
  const firstError = requests.find((result) => result.status === "rejected")?.reason;

  return {
    submissionStats: normalizeSubmissionStats(valueOrDefault(requests[0], EMPTY_SUBMISSION_STATS)),
    reviewStats: normalizeReviewStats(valueOrDefault(requests[1], EMPTY_REVIEW_STATS)),
    reviewSummary: valueOrDefault(requests[2], EMPTY_REVIEW_SUMMARY),
    verdictStats: valueOrDefault(requests[3], EMPTY_VERDICT_STATS),
    knowledgeGraph: valueOrDefault(requests[4], EMPTY_KNOWLEDGE_GRAPH),
    error: firstError?.message ?? null,
  };
}

function valueOrDefault(result, fallback) {
  return result.status === "fulfilled" && result.value ? result.value : fallback;
}

function normalizeWeeklyData(items) {
  return (Array.isArray(items) ? items : []).map((w, index) => ({
    label: w.label || w.week || `W${index + 1}`,
    count: w.total || w.count || 0,
    acCount: w.acCount || 0,
  }));
}

function normalizeTagAccuracy(items) {
  return (Array.isArray(items) ? items : []).map((t) => ({
    tag: t.tag,
    total: t.attempts || t.total || 0,
    correct: t.acCount || t.correct || 0,
  }));
}
