import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AppHeader } from '@/components/app-header';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: '算法错题复盘系统',
  description: '使用 Codeforces 登录，自动同步错题并生成复盘',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className={inter.className}>
        <AppHeader />
        <main className="page-shell">{children}</main>
      </body>
    </html>
  );
}
