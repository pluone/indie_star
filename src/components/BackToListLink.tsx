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
      style={{ cursor: "pointer", fontSize: 14, color: "oklch(45% 0.01 90)", textDecoration: "none" }}
    >
      ← 返回列表
    </a>
  );
}
