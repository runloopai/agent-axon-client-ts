import { useState, useRef, useLayoutEffect } from "react";
import type { ThinkingBlock } from "../../types.js";
import { MarkdownContent } from "../shared.js";
import { ExtraDataView } from "../ExtraDataView.js";

const THINKING_COLLAPSED_HEIGHT = 60;

export function ThinkingBlockView({
  block,
  expanded,
  onToggle,
}: {
  block: ThinkingBlock;
  expanded: boolean;
  onToggle: () => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const el = contentRef.current;
    if (el) setOverflows(el.scrollHeight > THINKING_COLLAPSED_HEIGHT);
  }, [block.text]);

  if (!block.text && !block.isActive) return null;

  const isCollapsedOverflow = overflows && !expanded;

  return (
    <div className="turn-block thinking-block">
      <div className="thinking-header-inline">
        <span className="thinking-label">
          Thinking{block.isActive ? "\u2026" : ""}
        </span>
        {block.duration != null && (
          <span className="thinking-duration">{block.duration}s</span>
        )}
      </div>
      {block.text && (
        <MarkdownContent
          ref={contentRef}
          text={block.text}
          className={`thinking-content${expanded ? " thinking-content-expanded" : ""}${isCollapsedOverflow ? " thinking-content-overflow" : ""}`}
          style={
            !expanded ? { maxHeight: THINKING_COLLAPSED_HEIGHT } : undefined
          }
        />
      )}
      {overflows && !block.isActive && (
        <button className="thinking-toggle" onClick={onToggle}>
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
      <ExtraDataView extra={block.extra} />
    </div>
  );
}
