import { useState } from "react";
import type {
  TurnBlock,
  ChatMessage,
  ToolCallBlock,
  ThinkingBlock,
  TextBlock,
  TaskBlock,
  TodoBlock,
} from "../hooks/useClaudeAgent.js";

type ToolKind = "read" | "edit" | "delete" | "search" | "execute" | "fetch" | "think" | "other";

const TOOL_KIND_META: Record<ToolKind, { icon: string; color: string; label: string }> = {
  read:    { icon: "\u{1F441}", color: "kind-read",    label: "Read" },
  edit:    { icon: "\u270F",    color: "kind-edit",    label: "Edit" },
  delete:  { icon: "\u{1F5D1}", color: "kind-delete",  label: "Delete" },
  search:  { icon: "\u{1F50D}", color: "kind-search",  label: "Search" },
  execute: { icon: "\u{1F4BB}", color: "kind-execute", label: "Run" },
  think:   { icon: "\u{1F9E0}", color: "kind-think",   label: "Think" },
  fetch:   { icon: "\u{1F310}", color: "kind-fetch",   label: "Fetch" },
  other:   { icon: "\u2699",    color: "kind-other",   label: "Tool" },
};

function inferToolKind(toolName: string): ToolKind {
  const name = toolName.toLowerCase();
  if (name.includes("read") || name.includes("glob") || name.includes("grep") || name.includes("search"))
    return "read";
  if (name.includes("edit") || name.includes("write") || name.includes("notebook"))
    return "edit";
  if (name.includes("bash") || name.includes("exec") || name.includes("terminal"))
    return "execute";
  if (name.includes("delete") || name.includes("remove"))
    return "delete";
  if (name.includes("fetch") || name.includes("web"))
    return "fetch";
  if (name.includes("task") || name.includes("agent"))
    return "think";
  return "other";
}

function toolKindMeta(kind: ToolKind) {
  return TOOL_KIND_META[kind] ?? TOOL_KIND_META.other;
}

function statusIndicator(status: string) {
  switch (status) {
    case "pending":
    case "running":
      return <span className="tc-status-spinner" />;
    case "completed":
      return <span className="tc-status-check">{"\u2713"}</span>;
    case "failed":
      return <span className="tc-status-fail">{"\u2717"}</span>;
    default:
      return null;
  }
}

function getToolCallDisplayTitle(block: ToolCallBlock): string {
  if (block.input && typeof block.input === "object") {
    const input = block.input as Record<string, unknown>;
    if (input.command) return input.command as string;
    if (input.file_path) return input.file_path as string;
    if (input.pattern) return `${block.toolName}: ${input.pattern}`;
    if (input.path) return input.path as string;
  }
  return block.toolName;
}

function ThinkingSummary({ block }: { block: ThinkingBlock }) {
  const preview = block.text.replace(/\n/g, " ").slice(0, 60);
  return (
    <div className="tbi-block-item tbi-thinking-item">
      <div className="tbi-compact-row">
        <span className="tbi-thinking-label">
          {block.isActive ? "Thinking\u2026" : "Thinking"}
        </span>
        {block.duration != null && (
          <span className="tbi-compact-meta">{block.duration}s</span>
        )}
      </div>
      {preview && (
        <div className="tbi-compact-preview">{preview}{block.text.length > 60 ? "\u2026" : ""}</div>
      )}
    </div>
  );
}

function ToolCallSummary({ block }: { block: ToolCallBlock }) {
  const kind = inferToolKind(block.toolName);
  const meta = toolKindMeta(kind);
  const displayTitle = getToolCallDisplayTitle(block);

  return (
    <div className={`tbi-block-item tbi-tc-item ${meta.color}`}>
      <div className="tbi-compact-row">
        {statusIndicator(block.status)}
        <span className="tbi-tc-icon">{meta.icon}</span>
        <span className="tbi-tc-title">{displayTitle}</span>
        {block.duration != null && block.status === "completed" && (
          <span className="tbi-compact-meta">{block.duration}s</span>
        )}
      </div>
    </div>
  );
}

function ToolCallGroupSummary({ groupKind, blocks }: { groupKind: ToolKind; blocks: ToolCallBlock[] }) {
  const [expanded, setExpanded] = useState(false);
  const meta = toolKindMeta(groupKind);

  return (
    <div className={`tbi-block-item tbi-tc-group-item ${meta.color}`}>
      <div className="tbi-compact-row tbi-clickable" onClick={() => setExpanded(!expanded)}>
        <span className="tc-status-check">{"\u2713"}</span>
        <span className="tbi-tc-icon">{meta.icon}</span>
        <span className="tbi-tc-title">{meta.label} {blocks.length} files</span>
        <span className={`chevron tbi-chevron ${expanded ? "expanded" : ""}`}>{"\u25B6"}</span>
      </div>
      {expanded && (
        <div className="tbi-group-children">
          {blocks.map((b) => (
            <ToolCallSummary key={b.id} block={b} />
          ))}
        </div>
      )}
    </div>
  );
}

