import { useState, useCallback, forwardRef } from "react";
import Markdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import type { ToolKind, ToolCallStatus, PlanEntryStatus, TurnBlock, ToolCallBlock } from "../types.js";

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [text]);
  return (
    <button className={`copy-btn ${copied ? "copied" : ""}`} onClick={handleCopy} title="Copy">
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export const TOOL_KIND_META: Record<ToolKind, { icon: string; color: string; label: string }> = {
  read:        { icon: "\u{1F441}", color: "kind-read",    label: "Read" },
  edit:        { icon: "\u270F",    color: "kind-edit",    label: "Edit" },
  delete:      { icon: "\u{1F5D1}", color: "kind-delete",  label: "Delete" },
  move:        { icon: "\u2794",    color: "kind-move",    label: "Move" },
  search:      { icon: "\u{1F50D}", color: "kind-search",  label: "Search" },
  execute:     { icon: "\u{1F4BB}", color: "kind-execute", label: "Run" },
  think:       { icon: "\u{1F9E0}", color: "kind-think",   label: "Think" },
  fetch:       { icon: "\u{1F310}", color: "kind-fetch",   label: "Fetch" },
  switch_mode: { icon: "\u{1F504}", color: "kind-mode",    label: "Mode" },
  other:       { icon: "\u2699",    color: "kind-other",   label: "Tool" },
};

export function toolKindMeta(kind: ToolKind) {
  return TOOL_KIND_META[kind] ?? TOOL_KIND_META.other;
}

export function statusIndicator(status: ToolCallStatus) {
  switch (status) {
    case "pending":
    case "in_progress":
      return <span className="tc-status-spinner" />;
    case "completed":
      return <span className="tc-status-check">{"\u2713"}</span>;
    case "failed":
      return <span className="tc-status-fail">{"\u2717"}</span>;
  }
}

export function planStatusIcon(status: PlanEntryStatus): React.ReactNode {
  switch (status) {
    case "in_progress": return <span className="plan-status-spinner" />;
    case "completed": return <span className="plan-status-check">{"\u2713"}</span>;
    default: return <span className="plan-status-pending">{"\u25CB"}</span>;
  }
}

const markdownComponents: Record<string, React.ComponentType<Record<string, unknown>>> = {
  code({ className, children, ...props }: Record<string, unknown>) {
    const match = /language-(\w+)/.exec((className as string) || "");
    const codeStr = String(children).replace(/\n$/, "");
    if (match) {
      return (
        <div className="code-block-wrapper">
          <CopyButton text={codeStr} />
          <SyntaxHighlighter
            style={vscDarkPlus}
            language={match[1]}
            customStyle={{ margin: 0, borderRadius: "6px", fontSize: "12px" }}
          >
            {codeStr}
          </SyntaxHighlighter>
        </div>
      );
    }
    return <code className={className as string} {...props}>{children as React.ReactNode}</code>;
  },
};

export function PayloadTree({ data, depth = 0 }: { data: unknown; depth?: number }) {
  if (data === null || data === undefined) {
    return <span className="axon-val axon-val-null">null</span>;
  }
  if (typeof data === "boolean") {
    return <span className="axon-val axon-val-bool">{String(data)}</span>;
  }
  if (typeof data === "number") {
    return <span className="axon-val axon-val-num">{data}</span>;
  }
  if (typeof data === "string") {
    if (data.length > 120) {
      return <span className="axon-val axon-val-str" title={data}>"{data.slice(0, 120)}\u2026"</span>;
    }
    return <span className="axon-val axon-val-str">"{data}"</span>;
  }
  if (Array.isArray(data)) {
    if (data.length === 0) return <span className="axon-val axon-val-null">[]</span>;
    if (depth > 3) return <span className="axon-val axon-val-null">[{data.length} items]</span>;
    return (
      <div className="axon-tree-array">
        {data.map((item, i) => (
          <div key={i} className="axon-tree-row">
            <span className="axon-tree-idx">[{i}]</span>
            <PayloadTree data={item} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }
  if (typeof data === "object") {
    const entries = Object.entries(data as Record<string, unknown>);
    if (entries.length === 0) return <span className="axon-val axon-val-null">{"{}"}</span>;
    if (depth > 3) return <span className="axon-val axon-val-null">{`{${entries.length} keys}`}</span>;
    return (
      <div className="axon-tree-obj">
        {entries.map(([key, val]) => {
          const isComplex = val !== null && typeof val === "object";
          return (
            <div key={key} className={`axon-tree-row ${isComplex ? "axon-tree-row-block" : ""}`}>
              <span className="axon-tree-key">{key}:</span>
              <PayloadTree data={val} depth={depth + 1} />
            </div>
          );
        })}
      </div>
    );
  }
  return <span className="axon-val">{String(data)}</span>;
}

export function formatTime(timestampMs: number): string {
  const d = new Date(timestampMs);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function originLabel(origin: string): string {
  switch (origin) {
    case "USER_EVENT": return "USER";
    case "AGENT_EVENT": return "AGENT";
    case "SYSTEM_EVENT": return "SYSTEM";
    case "EXTERNAL_EVENT": return "EXTERNAL";
    default: return origin;
  }
}

export function originBadgeClass(origin: string): string {
  switch (origin) {
    case "USER_EVENT": return "axon-badge-user";
    case "AGENT_EVENT": return "axon-badge-agent";
    case "SYSTEM_EVENT": return "axon-badge-system";
    default: return "axon-badge-default";
  }
}

export type RenderItem =
  | { kind: "block"; block: TurnBlock; index: number }
  | { kind: "group"; groupKind: ToolKind; blocks: ToolCallBlock[] };

export function groupBlocks(turnBlocks: TurnBlock[], isLive: boolean): RenderItem[] {
  if (isLive) {
    return turnBlocks.map((block, index) => ({ kind: "block" as const, block, index }));
  }

  const items: RenderItem[] = [];
  let i = 0;
  while (i < turnBlocks.length) {
    const block = turnBlocks[i];
    if (block.type === "tool_call" && block.status === "completed") {
      let j = i + 1;
      while (
        j < turnBlocks.length &&
        turnBlocks[j].type === "tool_call" &&
        (turnBlocks[j] as ToolCallBlock).kind === block.kind &&
        (turnBlocks[j] as ToolCallBlock).status === "completed"
      ) {
        j++;
      }
      if (j - i >= 3) {
        items.push({
          kind: "group",
          groupKind: block.kind,
          blocks: turnBlocks.slice(i, j) as ToolCallBlock[],
        });
        i = j;
        continue;
      }
    }
    items.push({ kind: "block", block, index: i });
    i++;
  }
  return items;
}

export const MarkdownContent = forwardRef<
  HTMLDivElement,
  { text: string; className?: string; style?: React.CSSProperties }
>(function MarkdownContent({ text, className, style }, ref) {
  return (
    <div ref={ref} className={className} style={style}>
      <Markdown components={markdownComponents}>{text}</Markdown>
    </div>
  );
});
