import { useState, useRef, useLayoutEffect } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import * as Diff from "diff";
import type {
  ThinkingBlock,
  ToolCallBlock,
  TextBlock,
  PlanBlock,
  PlanEntry,
  TaskBlock,
  ResourceLinkBlock,
  ImageBlock,
  AudioBlock,
  EmbeddedResourceBlock,
  SystemInitBlock,
  TerminalState,
  ContentItem,
} from "../types.js";
import { CopyButton, MarkdownContent, toolKindMeta, statusIndicator, planStatusIcon } from "./shared.js";
import { ExtraDataView } from "./ExtraDataView.js";

const THINKING_COLLAPSED_HEIGHT = 60;

export function ThinkingBlockView({
  block, expanded, onToggle,
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
          style={!expanded ? { maxHeight: THINKING_COLLAPSED_HEIGHT } : undefined}
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
        <ExtraDataView extra={block.extra} />
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
      <ExtraDataView extra={block.extra} />
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

export function TextBlockView({ block, showCursor }: { block: TextBlock; showCursor: boolean }) {
  return (
    <div className="turn-block text-block">
      <MarkdownContent text={block.text} />
      {showCursor && <span className="streaming-cursor" />}
      <ExtraDataView extra={block.extra} />
    </div>
  );
}

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
      <ExtraDataView extra={block.extra} />
    </div>
  );
}

export function ImageBlockView({ block }: { block: ImageBlock }) {
  const src = `data:${block.mimeType};base64,${block.data}`;
  return (
    <div className="turn-block image-block">
      <img src={src} alt="" className="image-block-img" />
      {block.uri && (
        <a href={block.uri} target="_blank" rel="noopener noreferrer" className="image-block-link">
          Open original
        </a>
      )}
      <ExtraDataView extra={block.extra} />
    </div>
  );
}

export function AudioBlockView({ block }: { block: AudioBlock }) {
  const src = `data:${block.mimeType};base64,${block.data}`;
  return (
    <div className="turn-block audio-block">
      <audio controls src={src} className="audio-block-player" />
      <ExtraDataView extra={block.extra} />
    </div>
  );
}

const MIME_TO_LANG: Record<string, string> = {
  "application/json": "json",
  "application/javascript": "javascript",
  "text/javascript": "javascript",
  "text/typescript": "typescript",
  "text/html": "html",
  "text/css": "css",
  "text/markdown": "markdown",
  "application/xml": "xml",
  "text/xml": "xml",
  "application/yaml": "yaml",
  "text/yaml": "yaml",
  "text/x-python": "python",
  "text/x-rust": "rust",
  "text/x-go": "go",
  "text/x-java": "java",
  "text/x-c": "c",
  "text/x-cpp": "cpp",
  "text/x-shell": "bash",
};

export function EmbeddedResourceBlockView({ block }: { block: EmbeddedResourceBlock }) {
  const basename = block.uri.split("/").pop() ?? block.uri;

  if (block.text != null) {
    const lang = block.mimeType ? MIME_TO_LANG[block.mimeType] : undefined;
    return (
      <div className="turn-block resource-block">
        <div className="resource-block-header">
          <span className="resource-block-icon">{"\u{1F4C4}"}</span>
          <span className="resource-block-name">{basename}</span>
          <CopyButton text={block.text} />
        </div>
        {lang ? (
          <SyntaxHighlighter
            style={vscDarkPlus}
            language={lang}
            customStyle={{ margin: 0, borderRadius: "0 0 6px 6px", fontSize: "12px" }}
          >
            {block.text}
          </SyntaxHighlighter>
        ) : (
          <pre className="resource-block-pre">{block.text}</pre>
        )}
        <ExtraDataView extra={block.extra} />
      </div>
    );
  }

  if (block.blob != null) {
    const href = `data:${block.mimeType ?? "application/octet-stream"};base64,${block.blob}`;
    return (
      <div className="turn-block resource-block">
        <div className="resource-block-header">
          <span className="resource-block-icon">{"\u{1F4BE}"}</span>
          <span className="resource-block-name">{basename}</span>
        </div>
        <a href={href} download={basename} className="resource-block-download">
          Download {basename}
        </a>
        <ExtraDataView extra={block.extra} />
      </div>
    );
  }

  return (
    <div className="turn-block resource-block">
      <div className="resource-block-header">
        <span className="resource-block-icon">{"\u{1F4C4}"}</span>
        <span className="resource-block-name">{basename}</span>
      </div>
      <ExtraDataView extra={block.extra} />
    </div>
  );
}

export function PlanBlockView({ block }: { block: PlanBlock }) {
  return (
    <div className="turn-block plan-block">
      <div className="plan-header">Plan</div>
      <div className="plan-entries">
        {block.entries.map((entry, i) => (
          <PlanEntryView key={i} entry={entry} />
        ))}
      </div>
      <ExtraDataView extra={block.extra} />
    </div>
  );
}