function TextSummary({ block, isStreaming }: { block: TextBlock; isStreaming: boolean }) {
  const preview = block.text.replace(/\n/g, " ").slice(0, 80);
  return (
    <div className="tbi-block-item tbi-text-item">
      <div className="tbi-compact-row">
        <span className="tbi-text-icon">{"\u{1F4AC}"}</span>
        <span className="tbi-text-preview">
          {preview}{block.text.length > 80 ? "\u2026" : ""}
        </span>
        {isStreaming && <span className="tbi-streaming-dot" />}
        <span className="tbi-compact-meta">{block.text.length} chars</span>
      </div>
    </div>
  );
}

function TaskSummary({ block }: { block: TaskBlock }) {
  const isActive = block.status === "started" || block.status === "in_progress";
  return (
    <div className="tbi-block-item tbi-task-item">
      <div className="tbi-compact-row">
        {isActive ? (
          <span className="tc-status-spinner" />
        ) : block.status === "completed" ? (
          <span className="tc-status-check">{"\u2713"}</span>
        ) : (
          <span className="tc-status-fail">{"\u2717"}</span>
        )}
        <span className="tbi-tc-icon">{"\u{1F9E0}"}</span>
        <span className="tbi-tc-title">{block.description}</span>
        {block.toolUses != null && (
          <span className="tbi-compact-meta">{block.toolUses} tools</span>
        )}
      </div>
    </div>
  );
}

function TodoSummary({ block }: { block: TodoBlock }) {
  const done = block.entries.filter((e) => e.status === "completed").length;
  return (
    <div className="tbi-block-item tbi-plan-item">
      <div className="tbi-compact-row">
        <span className="tbi-plan-icon">{"\u{1F4CB}"}</span>
        <span className="tbi-plan-label">Plan</span>
        <span className="tbi-compact-meta">{done}/{block.entries.length} done</span>
      </div>
    </div>
  );
}

type RenderItem =
  | { kind: "block"; block: TurnBlock }
  | { kind: "group"; groupKind: ToolKind; blocks: ToolCallBlock[] };

function groupBlocks(blocks: TurnBlock[], isLive: boolean): RenderItem[] {
  if (isLive) {
    return blocks.map((block) => ({ kind: "block" as const, block }));
  }

  const items: RenderItem[] = [];
  let i = 0;
  while (i < blocks.length) {
    const block = blocks[i];
    if (block.type === "tool_call" && block.status === "completed") {
      const blockKind = inferToolKind(block.toolName);
      let j = i + 1;
      while (
        j < blocks.length &&
        blocks[j].type === "tool_call" &&
        inferToolKind((blocks[j] as ToolCallBlock).toolName) === blockKind &&
        (blocks[j] as ToolCallBlock).status === "completed"
      ) {
        j++;
      }
      if (j - i >= 3) {
        items.push({
          kind: "group",
          groupKind: blockKind,
          blocks: blocks.slice(i, j) as ToolCallBlock[],
        });
        i = j;
        continue;
      }
    }
    items.push({ kind: "block", block });
    i++;
  }
  return items;
}

function BlockRenderer({ block, isLive, isLastBlock }: { block: TurnBlock; isLive: boolean; isLastBlock: boolean }) {
  switch (block.type) {
    case "thinking":
      return <ThinkingSummary block={block} />;
    case "tool_call":
      return <ToolCallSummary block={block} />;
    case "text":
      return <TextSummary block={block} isStreaming={isLive && isLastBlock} />;
    case "task":
      return <TaskSummary block={block} />;
    case "todo":
      return <TodoSummary block={block} />;
    default:
      return null;
  }
}

function TurnSummaryStats({ blocks }: { blocks: TurnBlock[] }) {
  const toolCalls = blocks.filter((b): b is ToolCallBlock => b.type === "tool_call");
  if (toolCalls.length === 0) return null;

  const counts: Record<string, number> = {};
  for (const tc of toolCalls) {
    const label = toolKindMeta(inferToolKind(tc.toolName)).label.toLowerCase();
    counts[label] = (counts[label] || 0) + 1;
  }

  const parts = Object.entries(counts).map(([label, n]) =>
    n === 1 ? `1 ${label}` : `${n} ${label}s`,
  );
  const totalDuration = toolCalls.reduce((sum, tc) => sum + (tc.duration ?? 0), 0);

  return (
    <div className="tbi-turn-stats">
      {parts.join(", ")}{totalDuration > 0 ? ` \u00B7 ${totalDuration.toFixed(1)}s` : ""}
    </div>
  );
}

