export function parseTags(tags: string) {
  return tags
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function difficultyLabel(difficulty: string) {
  if (difficulty === 'EASY') return '简单';
  if (difficulty === 'MEDIUM') return '中等';
  return '困难';
}

export function difficultyColor(difficulty: string) {
  if (difficulty === 'EASY') return 'bg-emerald-50 text-emerald-700';
  if (difficulty === 'MEDIUM') return 'bg-amber-50 text-amber-700';
  return 'bg-rose-50 text-rose-700';
}

const shortJudgeLabelMap: Record<string, string> = {
  WRONG_ANSWER: 'WA',
  TIME_LIMIT_EXCEEDED: 'TLE',
  MEMORY_LIMIT_EXCEEDED: 'MLE',
  RUNTIME_ERROR: 'RE',
  COMPILATION_ERROR: 'CE',
  ACCEPTED: 'AC',
  OK: 'AC',
};

export function shortJudgeLabel(value?: string | null) {
  if (!value) return '';
  return shortJudgeLabelMap[value] || value;
}

export function normalizeSourceLabel(value?: string | null) {
  if (!value) return '';
  if (value.trim().toLowerCase() === 'codeforces') {
    return 'Codeforces';
  }

  return value.trim();
}
