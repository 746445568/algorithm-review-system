'use client';

import { useState } from 'react';
import { AuthRequired } from '@/components/auth-required';
import { apiFetch } from '@/lib/api';
import { useCurrentUser } from '@/lib/auth';

interface SyncResponse {
  status: 'success';
  importedProblems: number;
  importedSubmissions: number;
  fullSync?: boolean;
}

export default function SettingsPage() {
  const { user, codeforces, isLoading, mutate } = useCurrentUser();
  const [syncingMode, setSyncingMode] = useState<'incremental' | 'full' | null>(null);
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  async function handleSync(mode: 'incremental' | 'full') {
    setSyncingMode(mode);
    setMessage(null);

    try {
      const response = await apiFetch<SyncResponse>(
        mode === 'full' ? '/api/integrations/codeforces/resync' : '/api/integrations/codeforces/sync',
        {
          method: 'POST',
          headers: {
            'Idempotency-Key': `${mode}-${Date.now()}`,
          },
        },
      );
      setMessage({
        type: 'success',
        text: `${mode === 'full' ? '全量重同步' : '增量同步'}完成：新增 ${response.importedProblems} 道题，${response.importedSubmissions} 条错题提交。`,
      });
      await mutate();
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : '同步失败',
      });
    } finally {
      setSyncingMode(null);
    }
  }

  if (isLoading) return <div className="py-10 text-center text-slate-500">加载中...</div>;
  if (!user) return <AuthRequired />;

  return (
    <div className="space-y-8">
      <section className="glass-card overflow-hidden">
        <div className="grid gap-6 px-6 py-8 lg:grid-cols-[1.1fr_0.9fr] lg:px-8">
          <div className="space-y-3">
            <span className="inline-flex rounded-full bg-cyan-50 px-3 py-1 text-sm font-medium text-cyan-700">
              账号与同步
            </span>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Codeforces 绑定与同步状态</h1>
            <p className="max-w-2xl text-sm leading-7 text-slate-600">
              这里查看绑定状态、最近同步结果、导入数量和失败原因。你可以做一次增量同步，也可以在需要时手动触发全量重同步。
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard label="当前用户" value={user.handle} />
            <StatCard label="Codeforces" value={codeforces?.handle || '--'} />
            <StatCard label="Rating" value={codeforces?.rating ? String(codeforces.rating) : '--'} />
            <StatCard label="同步状态" value={codeforces?.syncing ? '同步中' : codeforces?.lastSyncStatus === 'failed' ? '失败' : '正常'} />
          </div>
        </div>
      </section>

      {message ? (
        <div className={`rounded-2xl border px-4 py-3 text-sm ${message.type === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
          {message.text}
        </div>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div className="soft-card p-6">
          <h2 className="text-lg font-semibold text-slate-900">最近同步结果</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <StatCard label="最近尝试" value={formatDateTime(codeforces?.lastSyncAttemptAt)} />
            <StatCard label="最近成功" value={formatDateTime(codeforces?.lastSuccessfulSyncAt)} />
            <StatCard label="上次导入题目" value={String(codeforces?.lastImportedProblems || 0)} />
            <StatCard label="上次导入提交" value={String(codeforces?.lastImportedSubmissions || 0)} />
            <StatCard label="同步耗时" value={codeforces?.lastSyncDurationMs ? `${(codeforces.lastSyncDurationMs / 1000).toFixed(1)}s` : '--'} />
            <StatCard label="待复习任务" value={String(codeforces?.dueReviewCount || 0)} />
          </div>
          {codeforces?.lastSyncError ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              最近失败原因：{codeforces.lastSyncError}
            </div>
          ) : null}
        </div>

        <div className="soft-card p-6">
          <h2 className="text-lg font-semibold text-slate-900">同步控制</h2>
          <p className="mt-1 text-sm text-slate-500">默认建议先用增量同步；只有当你怀疑本地数据有缺口时，再执行全量重同步。</p>
          <div className="mt-6 flex flex-col gap-3">
            <button
              onClick={() => handleSync('incremental')}
              disabled={Boolean(syncingMode)}
              className="rounded-2xl bg-primary-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-primary-200 transition hover:bg-primary-700 disabled:opacity-50"
            >
              {syncingMode === 'incremental' ? '增量同步中...' : '立即增量同步'}
            </button>
            <button
              onClick={() => handleSync('full')}
              disabled={Boolean(syncingMode)}
              className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              {syncingMode === 'full' ? '全量同步中...' : '执行全量重同步'}
            </button>
          </div>
          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
            <p>增量同步：只拉取上次同步之后的新提交。</p>
            <p className="mt-2">全量重同步：重新遍历最近一批 Codeforces 提交，并按外部提交 ID 去重，不会重复写入旧记录。</p>
          </div>
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/70 bg-white/95 p-5 shadow-[0_15px_35px_-22px_rgba(15,23,42,0.35)]">
      <div className="text-sm font-medium text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{value}</div>
    </div>
  );
}

function formatDateTime(value?: string | null) {
  if (!value) return '--';
  return new Date(value).toLocaleString('zh-CN');
}