const STOP_REASON_LABELS: Record<string, string> = {
  tool_use: "Cancelled",
  max_tokens: "Token limit",
  error_during_execution: "Error",
};

function MessageGroup({
  message,
  index,
}: {
  message: ChatMessage;
  index: number;
}) {
  const [collapsed, setCollapsed] = useState(true);
  const isUser = message.role === "user";
  const blocks = message.blocks ?? [];
  const items = isUser ? [] : groupBlocks(blocks, false);

  return (
    <div className={`tbi-message-group ${isUser ? "tbi-user" : "tbi-assistant"}`}>
      <div className="tbi-message-header" onClick={() => setCollapsed(!collapsed)}>
        <span className={`tbi-role-badge ${isUser ? "tbi-role-user" : "tbi-role-assistant"}`}>
          {isUser ? "U" : "A"}
        </span>
        <span className="tbi-message-label">
          {isUser ? "User Message" : "Assistant Turn"}
        </span>
        <span className="tbi-message-index">#{index + 1}</span>
        {!isUser && blocks.length > 0 && (
          <span className="tbi-block-count">{blocks.length} block{blocks.length !== 1 ? "s" : ""}</span>
        )}
        {message.stopReason && !/^end.?turn$/i.test(message.stopReason) && (
          <span className="tbi-stop-reason">{STOP_REASON_LABELS[message.stopReason] ?? message.stopReason}</span>
        )}
        <span className={`chevron tbi-chevron ${collapsed ? "" : "expanded"}`}>{"\u25B6"}</span>
      </div>
      {!collapsed && (
        <div className="tbi-message-body">
          {isUser ? (
            <div className="tbi-user-text">{message.content}</div>
          ) : items.length > 0 ? (
            <div className="tbi-blocks-list">
              {items.map((item, idx) => {
                if (item.kind === "group") {
                  return (
                    <ToolCallGroupSummary
                      key={`group-${item.blocks[0].id}`}
                      groupKind={item.groupKind}
                      blocks={item.blocks}
                    />
                  );
                }
                return (
                  <BlockRenderer
                    key={item.block.id}
                    block={item.block}
                    isLive={false}
                    isLastBlock={idx === items.length - 1}
                  />
                );
              })}
              <TurnSummaryStats blocks={blocks} />
            </div>
          ) : (
            <div className="tbi-empty-blocks">No blocks</div>
          )}
        </div>
      )}
    </div>
  );
}

export function TurnBlocksInspector({
  messages,
  currentTurnBlocks,
  isAgentTurn,
}: {
  messages: ChatMessage[];
  currentTurnBlocks: TurnBlock[];
  isAgentTurn: boolean;
}) {
  const totalBlocks = messages.reduce(
    (sum, m) => sum + (m.blocks?.length ?? 0),
    0,
  ) + currentTurnBlocks.length;

  const liveItems = groupBlocks(currentTurnBlocks, true);

  return (
    <div className="tbi-container">
      <div className="tbi-header-bar">
        <span className="tbi-header-title">Turn Blocks</span>
        <span className="tbi-header-stats">
          {messages.length} msg{messages.length !== 1 ? "s" : ""}
          {" \u00B7 "}
          {totalBlocks} block{totalBlocks !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="tbi-scroll">
        {messages.length === 0 && !isAgentTurn && (
          <div className="tbi-empty">No turns yet</div>
        )}

        {messages.map((msg, i) => (
          <MessageGroup
            key={msg.id}
            message={msg}
            index={i}
          />
        ))}

        {currentTurnBlocks.length > 0 && (
          <div className="tbi-message-group tbi-assistant tbi-live">
            <div className="tbi-message-header">
              <span className="tbi-role-badge tbi-role-assistant">A</span>
              <span className="tbi-message-label">Live Turn</span>
              {isAgentTurn && <span className="tbi-live-indicator" />}
              <span className="tbi-block-count">
                {currentTurnBlocks.length} block{currentTurnBlocks.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="tbi-message-body">
              <div className="tbi-blocks-list">
                {liveItems.map((item, idx) => {
                  if (item.kind === "group") {
                    return (
                      <ToolCallGroupSummary
                        key={`group-${item.blocks[0].id}`}
                        groupKind={item.groupKind}
                        blocks={item.blocks}
                      />
                    );
                  }
                  return (
                    <BlockRenderer
                      key={item.block.id}
                      block={item.block}
                      isLive={true}
                      isLastBlock={idx === liveItems.length - 1}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
