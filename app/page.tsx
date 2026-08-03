import type { Metadata } from "next";
import { getSiteData } from "@/lib/site-data";
import HomeClient from "@/components/HomeClient";
import { homeDescription, SITE_NAME, SITE_URL } from "@/lib/site";

export function generateMetadata(): Metadata {
  const { meta } = getSiteData();
  return {
    description: homeDescription(meta.counts.total),
    alternates: { canonical: "/" },
  };
}

export default function HomePage() {
  const data = getSiteData();

  // 让搜索引擎把站点名识别成"独立星选 IndieStar"而不是裸域名。
  // 刻意不含 potentialAction/SearchAction —— 那个字段要求有一个 ?q= 形式的搜索地址,而站内搜索
  // 是纯客户端 state,没有对应 URL。声明一个不存在的搜索端点比不声明更糟。
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    alternateName: "IndieStar",
    url: SITE_URL,
    inLanguage: "zh-CN",
    description: homeDescription(data.meta.counts.total),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <HomeClient main={data.main} game={data.game} programmer={data.programmer} />
    </>
  );
}
