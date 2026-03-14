'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { AuthRequired } from '@/components/auth-required';
import { useCurrentUser } from '@/lib/auth';
import { difficultyLabel } from '@/lib/problem';

interface WeeklyReport {
  weekStart: string;
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

export default function ReportsPage() {
  const { user, isLoading: authLoading } = useCurrentUser();
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [weekStart, setWeekStart] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [copied, setCopied] = useState(false);

  async function generateReport() {
    setLoading(true);
    setErrorMessage('');
    try {
      const response = await fetch('/api/reports/weekly-report', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(weekStart ? { weekStart } : {}) });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || '生成周报失败');
      }
      setReport((await response.json()) as WeeklyReport);
    } catch (requestError) {
      setErrorMessage(requestError instanceof Error ? requestError.message : '生成周报失败');
    } finally {
      setLoading(false);
    }
  }

  async function copyShareText() {
    if (!report?.shareText) return;
    await navigator.clipboard.writeText(report.shareText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function downloadReport() {
    if (!report?.markdown) return;
    const blob = new Blob([report.markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `周报_${report.weekStart}.md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (authLoading) return <div className="py-10 text-center text-slate-500">加载中...</div>;
  if (!user) return <AuthRequired />;

  return (
    <div className="space-y-8">
      <section className="glass-card overflow-hidden"><div className="grid gap-6 px-6 py-8 lg:grid-cols-[1.2fr_0.8fr] lg:px-8"><div className="space-y-3"><span className="inline-flex rounded-full bg-cyan-50 px-3 py-1 text-sm font-medium text-cyan-700">周报生成</span><h1 className="text-3xl font-bold tracking-tight text-slate-900">把这周的练习、错误和复习进展整理成一份可分享周报</h1><p className="max-w-2xl text-sm leading-7 text-slate-600">周报只统计当前登录用户。导入题和手动题会一起统计，并额外输出一段适合直接发给朋友的分享摘要。</p></div><div className="rounded-2xl border border-cyan-100 bg-cyan-50/70 p-5"><div className="text-sm font-semibold text-cyan-900">使用方式</div><ul className="mt-3 space-y-2 text-sm leading-6 text-cyan-800"><li>不选日期时，默认按本周一作为统计起点。</li><li>生成后的 Markdown 可直接下载。</li><li>分享摘要适合直接发群或贴朋友圈文案。</li></ul></div></div></section>
      <section className="soft-card p-6"><div className="flex flex-col gap-4 md:flex-row md:items-end"><label className="block flex-1"><div className="mb-2 text-sm font-semibold text-slate-800">周起始日期</div><input type="date" className="w-full rounded-2xl border px-4 py-3 text-sm shadow-sm" value={weekStart} onChange={(event) => setWeekStart(event.target.value)} /><p className="mt-2 text-xs text-slate-500">可选。不填写时默认使用本周一。</p></label><button onClick={generateReport} disabled={loading} className="rounded-2xl bg-primary-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-primary-200 transition hover:bg-primary-700 disabled:opacity-50">{loading ? '生成中...' : '生成周报'}</button></div></section>
      {errorMessage ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{errorMessage}</div> : null}
      {report ? <><section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6"><StatCard label="新增题目" value={`${report.summary.totalProblems} 题`} /><StatCard label="自动导入" value={`${report.summary.importedProblems} 题`} /><StatCard label="提交次数" value={`${report.summary.totalSubmissions} 次`} /><StatCard label="通过率" value={report.summary.passRate} /><StatCard label="活跃天数" value={`${report.summary.activeDays} 天`} /><StatCard label="完成复习" value={`${report.summary.completedReviews} 次`} /></section><section className="soft-card p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold text-slate-900">分享摘要</h2><p className="mt-1 text-sm text-slate-500">一键复制发给朋友即可。</p></div><button onClick={copyShareText} className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">{copied ? '已复制' : '复制摘要'}</button></div><div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-700">{report.shareText}</div></section><section className="grid gap-6 xl:grid-cols-2"><Panel title="本周亮点">{report.highlights.length === 0 ? <p className="text-sm text-slate-500">这周还没有足够多的数据可以总结亮点。</p> : <ul className="space-y-3">{report.highlights.map((item) => <li key={item} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">{item}</li>)}</ul>}</Panel><Panel title="改进建议"><ul className="space-y-3">{report.suggestions.map((item) => <li key={item} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">{item}</li>)}</ul></Panel></section><section className="grid gap-6 xl:grid-cols-3"><Panel title="错误类型">{report.errorAnalysis.topErrorTypes.length === 0 ? <p className="text-sm text-slate-500">这周没有统计到明显的错误类型。</p> : <ul className="space-y-3">{report.errorAnalysis.topErrorTypes.map((item) => <li key={item.type} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"><span className="text-slate-700">{item.type}</span><span className="font-semibold text-slate-900">{item.count} 次</span></li>)}</ul>}</Panel><Panel title="高频标签">{report.errorAnalysis.topTags.length === 0 ? <p className="text-sm text-slate-500">这周没有统计到明显的标签聚集。</p> : <div className="flex flex-wrap gap-2">{report.errorAnalysis.topTags.map((item) => <span key={item.tag} className="rounded-full bg-slate-100 px-3 py-1.5 text-sm text-slate-700">{item.tag} · {item.count}</span>)}</div>}</Panel><Panel title="难度分布">{report.errorAnalysis.difficultyDistribution.length === 0 ? <p className="text-sm text-slate-500">这周没有统计到难度维度的数据。</p> : <ul className="space-y-3">{report.errorAnalysis.difficultyDistribution.map((item) => <li key={item.difficulty} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"><span className="text-slate-700">{difficultyLabel(item.difficulty)}</span><span className="font-semibold text-slate-900">{item.count} 次</span></li>)}</ul>}</Panel></section><section className="soft-card p-6"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold text-slate-900">Markdown 周报</h2><p className="mt-1 text-sm text-slate-500">可以直接下载、分享或粘贴到群里。</p></div><button onClick={downloadReport} className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">下载 Markdown</button></div><div className="prose max-w-none rounded-2xl border border-slate-200 bg-slate-50 p-5 prose-slate"><ReactMarkdown>{report.markdown}</ReactMarkdown></div></section></> : null}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) { return <section className="soft-card p-6"><h2 className="text-lg font-semibold text-slate-900">{title}</h2><div className="mt-4">{children}</div></section>; }
function StatCard({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-white/70 bg-white/95 p-5 shadow-[0_15px_35px_-22px_rgba(15,23,42,0.35)]"><div className="text-sm font-medium text-slate-500">{label}</div><div className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{value}</div></div>; }
