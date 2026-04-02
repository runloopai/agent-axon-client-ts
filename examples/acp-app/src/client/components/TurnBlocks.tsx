import Markdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import * as Diff from "diff";
import type {
  ThinkingBlock,
  ToolCallBlock,
  TextBlock,
  PlanBlock,
  PlanEntry,
  ResourceLinkBlock,
  TerminalState,
  ContentItem,
} from "../hooks/useNodeAgent.js";
import { CopyButton, toolKindMeta, statusIndicator, planStatusIcon } from "./shared.js";

// ── Thinking ────────────────────────────────────────────────

export function ThinkingBlockView({
  block, expanded, onToggle,
}: {
  block: ThinkingBlock;
  expanded: boolean;
  onToggle: () => void;
}) {
  const showBody = block.isActive || expanded;

  return (
    <div className="turn-block thinking-block">
      <div className="thinking-header" onClick={onToggle}>
        <span className={`chevron ${showBody ? "expanded" : ""}`}>{"\u25B6"}</span>
        <span className="thinking-label">
          Thinking{block.isActive ? "\u2026" : ""}
        </span>
        {block.duration != null && (
          <span className="thinking-duration">{block.duration}s</span>
        )}
      </div>
      {showBody && block.text && (
        <div className="thinking-body">{block.text}</div>
      )}
    </div>
  );
}

// ── Tool call ───────────────────────────────────────────────

function getToolCallDisplay(block: ToolCallBlock): { displayTitle: string; command?: string; description?: string } {
  const ri = block.rawInput as Record<string, unknown> | undefined;
  if (block.kind === "execute" && ri) {
    const cmd = (ri.command as string) ?? (ri.cmd as string);
    const desc = (ri.description as string) ?? undefined;
    if (cmd) return { displayTitle: cmd, command: cmd, description: desc };
  }
  if (block.kind === "edit" || block.kind === "read" || block.kind === "delete") {
    if (block.locations.length > 0) {
      return { displayTitle: block.locations[0].path };
    }
  }
  return { displayTitle: block.title };
}

export function ToolCallBlockView({
  block, expanded, onToggle, terminals,
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

  const durationLabel = block.duration != null && block.status === "completed"
    ? `${block.duration}s`
    : null;

  const contentText = block.content
    .filter((c) => c.type === "content" && c.text)
    .map((c) => c.text!)
    .join("\n");

  if (isExecute) {
    return (
      <div className={`turn-block tool-call-block tc-execute ${meta.color} status-${block.status}`}>
        <div className="tc-header tc-header-exec" onClick={hasContent ? onToggle : undefined} style={hasContent ? { cursor: "pointer" } : undefined}>
          {statusIndicator(block.status)}
          <span className="tc-kind-icon">{meta.icon}</span>
          <span className="tc-title tc-title-cmd">{display.displayTitle}</span>
          {durationLabel && <span className="tc-duration">{durationLabel}</span>}
          {hasContent && !autoExpand && (
            <span className={`chevron tc-chevron ${expanded ? "expanded" : ""}`}>{"\u25B6"}</span>
          )}
        </div>
        {showBody && contentText && (
          <div className="tc-body tc-body-terminal">
            <CopyButton text={contentText} />
            <pre className="tc-output-pre">{contentText}</pre>
          </div>
        )}
        {isFailed && <ToolCallErrorView rawOutput={block.rawOutput} />}
      </div>
    );
  }

  const basename = block.locations.length > 0
    ? block.locations[0].path.split("/").pop()
    : null;

  return (
    <div className={`turn-block tool-call-block ${meta.color} status-${block.status}`}>
      <div className="tc-header" onClick={hasContent ? onToggle : undefined} style={hasContent ? { cursor: "pointer" } : undefined}>
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
          <span className={`chevron tc-chevron ${expanded ? "expanded" : ""}`}>{"\u25B6"}</span>
        )}
      </div>
      {showBody && (
        <div className="tc-body">
          <ToolCallContentView content={block.content} terminals={terminals} rawOutput={block.rawOutput} />
        </div>
      )}
      {isFailed && <ToolCallErrorView rawOutput={block.rawOutput} />}
    </div>
  );
}

