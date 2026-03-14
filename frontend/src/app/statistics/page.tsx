'use client';

import useSWR from 'swr';
import { AuthRequired } from '@/components/auth-required';
import { useCurrentUser } from '@/lib/auth';
import { difficultyLabel } from '@/lib/problem';
import { swrFetcher } from '@/lib/api';

interface ErrorAnalysis {
  overview: {
    totalSubmissions: number;
    acceptedCount: number;
    errorCount: number;
    passRate: string;
    last7Submissions: number;
    last30Submissions: number;
    last7Errors: number;
    last30Errors: number;
    dueReviewCount: number;
    completedReviewsLast7: number;
    completedReviewsLast30: number;
    reviewCompletionRate: string;
  };
  errorTypes: Array<{ type: string; count: number }>;
  difficultyErrors: Array<{ difficulty: string; count: number }>;
  trend: Array<{ date: string; count: number }>;
}

interface SkillAnalysis {
  weakestSkills: Array<{ skill: string; total: number; mastered: number; masteryRate: string }>;
  strongestSkills: Array<{ skill: string; total: number; mastered: number; masteryRate: string }>;
}

interface Performance {
  recentAccepted: Array<{ problemTitle: string; difficulty: string }>;
  needReview: Array<{ problemTitle: string; errorCount: number }>;
  topErrorTags: Array<{ tag: string; count: number }>;
  streak: { current: number; max: number };
}

