import type { Metadata, Viewport } from "next";
import { SITE_DESC, SITE_NAME, SITE_URL } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  // 有了它,各页的 alternates.canonical 才能写相对路径。
  metadataBase: new URL(SITE_URL),
  // 模板让子页面只写自己那部分:about 写"关于"、详情页写项目名,渲染结果与之前逐页手写时一致。
  title: { default: SITE_NAME, template: `%s · ${SITE_NAME}` },
  description: SITE_DESC,
};

// canonical 刻意不在这里声明。metadata 是继承的,layout 里写死一个 canonical 会让所有没显式
// 覆盖它的页面都指向同一个地址 —— 逐页声明才安全。

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
