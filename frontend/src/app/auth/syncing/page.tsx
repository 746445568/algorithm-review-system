'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCurrentUser } from '@/lib/auth';

type SyncResult = {
  importedProblems: number;
  importedSubmissions: number;
  lastSyncedAt: string;
  handle: string;
};

export default function SyncingPage() {
  const router = useRouter();
  const { user, isLoading } = useCurrentUser();
  const [state, setState] = useState<'idle' | 'syncing' | 'success' | 'failed'>('idle');
  const [result, setResult] = useState<SyncResult | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!user || isLoading || state !== 'idle') return;

    let cancelled = false;
    async function run() {
      setState('syncing');
      try {
        const response = await fetch('/api/integrations/codeforces/sync', {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': `syncing-page-${Date.now()}`,
          },
        });

        const data = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(data?.error || '同步失败');
        }

        if (cancelled) return;
        setResult(data);
        setState('success');
        setTimeout(() => {
          router.replace('/');
        }, 1500);
      } catch (error) {
        if (cancelled) return;
        setErrorMessage(error instanceof Error ? error.message : '同步失败');
        setState('failed');
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [isLoading, router, state, user]);

  if (isLoading) return <div className="py-10 text-center text-slate-500">加载中...</div>;

  if (!user) {
    return (
      <section className="soft-card mx-auto max-w-2xl px-6 py-16 text-center">
        <h1 className="text-2xl font-semibold text-slate-900">登录已失效</h1>
        <p className="mt-2 text-sm text-slate-500">请重新使用 Codeforces 登录。</p>
        <div className="mt-6">
          <a href="/api/auth/codeforces/login" className="rounded-2xl bg-primary-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-primary-200 transition hover:bg-primary-700">
            重新登录
          </a>
        </div>
      </section>
    );
  }

  return (
    <section className="soft-card mx-auto max-w-2xl px-6 py-16 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-50 text-3xl">
        {state === 'failed' ? '⚠️' : state === 'success' ? '✅' : '🔄'}
      </div>
      <h1 className="mt-5 text-2xl font-semibold text-slate-900">
        {state === 'failed' ? '同步失败' : state === 'success' ? '同步成功' : '正在同步 Codeforces 错题'}
      </h1>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
        {state === 'failed'
          ? errorMessage
          : state === 'success'
            ? `已为 ${result?.handle || user.handle} 导入 ${result?.importedSubmissions || 0} 条错题提交。`
            : '系统正在自动拉取你的最新非 AC 提交，并导入到个人题库中。'}
      </p>

      {state === 'success' && result ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <StatCard label="新增题目" value={`${result.importedProblems}`} />
          <StatCard label="新增错题提交" value={`${result.importedSubmissions}`} />
          <StatCard label="同步时间" value={new Date(result.lastSyncedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} />
        </div>
      ) : null}

      <div className="mt-6 flex justify-center gap-3">
        {state === 'failed' ? (
          <button
            onClick={() => {
              setState('idle');
              setErrorMessage('');
            }}
            className="rounded-2xl bg-primary-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-primary-200 transition hover:bg-primary-700"
          >
            重试同步
          </button>
        ) : null}
        <Link href="/settings" className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
          查看同步状态
        </Link>
      </div>
    </section>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
      <div className="text-sm font-medium text-slate-500">{label}</div>
      <div className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{value}</div>
    </div>
  );
}
