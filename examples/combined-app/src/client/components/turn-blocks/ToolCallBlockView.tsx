import type { ToolCallBlock, TerminalState } from "../../types.js";
import { CopyButton, toolKindMeta, statusIndicator } from "../shared.js";
import { ExtraDataView } from "../ExtraDataView.js";
import { ToolCallContentView, ToolCallErrorView } from "./shared.js";

function formatToolTitle(title: string): string {
  return title.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ");
}

function getToolCallDisplay(block: ToolCallBlock): {
  displayTitle: string;
  command?: string;
  description?: string;
} {
  const ri = block.rawInput as Record<string, unknown> | undefined;
  if (block.kind === "execute" && ri) {
    const cmd = (ri.command as string) ?? (ri.cmd as string);
    const desc = (ri.description as string) ?? undefined;
    if (cmd) return { displayTitle: cmd, command: cmd, description: desc };
  }
  if (
    block.kind === "edit" ||
    block.kind === "read" ||
    block.kind === "delete"
  ) {
    if (block.locations.length > 0) {
      return { displayTitle: block.locations[0].path };
    }
  }
  return { displayTitle: formatToolTitle(block.title) };
}

export function ToolCallBlockView({
  block,
  expanded,
  onToggle,
  terminals,
}: {
  block: ToolCallBlock;
  expanded: boolean;
  onToggle: () => void;
  terminals: Map<string, TerminalState>;
}) {
  const meta = toolKindMeta(block.kind);
  const isExecute = block.kind === "execute";
  const isFailed = block.status === "failed";
  const display = getToolCallDisplay(block);
  const hasContent = block.content.length > 0 || block.rawOutput != null;

  const autoExpand = (isExecute && hasContent) || isFailed;
  const showBody = autoExpand || expanded;

  const durationLabel =
    block.duration != null && block.status === "completed"
      ? `${block.duration}s`
      : null;

  const contentText = block.content
    .filter((c) => c.type === "content" && c.text)
    .map((c) => c.text!)
    .join("\n");

  if (isExecute) {
    return (
      <div
        className={`turn-block tool-call-block tc-execute ${meta.color} status-${block.status}`}
      >
        <div
          className="tc-header tc-header-exec"
          onClick={hasContent ? onToggle : undefined}
          style={hasContent ? { cursor: "pointer" } : undefined}
        >
          {statusIndicator(block.status)}
          <span className="tc-kind-icon">{meta.icon}</span>
          <span className="tc-title tc-title-cmd">{display.displayTitle}</span>
          {durationLabel && (
            <span className="tc-duration">{durationLabel}</span>
          )}
          {hasContent && !autoExpand && (
            <span
              className={`chevron tc-chevron ${expanded ? "expanded" : ""}`}
            >
              {"\u25B6"}
            </span>
          )}
        </div>
        {showBody && contentText && (
          <div className="tc-body tc-body-terminal">
            <CopyButton text={contentText} />
            <pre className="tc-output-pre">{contentText}</pre>
          </div>
        )}
        {isFailed && <ToolCallErrorView rawOutput={block.rawOutput} />}
        <ExtraDataView extra={block.extra} />
      </div>
    );
  }

  const basename =
    block.locations.length > 0
      ? block.locations[0].path.split("/").pop()
      : null;

  return (
    <div
      className={`turn-block tool-call-block ${meta.color} status-${block.status}`}
    >
      <div
        className="tc-header"
        onClick={hasContent ? onToggle : undefined}
        style={hasContent ? { cursor: "pointer" } : undefined}
      >
        {statusIndicator(block.status)}
        <span className="tc-kind-icon">{meta.icon}</span>
        <span className="tc-title">{display.displayTitle}</span>
        {durationLabel && <span className="tc-duration">{durationLabel}</span>}
        {basename && display.displayTitle !== block.locations[0].path && (
          <span className="tc-locations">
            <span className="tc-location-chip">{basename}</span>
          </span>
        )}
        {hasContent && (
          <span className={`chevron tc-chevron ${expanded ? "expanded" : ""}`}>
            {"\u25B6"}
          </span>
        )}
      </div>
      {showBody && (
        <div className="tc-body">
          <ToolCallContentView
            content={block.content}
            terminals={terminals}
            rawOutput={block.rawOutput}
          />
        </div>
      )}
      {isFailed && <ToolCallErrorView rawOutput={block.rawOutput} />}
      <ExtraDataView extra={block.extra} />
    </div>
  );
}
