interface Problem {
  title: string;
  description: string;
  difficulty: string;
  tags: string;
  source?: string | null;
}

interface Submission {
  code?: string | null;
  language: string;
  status: string;
  errorMessage?: string | null;
  errorType?: string | null;
}

interface ReviewResult {
  analysis: string;
  suggestions: string;
  keyPoints: string[];
  similarProblems?: string[];
}

export async function generateReview(data: {
  problem: Problem;
  submission: Submission;
}): Promise<ReviewResult> {
  const { problem, submission } = data;
  const prompt = buildReviewPrompt(problem, submission);

  try {
    const response = await callLLM(prompt);
    return parseReviewResponse(response);
  } catch (error) {
    console.error('LLM 调用失败，使用降级复盘模板:', error);
    return generateFallbackReview(problem, submission);
  }
}

function buildReviewPrompt(problem: Problem, submission: Submission): string {
  return `你是一位擅长算法训练的编程教练。请根据下面的题目和提交记录，输出一份结构化复盘。

## 题目信息
- 标题：${problem.title}
- 难度：${problem.difficulty}
- 标签：${problem.tags}
- 来源：${problem.source || '自定义题目'}
- 描述：
${problem.description}

## 提交信息
- 语言：${submission.language}
- 状态：${submission.status}
${submission.errorMessage ? `- 错误信息：${submission.errorMessage}` : ''}
${submission.errorType ? `- 错误类型：${submission.errorType}` : ''}

## 提交代码
\`\`\`${submission.language.toLowerCase()}
${submission.code || '// 当前提交来自外部导入，未同步源码'}
\`\`\`

请严格输出 JSON，字段如下：
{
  "analysis": "解释错误原因、思路误区、代码问题",
  "suggestions": "给出 3-5 条可执行建议，使用换行分隔",
  "keyPoints": ["关键学习点1", "关键学习点2"],
  "similarProblems": ["可选的相似题推荐"]
}

要求：
1. 复盘要具体，不要空泛鼓励；
2. 建议要可执行；
3. 不确定的地方请明确说明。`;
}

async function callLLM(prompt: string): Promise<string> {
  const apiKey = process.env.LLM_API_KEY;
  const apiBase = process.env.LLM_API_BASE || 'https://api.openai.com/v1';
  const model = process.env.LLM_MODEL || 'gpt-4o-mini';

  if (!apiKey) {
    throw new Error('未配置 LLM_API_KEY');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(`${apiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: '你是一位专业算法教练，请用中文输出严谨、易读、可执行的复盘建议。',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.4,
        max_tokens: 1800,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LLM 请求失败：${response.status} ${errorText}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    return data.choices?.[0]?.message?.content || '';
  } finally {
    clearTimeout(timeout);
  }
}

function parseReviewResponse(content: string): ReviewResult {
  try {
    const normalizedContent = content
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();

    const jsonMatch = normalizedContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('未找到 JSON 结构');
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      analysis?: unknown;
      suggestions?: unknown;
      keyPoints?: unknown;
      similarProblems?: unknown;
    };

    return {
      analysis: String(parsed.analysis || '暂无分析结果'),
      suggestions: Array.isArray(parsed.suggestions)
        ? parsed.suggestions.map((item) => String(item)).join('\n')
        : String(parsed.suggestions || '建议继续补充更多测试用例并复盘思路。'),
      keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints.map((item) => String(item)) : [],
      similarProblems: Array.isArray(parsed.similarProblems)
        ? parsed.similarProblems.map((item) => String(item))
        : undefined,
    };
  } catch (error) {
    console.warn('解析 LLM 响应失败，降级为纯文本复盘:', error);
    return {
      analysis: content,
      suggestions: '建议重新检查边界条件、状态转移和复杂度估算。',
      keyPoints: ['重新梳理解题思路', '补充边界测试', '对照题解查缺补漏'],
    };
  }
}

function generateFallbackReview(problem: Problem, submission: Submission): ReviewResult {
  const statusMessages: Record<string, string> = {
    ACCEPTED: '这次提交已经通过，可以重点总结正确思路和可复用模板。',
    WRONG_ANSWER: '答案错误，优先排查边界条件、状态定义和转移逻辑。',
    TIME_LIMIT_EXCEEDED: '出现超时，建议重新审视时间复杂度和数据结构选择。',
    MEMORY_LIMIT_EXCEEDED: '出现内存超限，建议优化空间使用或改进存储结构。',
    RUNTIME_ERROR: '出现运行时错误，建议重点检查空值、越界、除零和非法状态。',
    COMPILATION_ERROR: '出现编译错误，建议先解决语法或 API 使用问题。',
  };

  const errorSummary = submission.errorMessage ? `错误信息：${submission.errorMessage}` : '没有提供具体错误信息。';
  const typeSummary = submission.errorType ? `错误类型：${submission.errorType}` : '未标注错误类型。';

  return {
    analysis: [
      `题目《${problem.title}》当前提交状态为 ${submission.status}。`,
      statusMessages[submission.status] || '建议先确认题意，再从最小样例开始手动推导。',
      errorSummary,
      typeSummary,
      !submission.code ? '当前提交来自外部导入，缺少源码，建议结合原题和你的最终代码再补充复盘。' : '',
    ]
      .filter(Boolean)
      .join('\n'),
    suggestions: [
      '先用最小样例和极端样例手动推演一遍代码执行过程。',
      '把思路拆成“状态定义、转移逻辑、边界条件”三个部分分别检查。',
      '补充 3 组针对当前错误的测试数据，再决定是否重构。',
      '完成修正后，记录这次错误的根因和避免方式。',
    ].join('\n'),
    keyPoints: [
      `难度：${problem.difficulty}`,
      `知识点：${problem.tags || '未标注标签'}`,
      '没有模型服务时也要保留结构化复盘习惯',
    ],
  };
}
