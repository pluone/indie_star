"use client";

import Giscus from "@giscus/react";

// Renders the real giscus widget (its own UI: reactions + comments, backed by GitHub Discussions
// on pluone/indie_star). mapping="pathname" means giscus keys the discussion off
// document.location.pathname itself — no per-project prop needed here.
export default function GiscusComments() {
  return (
    <Giscus
      repo="pluone/indie_star"
      repoId="R_kgDOThOK5g"
      category="Announcements"
      categoryId="DIC_kwDOThOK5s4DBzP3"
      mapping="pathname"
      strict="0"
      reactionsEnabled="1"
      emitMetadata="0"
      inputPosition="top"
      theme="preferred_color_scheme"
      lang="zh-CN"
    />
  );
}
