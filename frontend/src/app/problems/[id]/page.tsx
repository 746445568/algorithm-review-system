'use client';

import { FormEvent, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import { AuthRequired } from '@/components/auth-required';
import { apiFetch, swrFetcher } from '@/lib/api';
import { useCurrentUser } from '@/lib/auth';
import { difficultyColor, difficultyLabel, normalizeSourceLabel, parseTags, shortJudgeLabel } from '@/lib/problem';

interface ReviewQueue { id: string; nextReviewDate: string; interval: number; priority: number; }
interface Review { id: string; aiAnalysis: string; improvementSuggestions: string; keyPoints: string; similarProblems?: string | null; }
interface Submission {
  id: string;
  code?: string | null;
  language: string;
  status: string;
  errorMessage?: string | null;
  errorType?: string | null;
  runtime?: number | null;
  memory?: number | null;
  submittedAt?: string | null;
  externalSubmissionId?: string | null;
  createdAt: string;
  review?: Review;
}
interface ProblemDetail {
  id: string;
  title: string;
  description: string;
  difficulty: string;
  tags: string;
  source?: string | null;
  url?: string | null;
  imported?: boolean;
  provider?: string | null;
  contestId?: number | null;
  problemIndex?: string | null;
  externalUrl?: string | null;
  submissions: Submission[];
  reviewQueue: ReviewQueue[];
}

const initialSubmission = { code: '', language: 'TypeScript', status: 'WRONG_ANSWER', errorMessage: '', errorType: '', runtime: '', memory: '' };
const statusOptions = [
  { value: 'WRONG_ANSWER', label: 'WA' },
  { value: 'TIME_LIMIT_EXCEEDED', label: 'TLE' },
  { value: 'MEMORY_LIMIT_EXCEEDED', label: 'MLE' },
  { value: 'RUNTIME_ERROR', label: 'RE' },
  { value: 'COMPILATION_ERROR', label: 'CE' },
  { value: 'ACCEPTED', label: 'AC' },
];

export default function ProblemDetailPage() {
  const params = useParams<{ id: string }>();
  const { user, isLoading: authLoading } = useCurrentUser();
  const [showSubmitForm, setShowSubmitForm] = useState(false);
  const [submissionData, setSubmissionData] = useState(initialSubmission);
  const [generatingReview, setGeneratingReview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const { data: problem, error, mutate, isLoading } = useSWR<ProblemDetail>(user && params?.id ? `/api/problems/${params.id}` : null, swrFetcher);
  const nextReview = problem?.reviewQueue?.[0];
  const latestReview = problem?.submissions.find((submission) => submission.review)?.review;

  const summary = useMemo(() => {
    const submissions = problem?.submissions || [];
    const acceptedCount = submissions.filter((item) => item.status === 'ACCEPTED').length;
    return { total: submissions.length, acceptedCount, errorCount: submissions.length - acceptedCount };
  }, [problem?.submissions]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
      await apiFetch('/api/submissions', {
        method: 'POST',
        body: JSON.stringify({
          problemId: params.id,
          ...submissionData,
          runtime: submissionData.runtime ? Number(submissionData.runtime) : null,
          memory: submissionData.memory ? Number(submissionData.memory) : null,
        }),
      });
      setMessage({ type: 'success', text: '提交记录已保存。现在可以继续生成 AI 复盘。' });
      setShowSubmitForm(false);
      setSubmissionData(initialSubmission);
      await mutate();
    } catch (requestError) {
      setMessage({ type: 'error', text: requestError instanceof Error ? requestError.message : '保存提交失败' });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGenerateReview(submissionId: string) {
    setGeneratingReview(submissionId);
    setMessage(null);
    try {
      await apiFetch('/api/reviews/generate', { method: 'POST', body: JSON.stringify({ submissionId }) });
      setMessage({ type: 'success', text: 'AI 复盘已生成，题目已同步进入复习队列。' });
      await mutate();
    } catch (requestError) {
      setMessage({ type: 'error', text: requestError instanceof Error ? requestError.message : '生成复盘失败' });
    } finally {
      setGeneratingReview(null);
    }
  }

  if (authLoading) return <div className="py-10 text-center text-slate-500">加载中...</div>;
  if (!user) return <AuthRequired />;
  if (error) return <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error.message}</div>;
  if (isLoading || !problem) return <div className="py-10 text-center text-slate-500">加载中...</div>;

  return (
    <div className="space-y-8">
      {message ? <div className={`rounded-2xl border px-4 py-3 text-sm ${message.type === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{message.text}</div> : null}

      <section className="glass-card overflow-hidden">
        <div className="grid gap-8 px-6 py-8 lg:grid-cols-[1.3fr_0.7fr] lg:px-8">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <span className={`rounded-full px-3 py-1 text-sm font-medium ${difficultyColor(problem.difficulty)}`}>{difficultyLabel(problem.difficulty)}</span>
              {problem.imported ? <span className="rounded-full bg-cyan-50 px-3 py-1 text-sm font-medium text-cyan-700">来自 Codeforces</span> : null}
              {parseTags(problem.tags).map((tag) => <span key={tag} className="rounded-full bg-white/90 px-3 py-1 text-sm font-medium text-slate-600 shadow-sm">{tag}</span>)}
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">{problem.title}</h1>
              <div className="mt-2 flex flex-wrap gap-3 text-sm text-slate-500">
                <span>来源：{normalizeSourceLabel(problem.source || problem.provider) || '自定义题目'}</span>
                {problem.imported && problem.contestId && problem.problemIndex ? <span>题号：{problem.contestId} / {problem.problemIndex}</span> : null}
                {(problem.externalUrl || problem.url) ? <a href={problem.externalUrl || problem.url || '#'} target="_blank" rel="noreferrer" className="font-medium text-primary-600 hover:text-primary-800">查看原题 →</a> : null}
              </div>
            </div>
            <div className="prose max-w-none prose-slate"><ReactMarkdown>{problem.description}</ReactMarkdown></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <StatCard label="提交总数" value={String(summary.total)} hint="累计记录的尝试次数" />
            <StatCard label="已通过" value={String(summary.acceptedCount)} hint="当前题目通过次数" />
            <StatCard label="待复盘" value={String(summary.errorCount)} hint="仍需处理的错误尝试" />
            <div className="rounded-2xl border border-amber-100 bg-amber-50 p-5">
              <div className="text-sm font-semibold text-amber-900">下次复习</div>
              <div className="mt-2 text-sm leading-6 text-amber-800">{nextReview ? `${new Date(nextReview.nextReviewDate).toLocaleString('zh-CN')} · 间隔 ${nextReview.interval} 天` : '还没有进入复习队列，先为一次错误提交生成复盘。'}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="soft-card p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">提交记录</h2>
              <p className="mt-1 text-sm text-slate-500">自动导入的 Codeforces 错题不会带源码；你仍可手动补录代码再生成更精确的复盘。</p>
            </div>
            <button onClick={() => setShowSubmitForm((current) => !current)} className="rounded-2xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary-200 transition hover:bg-primary-700">
              {showSubmitForm ? '收起表单' : '新增提交'}
            </button>
          </div>

          {showSubmitForm ? (
            <form onSubmit={handleSubmit} className="mb-6 space-y-5 rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <Field label="代码" required><textarea required rows={14} className="w-full rounded-2xl border px-4 py-3 font-mono text-sm shadow-sm" value={submissionData.code} onChange={(event) => setSubmissionData({ ...submissionData, code: event.target.value })} placeholder="粘贴本次代码" /></Field>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Field label="语言"><select className="w-full rounded-2xl border px-4 py-3 text-sm shadow-sm" value={submissionData.language} onChange={(event) => setSubmissionData({ ...submissionData, language: event.target.value })}><option>TypeScript</option><option>JavaScript</option><option>Python</option><option>Java</option><option>C++</option><option>Go</option></select></Field>
                <Field label="状态"><select className="w-full rounded-2xl border px-4 py-3 text-sm shadow-sm" value={submissionData.status} onChange={(event) => setSubmissionData({ ...submissionData, status: event.target.value })}>{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>
                <Field label="运行时间 (ms)"><input type="number" min="0" className="w-full rounded-2xl border px-4 py-3 text-sm shadow-sm" value={submissionData.runtime} onChange={(event) => setSubmissionData({ ...submissionData, runtime: event.target.value })} /></Field>
                <Field label="内存 (KB)"><input type="number" min="0" className="w-full rounded-2xl border px-4 py-3 text-sm shadow-sm" value={submissionData.memory} onChange={(event) => setSubmissionData({ ...submissionData, memory: event.target.value })} /></Field>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="错误类型"><input type="text" className="w-full rounded-2xl border px-4 py-3 text-sm shadow-sm" value={submissionData.errorType} onChange={(event) => setSubmissionData({ ...submissionData, errorType: event.target.value })} placeholder="边界条件 / 状态转移 / 实现 bug" /></Field>
                <Field label="错误信息"><input type="text" className="w-full rounded-2xl border px-4 py-3 text-sm shadow-sm" value={submissionData.errorMessage} onChange={(event) => setSubmissionData({ ...submissionData, errorMessage: event.target.value })} placeholder="输入错误信息" /></Field>
              </div>
              <button type="submit" disabled={submitting} className="rounded-2xl bg-primary-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-primary-200 transition hover:bg-primary-700 disabled:opacity-50">{submitting ? '保存中...' : '保存提交'}</button>
            </form>
          ) : null}

          <div className="space-y-4">
            {problem.submissions.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 px-6 py-12 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50 text-2xl">🧠</div><h3 className="mt-4 text-lg font-semibold text-slate-900">还没有提交记录</h3><p className="mt-2 text-sm leading-6 text-slate-500">先记录一次错误提交，再让系统帮你生成第一份复盘。</p></div>
            ) : (
              problem.submissions.map((submission) => {
                const keyPoints = parseJsonArray(submission.review?.keyPoints);
                const similarProblems = parseJsonArray(submission.review?.similarProblems);
                return (
                  <article key={submission.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${submission.status === 'ACCEPTED' || submission.status === 'OK' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{shortJudgeLabel(submission.status) || submission.status}</span>
                          <span className="text-sm text-slate-500">{submission.language} · {new Date(submission.submittedAt || submission.createdAt).toLocaleString('zh-CN')}</span>
                          {submission.externalSubmissionId ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">导入提交</span> : null}
                        </div>
                        <div className="flex flex-wrap gap-4 text-sm text-slate-500">
                          {submission.errorType ? <span>错误标签：{shortJudgeLabel(submission.errorType) || submission.errorType}</span> : null}
                          {submission.runtime ? <span>运行时间：{submission.runtime} ms</span> : null}
                          {submission.memory ? <span>内存：{submission.memory} KB</span> : null}
                        </div>
                      </div>
                      <button onClick={() => handleGenerateReview(submission.id)} disabled={generatingReview === submission.id} className="rounded-2xl border border-primary-200 bg-primary-50 px-4 py-2.5 text-sm font-semibold text-primary-700 transition hover:bg-primary-100 disabled:opacity-50">{generatingReview === submission.id ? '生成中...' : submission.review ? '重新生成复盘' : '生成 AI 复盘'}</button>
                    </div>

                    {submission.code ? (
                      <pre className="mt-4 overflow-x-auto rounded-2xl bg-slate-950 p-4 text-sm text-slate-100"><code>{submission.code}</code></pre>
                    ) : (
                      <div className="mt-4 rounded-2xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500">当前提交来自 Codeforces 自动导入，未同步源码。你可以直接生成基于错误结果的复盘，或先手动补录代码再生成。</div>
                    )}

                    {submission.errorMessage ? <div className="mt-4 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">错误信息：{submission.errorMessage}</div> : null}

                    {submission.review ? (
                      <div className="mt-4 grid gap-4 xl:grid-cols-3">
                        <ReviewSection title="错误分析" content={submission.review.aiAnalysis} />
                        <ReviewSection title="改进建议" content={submission.review.improvementSuggestions} />
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <h3 className="text-sm font-semibold text-slate-900">关键学习点</h3>
                          <div className="mt-3 flex flex-wrap gap-2">{keyPoints.length === 0 ? <span className="text-sm text-slate-500">暂时没有关键学习点。</span> : keyPoints.map((point) => <span key={point} className="rounded-full bg-white px-3 py-1 text-sm text-slate-700 shadow-sm">{point}</span>)}</div>
                          {similarProblems.length > 0 ? <div className="mt-4"><h3 className="text-sm font-semibold text-slate-900">相似题建议</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">{similarProblems.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })
            )}
          </div>
        </div>

        <aside className="space-y-6">
          <section className="soft-card p-6">
            <h2 className="text-lg font-semibold text-slate-900">最新复盘摘要</h2>
            {latestReview ? (
              <div className="mt-4 space-y-4 text-sm leading-6 text-slate-700">
                <ReviewBlock title="错误分析" content={latestReview.aiAnalysis} />
                <ReviewBlock title="改进建议" content={latestReview.improvementSuggestions} />
                <div><div className="text-sm font-semibold text-slate-900">关键学习点</div><div className="mt-2 flex flex-wrap gap-2">{parseJsonArray(latestReview.keyPoints).map((point) => <span key={point} className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">{point}</span>)}</div></div>
              </div>
            ) : <p className="mt-4 text-sm leading-6 text-slate-500">当前还没有任何 AI 复盘。先保存一次错误提交，再生成复盘。</p>}
          </section>
          <section className="soft-card p-6">
            <h2 className="text-lg font-semibold text-slate-900">复习状态</h2>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              <div className="flex items-center justify-between"><span>是否在队列中</span><span className="font-semibold text-slate-900">{nextReview ? '是' : '否'}</span></div>
              <div className="flex items-center justify-between"><span>下次复习</span><span className="font-semibold text-slate-900">{nextReview ? new Date(nextReview.nextReviewDate).toLocaleDateString('zh-CN') : '未安排'}</span></div>
              <div className="flex items-center justify-between"><span>当前间隔</span><span className="font-semibold text-slate-900">{nextReview ? `${nextReview.interval} 天` : '--'}</span></div>
              <div className="flex items-center justify-between"><span>优先级</span><span className="font-semibold text-slate-900">{nextReview ? nextReview.priority : '--'}</span></div>
            </div>
          </section>
        </aside>
      </section>
    </div>
  );
}

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return <label className="block"><div className="mb-2 flex items-center gap-2"><span className="text-sm font-semibold text-slate-800">{label}</span>{required ? <span className="text-xs font-medium text-rose-500">*</span> : null}</div>{children}{hint ? <p className="mt-2 text-xs text-slate-500">{hint}</p> : null}</label>;
}
function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) { return <div className="rounded-2xl border border-white/70 bg-white/95 p-5 shadow-[0_15px_35px_-22px_rgba(15,23,42,0.35)]"><div className="text-sm font-medium text-slate-500">{label}</div><div className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{value}</div><div className="mt-1 text-xs text-slate-400">{hint}</div></div>; }
function ReviewSection({ title, content }: { title: string; content: string }) { return <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><h3 className="text-sm font-semibold text-slate-900">{title}</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{content}</p></div>; }
function ReviewBlock({ title, content }: { title: string; content: string }) { return <div><div className="text-sm font-semibold text-slate-900">{title}</div><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{content}</p></div>; }
function parseJsonArray(value?: string | null) { if (!value) return []; try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.map((item) => String(item)) : []; } catch { return []; } }