export default function StatisticsPage() {
  const { user, isLoading: authLoading } = useCurrentUser();
  const { data: errorAnalysis, error: errorA } = useSWR<ErrorAnalysis>(user ? '/api/statistics/error-analysis' : null, swrFetcher);
  const { data: skillAnalysis, error: errorB } = useSWR<SkillAnalysis>(user ? '/api/statistics/skill-analysis' : null, swrFetcher);
  const { data: performance, error: errorC } = useSWR<Performance>(user ? '/api/statistics/performance' : null, swrFetcher);

  if (authLoading) return <div className="py-10 text-center text-slate-500">加载中...</div>;
  if (!user) return <AuthRequired />;
  if (errorA || errorB || errorC) return <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">统计数据加载失败。</div>;
  if (!errorAnalysis || !skillAnalysis || !performance) return <div className="py-10 text-center text-slate-500">加载中...</div>;

  return (
    <div className="space-y-8">
      <section className="glass-card overflow-hidden">
        <div className="grid gap-6 px-6 py-8 lg:grid-cols-[1.25fr_0.75fr] lg:px-8">
          <div className="space-y-3">
            <span className="inline-flex rounded-full bg-violet-50 px-3 py-1 text-sm font-medium text-violet-700">个人统计</span>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">把错题密度、复习消化和薄弱标签放到一张面板里</h1>
            <p className="max-w-2xl text-sm leading-7 text-slate-600">所有统计只按当前登录用户计算，重点看最近 7/30 天练习强度、复习节奏和最容易出错的方向。</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard label="总提交数" value={String(errorAnalysis.overview.totalSubmissions)} />
            <StatCard label="通过率" value={errorAnalysis.overview.passRate} />
            <StatCard label="待复习" value={String(errorAnalysis.overview.dueReviewCount)} />
            <StatCard label="复习消化率" value={errorAnalysis.overview.reviewCompletionRate} />
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="近 7 天提交" value={String(errorAnalysis.overview.last7Submissions)} />
        <StatCard label="近 7 天错误" value={String(errorAnalysis.overview.last7Errors)} />
        <StatCard label="近 30 天提交" value={String(errorAnalysis.overview.last30Submissions)} />
        <StatCard label="近 30 天完成复习" value={String(errorAnalysis.overview.completedReviewsLast30)} />
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Panel title="高频错因" subtitle="先处理最常重复出现的问题">
          {errorAnalysis.errorTypes.length === 0 ? <EmptyText text="还没有错误记录。" /> : <div className="space-y-4">{errorAnalysis.errorTypes.map((item) => <BarRow key={item.type} label={item.type} value={`${item.count} 次`} percentage={(item.count / Math.max(errorAnalysis.overview.errorCount, 1)) * 100} color="bg-rose-500" />)}</div>}
        </Panel>
        <Panel title="错误难度分布" subtitle="观察自己在哪个难度段最容易失误">
          {errorAnalysis.difficultyErrors.length === 0 ? <EmptyText text="还没有难度维度的错误记录。" /> : <div className="space-y-4">{errorAnalysis.difficultyErrors.map((item) => <BarRow key={item.difficulty} label={difficultyLabel(item.difficulty)} value={`${item.count} 次`} percentage={(item.count / Math.max(errorAnalysis.overview.errorCount, 1)) * 100} color={item.difficulty === 'EASY' ? 'bg-emerald-500' : item.difficulty === 'MEDIUM' ? 'bg-amber-500' : 'bg-rose-500'} />)}</div>}
        </Panel>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Panel title="最薄弱标签" subtitle="掌握率低的标签优先安排专项练习">
          {skillAnalysis.weakestSkills.length === 0 ? <EmptyText text="暂时没有可用的知识点统计。" /> : <div className="grid gap-4">{skillAnalysis.weakestSkills.map((skill) => <SkillCard key={skill.skill} {...skill} />)}</div>}
        </Panel>
        <Panel title="最强标签" subtitle="已经相对稳定的方向">
          {skillAnalysis.strongestSkills.length === 0 ? <EmptyText text="暂时没有可用的知识点统计。" /> : <div className="grid gap-4">{skillAnalysis.strongestSkills.map((skill) => <SkillCard key={skill.skill} {...skill} />)}</div>}
        </Panel>
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <Panel title="近期通过" subtitle="最近成功拿下的题目">
          {performance.recentAccepted.length === 0 ? <EmptyText text="还没有通过记录。" /> : <ul className="space-y-3">{performance.recentAccepted.map((item) => <li key={`${item.problemTitle}-${item.difficulty}`} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"><span className="truncate text-slate-700">{item.problemTitle}</span><span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm">{difficultyLabel(item.difficulty)}</span></li>)}</ul>}
        </Panel>
        <Panel title="需要重点复习" subtitle="近期错误次数较多的题目">
          {performance.needReview.length === 0 ? <EmptyText text="当前没有明显需要重点复习的题目。" /> : <ul className="space-y-3">{performance.needReview.map((item) => <li key={item.problemTitle} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"><span className="truncate text-slate-700">{item.problemTitle}</span><span className="font-semibold text-rose-600">错误 {item.errorCount} 次</span></li>)}</ul>}
        </Panel>
        <Panel title="高频错误标签" subtitle="优先针对性补标签">
          {performance.topErrorTags.length === 0 ? <EmptyText text="当前还没有标签维度的错误统计。" /> : <div className="flex flex-wrap gap-2">{performance.topErrorTags.map((item) => <span key={item.tag} className="rounded-full bg-slate-100 px-3 py-1.5 text-sm text-slate-700">{item.tag} · {item.count}</span>)}</div>}
        </Panel>
      </section>

      <Panel title="学习连续性" subtitle="用来观察最近是否保持了持续练习">
        <div className="grid gap-4 md:grid-cols-2">
          <StatCard label="当前连续" value={`${performance.streak.current} 天`} />
          <StatCard label="最长连续" value={`${performance.streak.max} 天`} />
        </div>
      </Panel>
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return <section className="soft-card p-6"><div className="mb-5"><h2 className="text-lg font-semibold text-slate-900">{title}</h2>{subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}</div>{children}</section>;
}
function StatCard({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-white/70 bg-white/95 p-5 shadow-[0_15px_35px_-22px_rgba(15,23,42,0.35)]"><div className="text-sm font-medium text-slate-500">{label}</div><div className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{value}</div></div>;
}
function BarRow({ label, value, percentage, color }: { label: string; value: string; percentage: number; color: string }) {
  return <div><div className="mb-1 flex items-center justify-between text-sm"><span className="text-slate-700">{label}</span><span className="font-medium text-slate-500">{value}</span></div><div className="h-2 w-full rounded-full bg-slate-200"><div className={`h-2 rounded-full ${color}`} style={{ width: `${percentage}%` }} /></div></div>;
}
function EmptyText({ text }: { text: string }) {
  return <p className="text-sm leading-6 text-slate-500">{text}</p>;
}
function SkillCard({ skill, total, mastered, masteryRate }: { skill: string; total: number; mastered: number; masteryRate: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-sm font-semibold text-slate-900">{skill}</div><div className="mt-2 text-sm text-slate-500">掌握率 {masteryRate} · {mastered}/{total} 题</div><div className="mt-3 h-2 w-full rounded-full bg-slate-200"><div className="h-2 rounded-full bg-primary-500" style={{ width: masteryRate }} /></div></div>;
}