function PlanEntryView({ entry }: { entry: PlanEntry }) {
  return (
    <div className={`plan-entry plan-entry-${entry.status}`}>
      {planStatusIcon(entry.status)}
      <span className="plan-entry-text">{entry.content}</span>
      {entry.priority && (
        <span className={`plan-priority plan-priority-${entry.priority}`}>{entry.priority}</span>
      )}
    </div>
  );
}

export function TaskBlockView({ block }: { block: TaskBlock }) {
  const isActive = block.status === "started" || block.status === "in_progress";
  return (
    <div className="turn-block task-block">
      <div className="task-header">
        {isActive ? (
          <span className="tc-status-spinner" />
        ) : block.status === "completed" ? (
          <span className="tc-status-check">{"\u2713"}</span>
        ) : (
          <span className="tc-status-fail">{"\u2717"}</span>
        )}
        <span className="task-description">{block.description}</span>
        {block.toolUses != null && (
          <span className="task-meta">{block.toolUses} tools</span>
        )}
      </div>
      {block.summary && (
        <div className="task-summary">{block.summary}</div>
      )}
      <ExtraDataView extra={block.extra} />
    </div>
  );
}

function InitSection({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="init-section">
      <div className="init-section-header" onClick={() => setOpen(!open)}>
        <span className={`chevron init-chevron ${open ? "expanded" : ""}`}>{"\u25B6"}</span>
        <span className="init-section-label">{label}</span>
      </div>
      {open && <div className="init-section-body">{children}</div>}
    </div>
  );
}

function InitTagList({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="init-tag-list">
      {items.map((item, i) => (
        <span key={i} className="init-tag">{item}</span>
      ))}
    </div>
  );
}

export function SystemInitBlockView({ block, expanded, onToggle }: { block: SystemInitBlock; expanded: boolean; onToggle: () => void }) {
  const ext = block.extensions;
  const title = [block.agentName, block.agentVersion ? `v${block.agentVersion}` : null].filter(Boolean).join(" ");

  return (
    <div className="turn-block system-init-block">
      <div className="init-header" onClick={onToggle} style={{ cursor: "pointer" }}>
        <span className="init-icon">{"\u26A1"}</span>
        <span className="init-title">{title || "Agent Initialized"}</span>
        {block.model && <span className="init-model-badge">{block.model}</span>}
        <span className={`chevron init-chevron ${expanded ? "expanded" : ""}`}>{"\u25B6"}</span>
      </div>
      {expanded && (
        <div className="init-body">
          {block.commands.length > 0 && (
            <InitSection label={`Commands (${block.commands.length})`}>
              <InitTagList items={block.commands} />
            </InitSection>
          )}

          {ext?.protocol === "claude" && (
            <>
              {ext.tools.length > 0 && (
                <InitSection label={`Tools (${ext.tools.length})`}>
                  <InitTagList items={ext.tools} />
                </InitSection>
              )}
              {ext.mcpServers.length > 0 && (
                <InitSection label={`MCP Servers (${ext.mcpServers.length})`}>
                  <div className="init-mcp-list">
                    {ext.mcpServers.map((s, i) => (
                      <div key={i} className="init-mcp-item">
                        <span className={`init-mcp-status init-mcp-${s.status}`}>{"\u25CF"}</span>
                        <span>{s.name}</span>
                      </div>
                    ))}
                  </div>
                </InitSection>
              )}
              <div className="init-kv">
                <span className="init-kv-label">Permission Mode</span>
                <span className="init-kv-value">{ext.permissionMode}</span>
              </div>
            </>
          )}

          {ext?.protocol === "acp" && (
            <>
              {ext.modes.length > 0 && (
                <InitSection label={`Modes (${ext.modes.length})`}>
                  <InitTagList items={ext.modes.map((m) => m.name ?? m.modeId)} />
                </InitSection>
              )}
              {ext.models.length > 0 && (
                <InitSection label={`Models (${ext.models.length})`}>
                  <InitTagList items={ext.models.map((m) => m.name ?? m.modelId)} />
                </InitSection>
              )}
              {ext.configOptions.length > 0 && (
                <InitSection label={`Config Options (${ext.configOptions.length})`}>
                  <div className="init-config-list">
                    {ext.configOptions.map((opt) => (
                      <div key={opt.id} className="init-kv">
                        <span className="init-kv-label">{opt.name}</span>
                        <span className="init-kv-value">{opt.currentValue ?? "-"}</span>
                      </div>
                    ))}
                  </div>
                </InitSection>
              )}
              {ext.agentCapabilities && (
                <InitSection label="Capabilities">
                  <pre className="init-capabilities-pre">{JSON.stringify(ext.agentCapabilities, null, 2)}</pre>
                </InitSection>
              )}
              {ext.protocolVersion != null && (
                <div className="init-kv">
                  <span className="init-kv-label">Protocol Version</span>
                  <span className="init-kv-value">{ext.protocolVersion}</span>
                </div>
              )}
            </>
          )}

          <ExtraDataView extra={block.extra} />
        </div>
      )}
    </div>
  );
}
