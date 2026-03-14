'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthRequired } from '@/components/auth-required';
import { apiFetch } from '@/lib/api';
import { useCurrentUser } from '@/lib/auth';

const difficultyOptions = [
  { value: 'EASY', label: '简单' },
  { value: 'MEDIUM', label: '中等' },
  { value: 'HARD', label: '困难' },
];

export default function NewProblemPage() {
  const router = useRouter();
  const { user, isLoading } = useCurrentUser();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    source: '',
    url: '',
    difficulty: 'MEDIUM',
    tags: '',
  });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setErrorMessage('');

    try {
      await apiFetch('/api/problems', {
        method: 'POST',
        body: JSON.stringify(formData),
      });
      router.push('/');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '创建题目失败');
    } finally {
      setLoading(false);
    }
  }

  if (isLoading) return <div className="py-10 text-center text-slate-500">加载中...</div>;
  if (!user) return <AuthRequired />;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <section className="glass-card overflow-hidden">
        <div className="grid gap-8 px-6 py-8 lg:grid-cols-[1.25fr_0.75fr] lg:px-8">
          <div className="space-y-3">
            <span className="inline-flex rounded-full bg-primary-50 px-3 py-1 text-sm font-medium text-primary-700">手动录题</span>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">补充自定义题目或非 Codeforces 来源题目</h1>
            <p className="max-w-2xl text-sm leading-7 text-slate-600">
              Codeforces 错题会自动导入；这里用于补充你想手动维护的题目、专题题或其它平台题目。
            </p>
          </div>
          <div className="rounded-2xl border border-primary-100 bg-primary-50/70 p-5">
            <div className="text-sm font-semibold text-primary-900">建议</div>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-primary-800">
              <li>标题尽量保留原题名，便于后续统一检索。</li>
              <li>题面描述建议包含约束、样例和你自己的初始思路。</li>
              <li>标签建议控制在 3-6 个，避免失去检索价值。</li>
            </ul>
          </div>
        </div>
      </section>

      {errorMessage ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div> : null}

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="soft-card p-6">
          <div className="mb-5">
            <h2 className="text-lg font-semibold text-slate-900">基础信息</h2>
            <p className="mt-1 text-sm text-slate-500">这些字段会用于列表展示、筛选和后续 AI 复盘上下文。</p>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <Field label="题目标题" required>
              <input type="text" required className="w-full rounded-2xl border px-4 py-3 text-sm shadow-sm" value={formData.title} onChange={(event) => setFormData({ ...formData, title: event.target.value })} placeholder="输入题目标题" />
            </Field>
            <Field label="难度" required>
              <select className="w-full rounded-2xl border px-4 py-3 text-sm shadow-sm" value={formData.difficulty} onChange={(event) => setFormData({ ...formData, difficulty: event.target.value })}>
                {difficultyOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </Field>
            <Field label="题目来源">
              <input type="text" className="w-full rounded-2xl border px-4 py-3 text-sm shadow-sm" value={formData.source} onChange={(event) => setFormData({ ...formData, source: event.target.value })} placeholder="LeetCode / AtCoder / 专题训练" />
            </Field>
            <Field label="题目链接">
              <input type="url" className="w-full rounded-2xl border px-4 py-3 text-sm shadow-sm" value={formData.url} onChange={(event) => setFormData({ ...formData, url: event.target.value })} placeholder="https://" />
            </Field>
          </div>
        </section>

        <section className="soft-card p-6">
          <div className="mb-5">
            <h2 className="text-lg font-semibold text-slate-900">题面与标签</h2>
            <p className="mt-1 text-sm text-slate-500">题面支持 Markdown。你可以直接粘贴原题摘要、边界条件和个人备注。</p>
          </div>

          <div className="space-y-5">
            <Field label="题面描述" required>
              <textarea required rows={12} className="w-full rounded-2xl border px-4 py-3 text-sm shadow-sm" value={formData.description} onChange={(event) => setFormData({ ...formData, description: event.target.value })} placeholder="输入题面、约束、样例和你的思路" />
            </Field>
            <Field label="标签" hint="用英文逗号分隔，例如：动态规划, 双指针, 图论">
              <input type="text" className="w-full rounded-2xl border px-4 py-3 text-sm shadow-sm" value={formData.tags} onChange={(event) => setFormData({ ...formData, tags: event.target.value })} placeholder="输入题目标签" />
            </Field>
          </div>
        </section>

        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={loading} className="rounded-2xl bg-primary-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-primary-200 transition hover:bg-primary-700 disabled:opacity-50">
            {loading ? '保存中...' : '保存题目'}
          </button>
          <button type="button" onClick={() => router.back()} className="rounded-2xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
            返回上一页
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm font-semibold text-slate-800">{label}</span>
        {required ? <span className="text-xs font-medium text-rose-500">*</span> : null}
      </div>
      {children}
      {hint ? <p className="mt-2 text-xs text-slate-500">{hint}</p> : null}
    </label>
  );
}
