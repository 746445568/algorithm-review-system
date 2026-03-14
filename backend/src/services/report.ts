import { parseTagList } from '../lib/problem-utils';

interface WeeklyReportData {
  startDate: Date;
  endDate: Date;
  submissions: any[];
  problems: any[];
  reviewQueues: any[];
}

interface WeeklyReport {
  summary: {
    totalProblems: number;
    totalSubmissions: number;
    acceptedCount: number;
    passRate: string;
    activeDays: number;
    importedProblems: number;
    completedReviews: number;
  };
  highlights: string[];
  errorAnalysis: {
    topErrorTypes: Array<{ type: string; count: number }>;
    difficultyDistribution: Array<{ difficulty: string; count: number }>;
    topTags: Array<{ tag: string; count: number }>;
  };
  suggestions: string[];
  shareText: string;
  markdown: string;
}

export async function generateWeeklyReport(data: WeeklyReportData): Promise<WeeklyReport> {
  const { startDate, endDate, submissions, problems, reviewQueues } = data;

  const totalProblems = problems.length;
  const totalSubmissions = submissions.length;
  const acceptedCount = submissions.filter((submission) => submission.status === 'ACCEPTED' || submission.status === 'OK').length;
  const passRate = totalSubmissions > 0 ? ((acceptedCount / totalSubmissions) * 100).toFixed(1) : '0';
  const activeDays = new Set(
    submissions.map((submission) => new Date(submission.submittedAt || submission.createdAt).toISOString().split('T')[0]),
  ).size;
  const importedProblems = problems.filter((problem) => problem.imported).length;
  const completedReviews = reviewQueues.filter((queue) => queue.lastReviewedAt).length;

  const errorTypeCount: Record<string, number> = {};
  const difficultyCount: Record<string, number> = {};
  const tagCount: Record<string, number> = {};

  submissions.forEach((submission) => {
    if (submission.errorType) {
      errorTypeCount[submission.errorType] = (errorTypeCount[submission.errorType] || 0) + 1;
    }
    difficultyCount[submission.problem.difficulty] = (difficultyCount[submission.problem.difficulty] || 0) + 1;
    parseTagList(submission.problem.tags).forEach((tag) => {
      tagCount[tag] = (tagCount[tag] || 0) + 1;
    });
  });

  const topErrorTypes = Object.entries(errorTypeCount)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([type, count]) => ({ type, count }));

  const difficultyDistribution = Object.entries(difficultyCount).map(([difficulty, count]) => ({
    difficulty,
    count,
  }));

  const topTags = Object.entries(tagCount)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6)
    .map(([tag, count]) => ({ tag, count }));

  const highlights: string[] = [];
  if (totalProblems > 0) highlights.push(`本周新增 ${totalProblems} 道题，其中 ${importedProblems} 道来自自动导入。`);
  if (acceptedCount > 0) highlights.push(`本周成功通过 ${acceptedCount} 次提交。`);
  if (activeDays > 0) highlights.push(`本周共有 ${activeDays} 天保持练习。`);
  if (completedReviews > 0) highlights.push(`本周完成了 ${completedReviews} 次复习。`);

  const suggestions: string[] = [];
  if (totalSubmissions === 0) {
    suggestions.push('本周还没有产生练习记录，下周可以先定一个最小目标，例如 3 道题。');
  }
  if (parseFloat(passRate) < 50 && totalSubmissions > 0) {
    suggestions.push('通过率偏低，建议先缩小刷题难度，优先做能快速总结的题型。');
  }
  if (topErrorTypes.length > 0) {
    suggestions.push(`本周最常见错误是“${topErrorTypes[0].type}”，建议安排一次专项复盘。`);
  }
  if (activeDays > 0 && activeDays < 3) {
    suggestions.push('练习频率偏低，建议固定每周至少 3 次练习时段。');
  }

  const shareText = [
    `本周刷题 ${totalSubmissions} 次，过题 ${acceptedCount} 次，通过率 ${passRate}%。`,
    completedReviews > 0 ? `完成复习 ${completedReviews} 次。` : '本周还没有完成复习任务。',
    topErrorTypes[0] ? `最常见错误：${topErrorTypes[0].type}。` : '本周暂时没有明显错误类型聚集。',
  ].join(' ');

  const markdown = `# 算法学习周报

**时间范围**：${formatDate(startDate)} - ${formatDate(endDate)}

## 本周概览

| 指标 | 数值 |
| --- | --- |
| 新题目 | ${totalProblems} 道 |
| 自动导入 | ${importedProblems} 道 |
| 提交次数 | ${totalSubmissions} 次 |
| 通过次数 | ${acceptedCount} 次 |
| 通过率 | ${passRate}% |
| 活跃天数 | ${activeDays} 天 |
| 完成复习 | ${completedReviews} 次 |

## 本周亮点

${highlights.length > 0 ? highlights.map((item) => `- ${item}`).join('\n') : '- 本周暂时还没有新的练习亮点。'}

## 错误分析

### 常见错误
${topErrorTypes.length > 0 ? topErrorTypes.map((item) => `- ${item.type}：${item.count} 次`).join('\n') : '- 暂无错误记录。'}

### 高频标签
${topTags.length > 0 ? topTags.map((item) => `- ${item.tag}：${item.count} 次`).join('\n') : '- 暂无标签统计。'}

### 难度分布
${difficultyDistribution.length > 0 ? difficultyDistribution.map((item) => `- ${difficultyLabel(item.difficulty)}：${item.count} 次提交`).join('\n') : '- 暂无提交记录。'}

## 下周建议

${suggestions.length > 0 ? suggestions.map((item) => `- ${item}`).join('\n') : '- 继续保持目前节奏。'}

## 适合分享的一句话

> ${shareText}
`;

  return {
    summary: {
      totalProblems,
      totalSubmissions,
      acceptedCount,
      passRate: `${passRate}%`,
      activeDays,
      importedProblems,
      completedReviews,
    },
    highlights,
    errorAnalysis: {
      topErrorTypes,
      difficultyDistribution,
      topTags,
    },
    suggestions,
    shareText,
    markdown,
  };
}

function formatDate(date: Date) {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}月${day}日`;
}

function difficultyLabel(difficulty: string) {
  if (difficulty === 'EASY') return '简单';
  if (difficulty === 'MEDIUM') return '中等';
  return '困难';
}
