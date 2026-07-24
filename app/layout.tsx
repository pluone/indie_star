import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "独立星选 IndieStar",
  description: "独立星选 IndieStar — 从真实点赞与评论中筛选出的中国独立开发者项目精选。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body
        style={{
          minHeight: "100vh",
          background: "oklch(98% 0.006 90)",
          color: "oklch(20% 0.01 90)",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif",
        }}
      >
        {children}
      </body>
    </html>
  );
}
