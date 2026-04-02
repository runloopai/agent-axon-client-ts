import { useState, useCallback } from "react";
import type { ToolKind, ToolCallStatus, PlanEntryStatus } from "../hooks/useNodeAgent.js";

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
