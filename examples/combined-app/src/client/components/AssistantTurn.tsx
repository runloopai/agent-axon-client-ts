import { useState } from "react";
import type {
  TurnBlock,
  ToolCallBlock,
  TerminalState,
  ToolKind,
} from "../types.js";
import { toolKindMeta, groupBlocks } from "./shared.js";
import {
  ThinkingBlockView,
  ToolCallBlockView,
  TextBlockView,
  PlanBlockView,
  TaskBlockView,
  ResourceLinkBlockView,
  ImageBlockView,
  AudioBlockView,
  EmbeddedResourceBlockView,
  SystemInitBlockView,
} from "./TurnBlocks.js";

const STOP_REASON_LABELS: Record<string, string> = {
  cancelled: "Cancelled",
  max_tokens: "Token limit reached",
  max_turn_requests: "Turn limit reached",
  refusal: "Refused",
};

function TurnSummaryFooter({ blocks, stopReason }: { blocks: TurnBlock[]; stopReason?: string }) {
  const toolCalls = blocks.filter((b): b is ToolCallBlock => b.type === "tool_call");
  const hasToolCalls = toolCalls.length > 0;
  const hasStopBadge = stopReason && !/^end.?turn$/i.test(stopReason);

  if (!hasToolCalls && !hasStopBadge) return null;

  const counts: Record<string, number> = {};
  for (const tc of toolCalls) {
    const label = toolKindMeta(tc.kind).label.toLowerCase();
    counts[label] = (counts[label] || 0) + 1;
  }

  const parts = Object.entries(counts).map(([label, n]) =>
    n === 1 ? `1 ${label}` : `${n} ${label}s`,
  );

  const totalDuration = toolCalls.reduce((sum, tc) => sum + (tc.duration ?? 0), 0);

  return (
    <div className="turn-summary">
      {hasToolCalls && (
        <span className="turn-summary-text">
          {parts.join(", ")}
          {totalDuration > 0 && ` \u00B7 ${totalDuration.toFixed(1)}s`}
        </span>
      )}
      {hasStopBadge && (
        <span className="stop-reason-badge">{STOP_REASON_LABELS[stopReason!] ?? stopReason}</span>
      )}
    </div>
  );
}

function ToolCallGroupView({
  groupKind, blocks, expandedBlocks, onToggleBlock, terminals,
}: {
  groupKind: ToolKind;
  blocks: ToolCallBlock[];
  expandedBlocks: Set<string>;
  onToggleBlock: (id: string) => void;
  terminals: Map<string, TerminalState>;
}) {
  const [expanded, setExpanded] = useState(false);
  const meta = toolKindMeta(groupKind);
  const label = `${meta.label} ${blocks.length} files`;

  return (
    <div className="turn-block tc-group">
      <div className="tc-group-header" onClick={() => setExpanded(!expanded)}>
        <span className="tc-status-check">{"\u2713"}</span>
        <span className="tc-kind-icon">{meta.icon}</span>
        <span className="tc-group-label">{label}</span>
        <span className={`chevron tc-chevron ${expanded ? "expanded" : ""}`}>{"\u25B6"}</span>
      </div>
      {expanded && (
        <div className="tc-group-body">
          {blocks.map((block) => (
            <ToolCallBlockView
              key={block.id}
              block={block}
              expanded={expandedBlocks.has(block.id)}
              onToggle={() => onToggleBlock(block.id)}
              terminals={terminals}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const EMPTY_TERMINALS = new Map<string, TerminalState>();

export function AssistantTurn({
  blocks, expandedBlocks, onToggleBlock, terminals = EMPTY_TERMINALS, isLive, stopReason,
}: {
  blocks: TurnBlock[];
  expandedBlocks: Set<string>;
  onToggleBlock: (id: string) => void;
  terminals?: Map<string, TerminalState>;
  isLive: boolean;
  stopReason?: string;
}) {
  if (blocks.length === 0) return null;

  const items = groupBlocks(blocks, isLive);

  return (
    <div className="assistant-turn">
      {items.map((item, idx) => {
        if (item.kind === "group") {
          return (
            <ToolCallGroupView
              key={`group-${item.blocks[0].id}`}
              groupKind={item.groupKind}
              blocks={item.blocks}
              expandedBlocks={expandedBlocks}
              onToggleBlock={onToggleBlock}
              terminals={terminals}
            />
          );
        }
        const block = item.block;
        const isLastBlock = idx === items.length - 1;
        switch (block.type) {
          case "thinking":
            return (
              <ThinkingBlockView
                key={block.id}
                block={block}
                expanded={expandedBlocks.has(block.id)}
                onToggle={() => onToggleBlock(block.id)}
              />
            );
          case "tool_call":
            return (
              <ToolCallBlockView
                key={block.id}
                block={block}
                expanded={expandedBlocks.has(block.id)}
                onToggle={() => onToggleBlock(block.id)}
                terminals={terminals}
              />
            );
          case "text":
            return (
              <TextBlockView
                key={block.id}
                block={block}
                showCursor={isLive && isLastBlock}
              />
            );
          case "plan":
            return <PlanBlockView key={block.id} block={block} />;
          case "task":
            return <TaskBlockView key={block.id} block={block} />;
          case "resource_link":
            return <ResourceLinkBlockView key={block.id} block={block} />;
          case "image":
            return <ImageBlockView key={block.id} block={block} />;
          case "audio":
            return <AudioBlockView key={block.id} block={block} />;
          case "resource":
            return <EmbeddedResourceBlockView key={block.id} block={block} />;
          case "system_init":
            return (
              <SystemInitBlockView
                key={block.id}
                block={block}
                expanded={expandedBlocks.has(block.id)}
                onToggle={() => onToggleBlock(block.id)}
              />
            );
          default:
            return null;
        }
      })}
      {!isLive && <TurnSummaryFooter blocks={blocks} stopReason={stopReason} />}
    </div>
  );
}
