'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/api';
import { useCurrentUser } from '@/lib/auth';
import { difficultyColor, difficultyLabel, normalizeSourceLabel, parseTags, shortJudgeLabel } from '@/lib/problem';

interface Problem {
  id: string;
  title: string;
  difficulty: string;
  tags: string;
  source?: string | null;
  imported?: boolean;
  provider?: string | null;
  createdAt: string;
  submissions: Array<{
    submittedAt?: string | null;
    createdAt: string;
    errorType?: string | null;
    status: string;
  }>;
  reviewQueue: Array<{
    nextReviewDate: string;
    priority: number;
  }>;
  _count?: {
    submissions: number;
  };
}

interface ProblemListResponse {
  data: Problem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  filters: {
    difficulty: string;
    tag: string;
    search: string;
    imported: string;
    source: string;
    errorType: string;
    needsReview: string;
    sort: string;
    availableTags: string[];
    availableSources: string[];
    availableErrorTypes: string[];
  };
}

const sortOptions = [
  { value: 'newest', label: '最新创建' },
  { value: 'recent_submission', label: '最近提交' },
  { value: 'most_errors', label: '错误最多' },
  { value: 'needs_review', label: '最该复习' },
  { value: 'title', label: '按标题' },
];

export default function Home() {
  const { user, codeforces, isLoading: authLoading } = useCurrentUser();
  const [search, setSearch] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [tag, setTag] = useState('');
  const [source, setSource] = useState('');
  const [errorType, setErrorType] = useState('');
  const [sort, setSort] = useState('newest');
  const [importedOnly, setImportedOnly] = useState(false);
  const [needsReviewOnly, setNeedsReviewOnly] = useState(false);
  const [page, setPage] = useState(1);

  const query = useMemo(() => {
    if (!user) return null;

    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    if (difficulty) params.set('difficulty', difficulty);
    if (tag) params.set('tag', tag);
    if (source) params.set('source', source);
    if (errorType) params.set('errorType', errorType);
    if (importedOnly) params.set('imported', 'true');
    if (needsReviewOnly) params.set('needsReview', 'true');
    if (sort) params.set('sort', sort);
    params.set('page', String(page));
    params.set('limit', '12');
    return `/api/problems?${params.toString()}`;
  }, [difficulty, errorType, importedOnly, needsReviewOnly, page, search, sort, source, tag, user]);

  const { data, error, isLoading } = useSWR<ProblemListResponse>(query, swrFetcher);

  if (authLoading) {
    return <div className="py-10 text-center text-slate-500">加载中...</div>;
  }

  if (!user) {
    return (
      <div className="space-y-8">
        <section className="glass-card overflow-hidden">
          <div className="grid gap-8 px-6 py-10 lg:grid-cols-[1.2fr_0.8fr] lg:px-8">
            <div className="space-y-4">
              <span className="inline-flex rounded-full bg-primary-50 px-3 py-1 text-sm font-medium text-primary-700">
                Codeforces 登录 · 自动同步错题
              </span>
              <div className="space-y-3">
                <h1 className="text-balance text-4xl font-bold tracking-tight text-slate-900">
                  把 Codeforces 错题整理成你的个人复盘系统
                </h1>
                <p className="max-w-2xl text-base leading-7 text-slate-600">
                  登录后自动增量同步非 AC 提交，沉淀错题、复盘和复习计划。手动录题也保留，适合混合使用。
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <a
                  href="/api/auth/codeforces/login"
                  className="rounded-xl bg-primary-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-primary-200 transition hover:bg-primary-700"
                >
                  使用 Codeforces 登录
                </a>
                <form action="/api/auth/demo" method="POST">
                  <button
                    type="submit"
                    className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    演示体验（无需登录）
                  </button>
                </form>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FeatureCard title="自动同步错题" description="登录后自动拉取 Codeforces 最新非 AC 提交，避免手工录入。" />
              <FeatureCard title="每人私有数据" description="题目、提交、复盘和复习列表全部按账号隔离。" />
              <FeatureCard title="题库多维筛选" description="按来源、标签、错因、复习状态和最近提交综合检索。" />
              <FeatureCard title="周报与复习" description="把错题转成复习任务，并生成可分享的周报摘要。" />
            </div>
          </div>
        </section>
      </div>
    );
  }

  if (error) return <div className="glass-card p-4 text-red-600">加载失败：{error.message}</div>;
  if (isLoading || !data) return <div className="py-10 text-center text-slate-500">加载中...</div>;

  return (
    <div className="space-y-8">
      <section className="glass-card overflow-hidden">
        <div className="grid gap-8 px-6 py-8 lg:grid-cols-[1.4fr_1fr] lg:px-8">
          <div className="space-y-4">
            <span className="inline-flex rounded-full bg-primary-50 px-3 py-1 text-sm font-medium text-primary-700">
              我的题库 · 自动同步 · 复习闭环
            </span>
            <div className="space-y-3">
              <h1 className="text-balance text-4xl font-bold tracking-tight text-slate-900">
                你好，{user.handle}
              </h1>
              <p className="max-w-2xl text-base leading-7 text-slate-600">
                {codeforces?.lastSyncStatus === 'failed'
                  ? `最近同步失败：${codeforces.lastSyncError || '请前往同步状态页处理。'}`
                  : codeforces?.lastSyncedAt
                    ? `最近一次同步时间：${new Date(codeforces.lastSyncedAt).toLocaleString('zh-CN')}。`
                    : '你已登录，但还没有完成数据同步。前往同步状态页触发一次导入。'}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/settings" className="rounded-xl bg-primary-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-primary-200 transition hover:bg-primary-700">
                查看同步状态
              </Link>
              <Link href="/problems/new" className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                手动录入题目
              </Link>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard label="题目总数" value={String(data.pagination.total)} hint="当前用户题库" />
            <StatCard label="导入题目" value={String(codeforces?.importedProblemCount || 0)} hint="来自 Codeforces" />
            <StatCard label="待复习" value={String(codeforces?.dueReviewCount || 0)} hint="已到期任务" />
            <StatCard label="同步状态" value={codeforces?.syncing ? '同步中' : codeforces?.lastSyncStatus === 'failed' ? '失败' : '正常'} hint="当前 Codeforces 同步" />
          </div>
        </div>
      </section>

      <section className="soft-card p-5 md:p-6">
        <div className="grid gap-3 lg:grid-cols-[1.6fr_repeat(4,minmax(0,1fr))]">
          <input
            type="text"
            placeholder="搜索题目、标签、来源、关键词..."
            className="w-full rounded-2xl border px-4 py-3 text-sm shadow-sm"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />

          <select
            className="rounded-2xl border px-4 py-3 text-sm shadow-sm"
            value={difficulty}
            onChange={(event) => {
              setDifficulty(event.target.value);
              setPage(1);
            }}
          >
            <option value="">全部难度</option>
            <option value="EASY">简单</option>
            <option value="MEDIUM">中等</option>
            <option value="HARD">困难</option>
          </select>

          <select
            className="rounded-2xl border px-4 py-3 text-sm shadow-sm"
            value={source}
            onChange={(event) => {
              setSource(event.target.value);
              setPage(1);
            }}
          >
            <option value="">全部来源</option>
            {data.filters.availableSources.map((item) => (
              <option key={item} value={item}>{normalizeSourceLabel(item)}</option>
            ))}
          </select>

          <select
            className="rounded-2xl border px-4 py-3 text-sm shadow-sm"
            value={errorType}
            onChange={(event) => {
              setErrorType(event.target.value);
              setPage(1);
            }}
          >
            <option value="">全部错因</option>
            {data.filters.availableErrorTypes.map((item) => (
              <option key={item} value={item}>{shortJudgeLabel(item)}</option>
            ))}
          </select>

          <select
            className="rounded-2xl border px-4 py-3 text-sm shadow-sm"
            value={sort}
            onChange={(event) => {
              setSort(event.target.value);
              setPage(1);
            }}
          >
            {sortOptions.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <ToggleButton active={importedOnly} onClick={() => { setImportedOnly((current) => !current); setPage(1); }}>
            仅导入题
          </ToggleButton>
          <ToggleButton active={needsReviewOnly} onClick={() => { setNeedsReviewOnly((current) => !current); setPage(1); }}>
            仅待复习
          </ToggleButton>
          <button
            onClick={() => {
              setSearch('');
              setDifficulty('');
              setTag('');
              setSource('');
              setErrorType('');
              setSort('newest');
              setImportedOnly(false);
              setNeedsReviewOnly(false);
              setPage(1);
            }}
            className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-200"
          >
            清空筛选
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => {
              setTag('');
              setPage(1);
            }}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              !tag ? 'bg-primary-600 text-white shadow-md shadow-primary-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            全部标签
          </button>
          {data.filters.availableTags.slice(0, 20).map((item) => (
            <button
              key={item}
              onClick={() => {
                setTag(item);
                setPage(1);
              }}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                tag === item ? 'bg-primary-600 text-white shadow-md shadow-primary-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </section>

      {data.data.length === 0 ? (
        <section className="soft-card px-6 py-16 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-50 text-3xl">📝</div>
          <h2 className="mt-5 text-xl font-semibold text-slate-900">当前没有题目记录</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
            当前筛选下没有结果。你可以调整筛选条件，或前往同步状态页重新拉取 Codeforces 错题。
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link href="/settings" className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
              去同步状态
            </Link>
            <Link href="/problems/new" className="rounded-xl bg-primary-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-primary-200 transition hover:bg-primary-700">
              手动录题
            </Link>
          </div>
        </section>
      ) : (
        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {data.data.map((problem) => {
            const latestSubmission = problem.submissions[0];
            const nextReview = problem.reviewQueue[0];
            const tags = parseTags(problem.tags).slice(0, 4);
            return (
              <article
                key={problem.id}
                className="group soft-card p-5 transition duration-200 hover:-translate-y-1 hover:shadow-[0_20px_45px_-22px_rgba(37,99,235,0.35)]"
              >
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      {problem.imported ? (
                        <span className="inline-flex rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-700">
                          来自 Codeforces
                        </span>
                      ) : null}
                      {nextReview ? (
                        <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                          待复习
                        </span>
                      ) : null}
                    </div>
                    <Link
                      href={`/problems/${problem.id}`}
                      className="line-clamp-2 text-lg font-semibold text-slate-900 transition group-hover:text-primary-700"
                    >
                      {problem.title}
                    </Link>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${difficultyColor(problem.difficulty)}`}>
                    {difficultyLabel(problem.difficulty)}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {tags.map((item) => (
                    <span key={item} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                      {item}
                    </span>
                  ))}
                </div>

                <div className="mt-4 space-y-2 text-sm text-slate-500">
                  <div className="flex items-center justify-between">
                    <span>来源</span>
                    <span className="font-medium text-slate-700">{normalizeSourceLabel(problem.source || problem.provider) || '手动录入'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>提交数</span>
                    <span className="font-medium text-slate-700">{problem._count?.submissions || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>最近状态</span>
                    <span className="font-medium text-slate-700">{shortJudgeLabel(latestSubmission?.status) || '暂无'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>最近错因</span>
                    <span className="truncate pl-4 font-medium text-slate-700">{shortJudgeLabel(latestSubmission?.errorType) || '--'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>下次复习</span>
                    <span className="font-medium text-slate-700">{nextReview ? new Date(nextReview.nextReviewDate).toLocaleDateString('zh-CN') : '--'}</span>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {data.pagination.totalPages > 1 ? (
        <div className="flex items-center justify-center gap-3">
          <button
            disabled={page <= 1}
            onClick={() => setPage((current) => current - 1)}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
          >
            上一页
          </button>
          <span className="text-sm text-slate-500">
            第 {data.pagination.page} / {data.pagination.totalPages} 页
          </span>
          <button
            disabled={page >= data.pagination.totalPages}
            onClick={() => setPage((current) => current + 1)}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
          >
            下一页
          </button>
        </div>
      ) : null}
    </div>
  );
}

function FeatureCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-white/70 bg-white/95 p-5 shadow-[0_15px_35px_-22px_rgba(15,23,42,0.35)]">
      <div className="text-base font-semibold text-slate-900">{title}</div>
      <div className="mt-2 text-sm leading-6 text-slate-500">{description}</div>
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-white/70 bg-white/95 p-5 shadow-[0_15px_35px_-22px_rgba(15,23,42,0.35)]">
      <div className="text-sm font-medium text-slate-500">{label}</div>
      <div className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{value}</div>
      <div className="mt-1 text-xs text-slate-400">{hint}</div>
    </div>
  );
}

function ToggleButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-medium transition ${
        active ? 'bg-primary-600 text-white shadow-md shadow-primary-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
      }`}
    >
      {children}
    </button>
  );
}
