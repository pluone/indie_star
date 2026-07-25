import type { ReactNode } from "react";

// Matches the narrow subset of inline markdown that shows up in project intros: links, bold+italic,
// bold, italic, and inline code. Order matters — bold+italic must be tried before bold/italic alone.
const TOKEN_RE = /\[([^\]]+)\]\(([^)]+)\)|\*\*\*([^*]+)\*\*\*|\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/g;

export function renderInlineMarkdown(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;

  TOKEN_RE.lastIndex = 0;
  while ((match = TOKEN_RE.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));

    const [, linkLabel, linkUrl, boldItalic, bold, italic, code] = match;
    if (linkLabel !== undefined) {
      nodes.push(
        <a
          key={key++}
          href={linkUrl}
          target="_blank"
          rel="noreferrer"
          style={{ color: "oklch(58% 0.15 45)" }}
        >
          {linkLabel}
        </a>,
      );
    } else if (boldItalic !== undefined) {
      nodes.push(
        <strong key={key++}>
          <em>{boldItalic}</em>
        </strong>,
      );
    } else if (bold !== undefined) {
      nodes.push(<strong key={key++}>{bold}</strong>);
    } else if (italic !== undefined) {
      nodes.push(<em key={key++}>{italic}</em>);
    } else if (code !== undefined) {
      nodes.push(
        <code
          key={key++}
          style={{
            background: "oklch(95% 0.01 90)",
            padding: "1px 6px",
            borderRadius: 4,
            fontSize: "0.9em",
            fontFamily: "ui-monospace,'SFMono-Regular',monospace",
          }}
        >
          {code}
        </code>,
      );
    }

    lastIndex = TOKEN_RE.lastIndex;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}
