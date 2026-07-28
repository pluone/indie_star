"use client";

import { useRouter } from "next/navigation";

// A plain <Link href="/"> always pushes a fresh history entry, which remounts the homepage from
// scratch — losing its scroll position and however many items the user had already loaded via
// infinite scroll. Popping the actual history entry instead (when one exists) reuses Next's cached
// previous render, so the user lands back exactly where they were.
export default function BackToListLink() {
  const router = useRouter();

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push("/");
    }
  }

  return (
    <a
      href="/"
      onClick={handleClick}
      className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 py-1.5 text-[13px] text-ink-2 no-underline transition-colors hover:border-accent-line hover:text-accent"
    >
      ← 返回列表
    </a>
  );
}