function ToolCallErrorView({ rawOutput }: { rawOutput?: unknown }) {
  if (rawOutput == null) return null;
  let msg: string;
  if (typeof rawOutput === "string") {
    msg = rawOutput;
  } else if (typeof rawOutput === "object") {
    const obj = rawOutput as Record<string, unknown>;
    msg = (obj.message as string) ?? (obj.error as string) ?? JSON.stringify(rawOutput, null, 2);
  } else {
    msg = String(rawOutput);
  }
  return (
    <div className="tc-error-body">
      <pre className="tc-error-pre">{msg}</pre>
    </div>
  );
}

function ToolCallContentView({
  content, terminals, rawOutput,
}: {
  content: ContentItem[];
  terminals: Map<string, TerminalState>;
  rawOutput?: unknown;
}) {
  if (content.length === 0 && rawOutput != null) {
    const text = typeof rawOutput === "string"
      ? rawOutput
      : JSON.stringify(rawOutput, null, 2);
    return (
      <div className="tc-content-wrapper">
        <CopyButton text={text} />
        <pre className="tc-output-pre">{text}</pre>
      </div>
    );
  }

  return (
    <>
      {content.map((item, i) => {
        if (item.type === "diff" && item.diff) {
          return <UnifiedDiffView key={i} diff={item.diff} />;
        }
        if (item.type === "terminal" && item.terminal) {
          const term = terminals.get(item.terminal.terminalId);
          const output = term?.output || "(no output yet)";
          return (
            <div key={i} className="tc-terminal-view">
              <div className="tc-terminal-id">Terminal: {item.terminal.terminalId}</div>
              <CopyButton text={output} />
              <pre className="tc-output-pre">{output}</pre>
            </div>
          );
        }
        if (item.text) {
          return (
            <div key={i} className="tc-content-wrapper">
              <CopyButton text={item.text} />
              <pre className="tc-output-pre">{item.text}</pre>
            </div>
          );
        }
        return null;
      })}
    </>
  );
}

function UnifiedDiffView({ diff }: { diff: { path: string; oldText?: string | null; newText: string } }) {
  const oldStr = diff.oldText ?? "";
  const newStr = diff.newText;

  const changes = Diff.structuredPatch(diff.path, diff.path, oldStr, newStr, "", "", { context: 3 });

  return (
    <div className="tc-diff-view">
      <div className="tc-diff-path">
        {diff.path}
        <CopyButton text={newStr} />
      </div>
      <div className="diff-lines">
        {changes.hunks.map((hunk, hi) => (
          <div key={hi} className="diff-hunk">
            <div className="diff-line diff-hunk-header">
              @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
            </div>
            {hunk.lines.map((line, li) => {
              const prefix = line[0];
              const cls =
                prefix === "+" ? "diff-add" :
                prefix === "-" ? "diff-remove" :
                "diff-context";
              return (
                <div key={li} className={`diff-line ${cls}`}>
                  <span className="diff-line-prefix">{prefix}</span>
                  <span className="diff-line-content">{line.slice(1)}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Text / Markdown ─────────────────────────────────────────

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

export function TextBlockView({ block, showCursor }: { block: TextBlock; showCursor: boolean }) {
  return (
    <div className="turn-block text-block">
      <Markdown components={markdownComponents}>{block.text}</Markdown>
      {showCursor && <span className="streaming-cursor" />}
    </div>
  );
}

// ── Resource link ───────────────────────────────────────────

export function ResourceLinkBlockView({ block }: { block: ResourceLinkBlock }) {
  const label = block.title ?? block.name ?? block.uri;
  return (
    <div className="turn-block resource-link-block">
      <a href={block.uri} target="_blank" rel="noopener noreferrer" className="resource-link">
        <span className="resource-link-icon">{"\u{1F517}"}</span>
        <span className="resource-link-label">{label}</span>
        {block.name && block.title && block.name !== block.title && (
          <span className="resource-link-name">{block.name}</span>
        )}
      </a>
    </div>
  );
}

// ── Plan ────────────────────────────────────────────────────

export function PlanBlockView({ block }: { block: PlanBlock }) {
  return (
    <div className="turn-block plan-block">
      <div className="plan-header">Plan</div>
      <div className="plan-entries">
        {block.entries.map((entry, i) => (
          <PlanEntryView key={i} entry={entry} />
        ))}
      </div>
    </div>
  );
}

function PlanEntryView({ entry }: { entry: PlanEntry }) {
  return (
    <div className={`plan-entry plan-entry-${entry.status}`}>
      {planStatusIcon(entry.status)}
      <span className="plan-entry-text">{entry.content}</span>
      <span className={`plan-priority plan-priority-${entry.priority}`}>{entry.priority}</span>
    </div>
  );
}
