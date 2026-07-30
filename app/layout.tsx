import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "独立星选 IndieStar",
  description: "独立星选 IndieStar — 从真实点赞与评论中筛选出的中国独立开发者项目精选。",
};

// 移动端按设备宽度渲染而非 980px 模拟宽度;initialScale=1 不禁用缩放(保留可访问性)。
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      {/* 底色 / 文字色 / 字体统一来自 globals.css 的 @theme token */}
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
