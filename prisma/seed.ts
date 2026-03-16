import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // 幂等：upsert 演示用户
  const user = await prisma.user.upsert({
    where: { handle: 'demo-user' },
    update: {},
    create: {
      handle: 'demo-user',
      displayName: '演示用户',
      rating: 1500,
    },
  });

  console.log(`[seed] 演示用户: ${user.handle} (${user.id})`);

  // 演示题目数据
  const problemsData = [
    {
      key: 'CF1A',
      title: 'Theatre Square',
      difficulty: 'EASY',
      tags: '["math"]',
      contestId: 1,
      problemIndex: 'A',
      source: 'Codeforces Round 1',
    },
    {
      key: 'CF4C',
      title: 'Registration System',
      difficulty: 'EASY',
      tags: '["hashing","implementation"]',
      contestId: 4,
      problemIndex: 'C',
      source: 'Codeforces Round 4',
    },
    {
      key: 'CF158B',
      title: 'Taxi',
      difficulty: 'EASY',
      tags: '["greedy","math","sortings"]',
      contestId: 158,
      problemIndex: 'B',
      source: 'Codeforces Round 158',
    },
    {
      key: 'CF1234D',
      title: 'Distinct Characters Queries',
      difficulty: 'MEDIUM',
      tags: '["binary search","strings"]',
      contestId: 1234,
      problemIndex: 'D',
      source: 'Codeforces Round 588',
    },
    {
      key: 'CF580C',
      title: 'Kefa and Park',
      difficulty: 'MEDIUM',
      tags: '["dfs and similar","trees"]',
      contestId: 580,
      problemIndex: 'C',
      source: 'Codeforces Round 321',
    },
    {
      key: 'CF814C',
      title: 'An Ear for an Ear',
      difficulty: 'MEDIUM',
      tags: '["dp","greedy","two pointers"]',
      contestId: 814,
      problemIndex: 'C',
      source: 'Codeforces Round 418',
    },
    {
      key: 'CF1363D',
      title: 'Guess The Maximums',
      difficulty: 'HARD',
      tags: '["binary search","constructive algorithms","interactive"]',
      contestId: 1363,
      problemIndex: 'D',
      source: 'Codeforces Round 648',
    },
    {
      key: 'CF1548D',
      title: 'Lucky Permutation',
      difficulty: 'HARD',
      tags: '["dsu","graphs","math","probabilities"]',
      contestId: 1548,
      problemIndex: 'D',
      source: 'Codeforces Round 733',
    },
  ];

  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const threeDaysLater = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  for (const pd of problemsData) {
    const problem = await prisma.problem.upsert({
      where: {
        userId_provider_externalProblemKey: {
          userId: user.id,
          provider: 'codeforces',
          externalProblemKey: pd.key,
        },
      },
      update: {},
      create: {
        userId: user.id,
        title: pd.title,
        description: `来自 ${pd.source} 的 ${pd.problemIndex} 题。`,
        source: pd.source,
        url: `https://codeforces.com/problemset/problem/${pd.contestId}/${pd.problemIndex}`,
        difficulty: pd.difficulty,
        tags: pd.tags,
        provider: 'codeforces',
        externalProblemKey: pd.key,
        contestId: pd.contestId,
        problemIndex: pd.problemIndex,
        externalUrl: `https://codeforces.com/problemset/problem/${pd.contestId}/${pd.problemIndex}`,
        imported: true,
      },
    });

    // 幂等地创建全文搜索索引
    await prisma.problemSearch.upsert({
      where: { problemId: problem.id },
      update: {},
      create: {
        userId: user.id,
        problemId: problem.id,
        title: pd.title,
        description: `来自 ${pd.source} 的 ${pd.problemIndex} 题。`,
        tags: pd.tags,
        source: pd.source,
      },
    });

    // 每道题创建 1-2 条错误提交
    const submissions: {
      status: string;
      errorType: string;
      code: string;
      language: string;
      submittedAt: Date;
    }[] = [
      {
        status: 'WRONG_ANSWER',
        errorType: 'WRONG_ANSWER',
        code: `// 第一次尝试：逻辑有误\n#include <bits/stdc++.h>\nusing namespace std;\nint main() {\n    // TODO\n    return 0;\n}`,
        language: 'C++17',
        submittedAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      },
    ];

    if (pd.difficulty !== 'EASY') {
      submissions.push({
        status: 'TIME_LIMIT_EXCEEDED',
        errorType: 'TIME_LIMIT_EXCEEDED',
        code: `// 第二次尝试：超时\n#include <bits/stdc++.h>\nusing namespace std;\nint main() {\n    // 暴力解法\n    return 0;\n}`,
        language: 'C++17',
        submittedAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
      });
    }

    const createdSubmissions = [];
    for (const sub of submissions) {
      const existing = await prisma.submission.findFirst({
        where: {
          userId: user.id,
          problemId: problem.id,
          status: sub.status,
          submittedAt: sub.submittedAt,
        },
      });

      if (!existing) {
        const s = await prisma.submission.create({
          data: {
            userId: user.id,
            problemId: problem.id,
            code: sub.code,
            language: sub.language,
            status: sub.status,
            errorType: sub.errorType,
            submittedAt: sub.submittedAt,
          },
        });
        createdSubmissions.push(s);
      } else {
        createdSubmissions.push(existing);
      }
    }

    // 为部分题目创建 AI 分析（前 4 道）
    const analysisMap: Record<string, { aiAnalysis: string; improvementSuggestions: string; keyPoints: string }> = {
      CF1A: {
        aiAnalysis: '此题考查基础数学中的向上取整。核心是将大矩形面积除以小正方形面积，注意整除时不需要多铺一块。选手常见错误是直接整除导致边界情况漏算，应使用 `(n + a - 1) / a` 公式。',
        improvementSuggestions: '1. 牢记向上取整公式 `(a + b - 1) / b`。\n2. 注意使用 long long 防止 n * m 溢出。\n3. 读题时留意坐标系与矩阵大小的单位换算。',
        keyPoints: '向上取整,整数溢出,math',
      },
      CF4C: {
        aiAnalysis: '哈希表统计出现次数的经典题。每次查询时若用户名已存在，则输出 "name + 出现次数"，否则输出 "OK"。选手易错点：计数需要在每次出现后递增，而不只是判断是否已存在。',
        improvementSuggestions: '1. 使用 unordered_map<string, int> 统计计数。\n2. 注意字符串拼接时需将整数转为字符串：`name + to_string(cnt)`。\n3. 第一次出现输出 OK，后续出现才加后缀，边界别搞混。',
        keyPoints: 'hashing,implementation,字符串处理',
      },
      CF158B: {
        aiAnalysis: '贪心题。优先将 4 人组合填满，剩余按 3+1、2+2 的组合分配。关键在于把人数分类后按最优顺序填充。错误思路是不分类直接计算，忽略了 3 人和 1 人的组合能相互补足。',
        improvementSuggestions: '1. 先统计各人数的小组数量 c1, c2, c3, c4。\n2. c4 直接各占一辆；c3 占一辆，剩余空位可填 c1（min 取较小值）。\n3. c2 两组拼一辆，剩余 c2 与 c1 拼；最后 c1 四人拼一辆。',
        keyPoints: 'greedy,模拟,分类讨论',
      },
      CF1234D: {
        aiAnalysis: '预处理 + 二分查找。对每个字符记录其所有出现位置，查询时在字符位置列表中二分查找区间内最近的出现位置。时间复杂度 O((n + q) log n)。常见错误是暴力扫描导致 TLE。',
        improvementSuggestions: '1. 对 26 个字母各维护一个有序位置列表。\n2. 使用 lower_bound 在列表中查找 ≥ l 的第一个位置，判断是否 ≤ r。\n3. 注意字符不出现在区间内时返回 NO。',
        keyPoints: 'binary search,strings,预处理',
      },
    };

    const analysisData = analysisMap[pd.key];
    if (analysisData && createdSubmissions.length > 0) {
      const firstSub = createdSubmissions[0];
      const existingReview = await prisma.review.findUnique({
        where: { submissionId: firstSub.id },
      });

      if (!existingReview) {
        await prisma.review.create({
          data: {
            submissionId: firstSub.id,
            aiAnalysis: analysisData.aiAnalysis,
            improvementSuggestions: analysisData.improvementSuggestions,
            keyPoints: analysisData.keyPoints,
          },
        });
      }
    }

    // 为前 6 道题创建复习计划，nextReviewDate 分布在不同时间
    const reviewDates = [yesterday, now, now, threeDaysLater, sevenDaysLater, sevenDaysLater];
    const problemIndex = problemsData.indexOf(pd);
    if (problemIndex < reviewDates.length) {
      const existingQueue = await prisma.reviewQueue.findFirst({
        where: { userId: user.id, problemId: problem.id },
      });

      if (!existingQueue) {
        await prisma.reviewQueue.create({
          data: {
            userId: user.id,
            problemId: problem.id,
            nextReviewDate: reviewDates[problemIndex],
            interval: [1, 1, 3, 3, 7, 7][problemIndex],
            priority: [3, 2, 2, 1, 1, 1][problemIndex],
            reviewCount: [2, 1, 1, 0, 0, 0][problemIndex],
          },
        });
      }
    }

    console.log(`[seed] 题目: ${pd.title} (${pd.difficulty})`);
  }

  console.log('[seed] 演示数据写入完成！');
  console.log('[seed] 启动后访问 http://localhost:3000，点击"演示体验（无需登录）"开始。');
}

main()
  .catch((e) => {
    console.error('[seed] 写入失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
