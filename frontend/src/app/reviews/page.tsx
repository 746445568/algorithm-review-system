'use client';

import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { AuthRequired } from '@/components/auth-required';
import { apiFetch, swrFetcher } from '@/lib/api';
import { useCurrentUser } from '@/lib/auth';
import { difficultyColor, difficultyLabel, shortJudgeLabel } from '@/lib/problem';

interface Review {
  id: string;
  aiAnalysis: string;
  improvementSuggestions: string;
  keyPoints: string;
  updatedAt: string;
  submission: {
    status: string;
    problem: {
      id: string;
      title: string;
      difficulty: string;
      reviewQueue: Array<{ id: string; nextReviewDate: string; interval: number; priority: number }>;
    };
  };
}

export default function ReviewsPage() {
  const { user, isLoading: authLoading } = useCurrentUser();
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const { data: reviews, error, isLoading, mutate } = useSWR<Review[]>(user ? '/api/reviews?dueOnly=true' : null, swrFetcher);

  async function handleComplete(reviewId: string) {
    setSubmittingId(reviewId);
    setFeedback('');
    try {
      await apiFetch(`/api/reviews/${reviewId}/complete`, { method: 'POST' });
      setFeedback('本次复习已完成，系统已经自动推迟下次复习时间。');
      await mutate();
    } catch (requestError) {
      setFeedback(requestError instanceof Error ? requestError.message : '完成复习失败');
    } finally {
      setSubmittingId(null);
    }
  }

  if (authLoading) return <div className="py-10 text-center text-slate-500">加载中...</div>;
  if (!user) return <AuthRequired />;
  if (error) return <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error.message}</div>;
  if (isLoading || !reviews) return <div className="py-10 text-center text-slate-500">加载中...</div>;

  return (
    <div className="space-y-8">
      <section className="glass-card overflow-hidden">
        <div className="grid gap-6 px-6 py-8 lg:grid-cols-[1.3fr_0.7fr] lg:px-8">
          <div className="space-y-3">
            <span className="inline-flex rounded-full bg-amber-50 px-3 py-1 text-sm font-medium text-amber-700">今日复习面板</span>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">只处理到期内容，把复盘真正转化成掌握</h1>
            <p className="max-w-2xl text-sm leading-7 text-slate-600">这里展示已经到期的复习任务。每完成一次复习，系统会自动推迟下一次复习时间。</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard label="待复习" value={String(reviews.length)} hint="当前已到期任务" />
            <StatCard label="最近更新" value={reviews.length === 0 ? '--' : new Date(reviews[0].updatedAt).toLocaleDateString('zh-CN')} hint="最近一次复盘更新时间" />
          </div>
        </div>
      </section>

      {feedback ? <div className={`rounded-2xl border px-4 py-3 text-sm ${feedback.includes('失败') ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{feedback}</div> : null}

      {reviews.length === 0 ? (
        <section className="soft-card px-6 py-16 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-3xl">✅</div>
          <h2 className="mt-5 text-xl font-semibold text-slate-900">今天没有到期任务</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">当前复习队列已经清空。你可以继续录题、补全新的错误提交，或者回到题库主动查看历史复盘。</p>
          <div className="mt-6 flex justify-center gap-3">
            <Link href="/" className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">返回题库</Link>
            <Link href="/settings" className="rounded-2xl bg-primary-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-primary-200 transition hover:bg-primary-700">去同步状态</Link>
          </div>
        </section>
      ) : (
        <div className="grid gap-5">
          {reviews.map((review) => {
            const queue = review.submission.problem.reviewQueue[0];
            const keyPoints = parseJsonArray(review.keyPoints);
            return (
              <article key={review.id} className="soft-card p-6">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${difficultyColor(review.submission.problem.difficulty)}`}>{difficultyLabel(review.submission.problem.difficulty)}</span>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{shortJudgeLabel(review.submission.status) || review.submission.status}</span>
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold text-slate-900"><Link href={`/problems/${review.submission.problem.id}`} className="transition hover:text-primary-700">{review.submission.problem.title}</Link></h2>
                      <p className="mt-1 text-sm text-slate-500">最近更新：{new Date(review.updatedAt).toLocaleString('zh-CN')}{queue ? ` · 下次复习：${new Date(queue.nextReviewDate).toLocaleString('zh-CN')}` : ''}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Link href={`/problems/${review.submission.problem.id}`} className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">查看题目</Link>
                    <button onClick={() => handleComplete(review.id)} disabled={submittingId === review.id} className="rounded-2xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary-200 transition hover:bg-primary-700 disabled:opacity-50">{submittingId === review.id ? '提交中...' : '完成复习'}</button>
                  </div>
                </div>
                <div className="mt-5 grid gap-4 xl:grid-cols-3">
                  <Section title="错误分析" content={review.aiAnalysis} />
                  <Section title="改进建议" content={review.improvementSuggestions} />
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><h3 className="text-sm font-semibold text-slate-900">关键学习点</h3><div className="mt-3 flex flex-wrap gap-2">{keyPoints.length === 0 ? <span className="text-sm text-slate-500">暂时没有提取出关键点。</span> : keyPoints.map((point) => <span key={point} className="rounded-full bg-white px-3 py-1 text-sm text-slate-700 shadow-sm">{point}</span>)}</div></div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Section({ title, content }: { title: string; content: string }) { return <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><h3 className="text-sm font-semibold text-slate-900">{title}</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{content}</p></div>; }
function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) { return <div className="rounded-2xl border border-white/70 bg-white/95 p-5 shadow-[0_15px_35px_-22px_rgba(15,23,42,0.35)]"><div className="text-sm font-medium text-slate-500">{label}</div><div className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{value}</div><div className="mt-1 text-xs text-slate-400">{hint}</div></div>; }
function parseJsonArray(value: string) { try { const parsed = JSON.parse(value || '[]'); return Array.isArray(parsed) ? parsed.map((item) => String(item)) : []; } catch { return []; } }
