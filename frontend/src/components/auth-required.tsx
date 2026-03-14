'use client';

export function AuthRequired() {
  return (
    <section className="soft-card mx-auto max-w-2xl px-6 py-16 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-50 text-3xl">🔐</div>
      <h1 className="mt-5 text-2xl font-semibold text-slate-900">请先登录</h1>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
        当前版本使用 Codeforces 登录。登录后系统会自动同步你的最新错题提交，并将数据隔离到你的个人空间。
      </p>
      <div className="mt-6">
        <a
          href="/api/auth/codeforces/login"
          className="inline-flex rounded-2xl bg-primary-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-primary-200 transition hover:bg-primary-700"
        >
          使用 Codeforces 登录
        </a>
      </div>
    </section>
  );
}
