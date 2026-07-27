"use client";

import { useEffect } from "react";
import Giscus from "@giscus/react";
import { slugFromPathname, writeGiscusStat } from "@/lib/giscus-stats";

// Renders the real giscus widget (its own UI: reactions + comments, backed by GitHub Discussions
// on pluone/indie_star). mapping="pathname" means giscus keys the discussion off
// document.location.pathname itself — no per-project prop needed here.
//
// emitMetadata="1" makes giscus postMessage the discussion's live reaction/comment counts back to
// this page on load and after every reaction/comment — we capture that into localStorage so the
// homepage can show the acting user's own like/comment instantly, without waiting on the /api/stats
// edge cache (see src/lib/giscus-stats.ts).
export default function GiscusComments() {
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== "https://giscus.app") return;
      const discussion = event.data?.giscus?.discussion;
      if (!discussion) return;
      const slug = slugFromPathname(window.location.pathname);
      if (!slug) return;
      // Reaction keys are GraphQL enum names (THUMBS_UP, HEART, ...), not emoji shortcodes — same
      // convention as the reactionGroups query in scripts/lib/fetch-giscus-counts.mjs.
      writeGiscusStat(slug, {
        likes: discussion.reactions?.THUMBS_UP?.count ?? 0,
        comments: discussion.totalCommentCount ?? 0,
      });
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <Giscus
      repo="pluone/indie_star"
      repoId="R_kgDOThOK5g"
      category="Announcements"
      categoryId="DIC_kwDOThOK5s4DBzP3"
      mapping="pathname"
      strict="0"
      reactionsEnabled="1"
      emitMetadata="1"
      inputPosition="top"
      theme="preferred_color_scheme"
      lang="zh-CN"
    />
  );
}
