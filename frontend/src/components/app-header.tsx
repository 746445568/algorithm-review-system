'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useCurrentUser } from '@/lib/auth';

const navItems = [
  { href: '/', label: '我的题库' },
  { href: '/reviews', label: '今日复习' },
  { href: '/statistics', label: '统计分析' },
  { href: '/reports', label: '周报' },
  { href: '/settings', label: '同步状态' },
];

export function AppHeader() {
  const pathname = usePathname();
  const { user, codeforces, isLoading, mutate } = useCurrentUser();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  async function handleLogout() {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    await mutate(null, { revalidate: false });
    window.location.href = '/';
  }

  return (
    <header className="sticky top-0 z-20 border-b border-white/70 bg-white/75 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 via-primary-600 to-cyan-500 text-lg text-white shadow-lg shadow-primary-200">
            📚
          </div>
          <div>
            <div className="text-xl font-bold tracking-tight text-slate-900">算法错题复盘系统</div>
            <div className="text-xs text-slate-500">Codeforces 登录 · 自动同步错题</div>
          </div>
        </Link>

        <div className="flex items-center gap-3">
          {user ? (
            <>
              {/* 桌面端导航 */}
              <nav className="hidden items-center gap-2 md:flex">
                {navItems.map((item) => {
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                        active ? 'bg-primary-50 text-primary-700' : 'text-slate-600 hover:bg-primary-50 hover:text-primary-700'
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </nav>

              {/* 桌面端用户信息 */}
              <div className="hidden items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm sm:flex">
                <div className="text-right">
                  <div className="text-sm font-semibold text-slate-900">{user.handle}</div>
                  <div className="text-xs text-slate-500">
                    {codeforces?.syncing
                      ? '同步中'
                      : codeforces?.lastSyncStatus === 'failed'
                        ? '最近同步失败'
                        : codeforces?.lastSyncedAt
                          ? `最近同步 ${new Date(codeforces.lastSyncedAt).toLocaleDateString('zh-CN')}`
                          : '尚未同步'}
                  </div>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    codeforces?.syncing
                      ? 'bg-amber-50 text-amber-700'
                      : codeforces?.lastSyncStatus === 'failed'
                        ? 'bg-rose-50 text-rose-700'
                        : 'bg-emerald-50 text-emerald-700'
                  }`}
                >
                  {codeforces?.syncing ? '同步中' : codeforces?.lastSyncStatus === 'failed' ? '需处理' : '正常'}
                </span>
                {codeforces?.avatarUrl ? (
                  <img src={codeforces.avatarUrl} alt={user.handle} className="h-9 w-9 rounded-full border border-slate-200 object-cover" />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-700">
                    {user.handle.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <button
                  onClick={handleLogout}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  退出
                </button>
              </div>

              {/* 移动端汉堡菜单按钮 */}
              <button
                onClick={() => setMobileMenuOpen((v) => !v)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition hover:bg-slate-50 md:hidden"
                aria-label="打开菜单"
              >
                {mobileMenuOpen ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                )}
              </button>
            </>
          ) : isLoading ? (
            <div className="text-sm text-slate-500">加载中...</div>
          ) : (
            <a
              href="/api/auth/codeforces/login"
              className="rounded-2xl bg-primary-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-primary-200 transition hover:bg-primary-700"
            >
              使用 Codeforces 登录
            </a>
          )}
        </div>
      </div>

      {/* 移动端下拉菜单 */}
      {user && mobileMenuOpen && (
        <div className="border-t border-slate-100 bg-white/95 px-4 pb-4 md:hidden">
          <nav className="flex flex-col gap-1 pt-3">
            {navItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`rounded-xl px-4 py-3 text-sm font-medium transition ${
                    active ? 'bg-primary-50 text-primary-700' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-3 flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
            <div className="flex items-center gap-3">
              {codeforces?.avatarUrl ? (
                <img src={codeforces.avatarUrl} alt={user.handle} className="h-8 w-8 rounded-full border border-slate-200 object-cover" />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-700">
                  {user.handle.slice(0, 1).toUpperCase()}
                </div>
              )}
              <span className="text-sm font-semibold text-slate-900">{user.handle}</span>
            </div>
            <button
              onClick={handleLogout}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              退出
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
