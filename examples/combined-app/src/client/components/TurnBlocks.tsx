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
import {
  CopyButton,
  MarkdownContent,
  toolKindMeta,
  statusIndicator,
  planStatusIcon,
} from "./shared.js";
import { ExtraDataView } from "./ExtraDataView.js";

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

function ToolCallErrorView({ rawOutput }: { rawOutput?: unknown }) {
  if (rawOutput == null) return null;
  let msg: string;
  if (typeof rawOutput === "string") {
    msg = rawOutput;
  } else if (typeof rawOutput === "object") {
    const obj = rawOutput as Record<string, unknown>;
    msg =
      (obj.message as string) ??
      (obj.error as string) ??
      JSON.stringify(rawOutput, null, 2);
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
  content,
  terminals,
  rawOutput,
}: {
  content: ContentItem[];
  terminals: Map<string, TerminalState>;
  rawOutput?: unknown;
}) {
  if (content.length === 0 && rawOutput != null) {
    const text =
      typeof rawOutput === "string"
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
              <div className="tc-terminal-id">
                Terminal: {item.terminal.terminalId}
              </div>
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

function UnifiedDiffView({
  diff,
}: {
  diff: { path: string; oldText?: string | null; newText: string };
}) {
  const oldStr = diff.oldText ?? "";
  const newStr = diff.newText;

  const changes = Diff.structuredPatch(
    diff.path,
    diff.path,
    oldStr,
    newStr,
    "",
    "",
    { context: 3 },
  );

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
              @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},
              {hunk.newLines} @@
            </div>
            {hunk.lines.map((line, li) => {
              const prefix = line[0];
              const cls =
                prefix === "+"
                  ? "diff-add"
                  : prefix === "-"
                    ? "diff-remove"
                    : "diff-context";
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

export function TextBlockView({
  block,
  showCursor,
}: {
  block: TextBlock;
  showCursor: boolean;
}) {
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
      <a
        href={block.uri}
        target="_blank"
        rel="noopener noreferrer"
        className="resource-link"
      >
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
        <a
          href={block.uri}
          target="_blank"
          rel="noopener noreferrer"
          className="image-block-link"
        >
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

export function EmbeddedResourceBlockView({
  block,
}: {
  block: EmbeddedResourceBlock;
}) {
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
            customStyle={{
              margin: 0,
              borderRadius: "0 0 6px 6px",
              fontSize: "12px",
            }}
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
      <MarkdownContent text={entry.content} className="plan-entry-text" />
      {entry.priority && (
        <span className={`plan-priority plan-priority-${entry.priority}`}>
          {entry.priority}
        </span>
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
        <MarkdownContent
          text={block.description}
          className="task-description"
        />
        {block.toolUses != null && (
          <span className="task-meta">{block.toolUses} tools</span>
        )}
      </div>
      {block.summary && (
        <MarkdownContent text={block.summary} className="task-summary" />
      )}
      <ExtraDataView extra={block.extra} />
    </div>
  );
}

/* ── Shared init sub-components ──────────────────────────── */

function InitPillSection({
  icon,
  label,
  count,
  items,
}: {
  icon: string;
  label: string;
  count: number;
  items: string[];
}) {
  if (count === 0) return null;
  return (
    <div className="init-pill-section">
      <div className="init-pill-section-header">
        <span className="init-pill-section-icon">{icon}</span>
        <span className="init-pill-section-label">{label}</span>
        <span className="init-pill-section-count">{count}</span>
      </div>
      <div className="init-pill-list">
        {items.map((item, i) => (
          <span key={i} className="init-pill">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function InitKVRow({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <div className="init-kv-row">
      <span className="init-kv-row-icon">{icon}</span>
      <span className="init-kv-row-label">{label}</span>
      <span className="init-kv-row-value">{value}</span>
    </div>
  );
}

function capabilityBadges(
  caps: Record<string, unknown>,
  prefix = "",
): Array<{ label: string; enabled: boolean }> {
  const badges: Array<{ label: string; enabled: boolean }> = [];
  for (const [key, val] of Object.entries(caps)) {
    if (val != null && typeof val === "object" && !Array.isArray(val)) {
      badges.push(
        ...capabilityBadges(
          val as Record<string, unknown>,
          prefix ? `${prefix}.${key}` : key,
        ),
      );
    } else {
      const label = prefix ? `${prefix}.${key}` : key;
      badges.push({ label, enabled: !!val });
    }
  }
  return badges;
}

function InitCapsBadges({ caps }: { caps: Record<string, unknown> }) {
  const badges = capabilityBadges(caps);
  if (badges.length === 0) return null;
  return (
    <div className="init-pill-list">
      {badges.map((b, i) => (
        <span
          key={i}
          className={`init-pill ${b.enabled ? "init-pill-yes" : "init-pill-no"}`}
        >
          {b.label}
        </span>
      ))}
    </div>
  );
}

function buildSummaryParts(block: SystemInitBlock): string[] {
  const ext = block.extensions;
  const parts: string[] = [];
  if (ext?.protocol === "claude") {
    parts.push(`${ext.tools.length} tools`);
    if (ext.mcpServers.length > 0)
      parts.push(`${ext.mcpServers.length} MCP servers`);
  }
  if (ext?.protocol === "acp") {
    parts.push(`${ext.modes.length} modes`);
    parts.push(`${ext.models.length} models`);
    if (ext.configOptions.length > 0)
      parts.push(`${ext.configOptions.length} config options`);
  }
  if (block.commands.length > 0)
    parts.push(`${block.commands.length} commands`);
  return parts;
}

/* ── Protocol-specific body sections ────────────────────── */

function ClaudeInitSections({ block }: { block: SystemInitBlock }) {
  const ext = block.extensions;
  if (ext?.protocol !== "claude") return null;
  return (
    <>
      <div className="init-kv-rows">
        {block.model && (
          <InitKVRow icon={"\u2699"} label="Model" value={block.model} />
        )}
        {ext.permissionMode && (
          <InitKVRow
            icon={"\u25CB"}
            label="Permissions"
            value={ext.permissionMode}
          />
        )}
      </div>
      <InitPillSection
        icon={"\u{1F527}"}
        label="Tools"
        count={ext.tools.length}
        items={ext.tools}
      />
      {ext.mcpServers.length > 0 && (
        <InitPillSection
          icon={"\u26A1"}
          label="MCP Servers"
          count={ext.mcpServers.length}
          items={ext.mcpServers.map((s) => s.name)}
        />
      )}
    </>
  );
}

function ACPInitSections({ block }: { block: SystemInitBlock }) {
  const ext = block.extensions;
  if (ext?.protocol !== "acp") return null;
  return (
    <>
      <div className="init-kv-rows">
        {block.model && (
          <InitKVRow icon={"\u2699"} label="Model" value={block.model} />
        )}
        {ext.protocolVersion != null && (
          <InitKVRow
            icon={"\u{1F4E1}"}
            label="Protocol"
            value={`v${ext.protocolVersion}`}
          />
        )}
      </div>
      <InitPillSection
        icon={"\u{1F3AD}"}
        label="Modes"
        count={ext.modes.length}
        items={ext.modes.map((m) => m.name ?? m.id)}
      />
      <InitPillSection
        icon={"\u{1F916}"}
        label="Models"
        count={ext.models.length}
        items={ext.models.map((m) => m.name ?? m.modelId)}
      />
      {ext.configOptions.length > 0 && (
        <InitPillSection
          icon={"\u2699"}
          label="Config"
          count={ext.configOptions.length}
          items={ext.configOptions.map(
            (o) => `${o.name}: ${o.currentValue ?? "-"}`,
          )}
        />
      )}
      {ext.agentCapabilities && (
        <div className="init-pill-section">
          <div className="init-pill-section-header">
            <span className="init-pill-section-icon">{"\u{1F527}"}</span>
            <span className="init-pill-section-label">Agent Capabilities</span>
          </div>
          <InitCapsBadges
            caps={ext.agentCapabilities as unknown as Record<string, unknown>}
          />
        </div>
      )}
      {ext.clientCapabilities && (
        <div className="init-pill-section">
          <div className="init-pill-section-header">
            <span className="init-pill-section-icon">{"\u{1F4BB}"}</span>
            <span className="init-pill-section-label">Client Capabilities</span>
          </div>
          <InitCapsBadges
            caps={ext.clientCapabilities as unknown as Record<string, unknown>}
          />
        </div>
      )}
    </>
  );
}

/* ── Main SystemInitBlockView ───────────────────────────── */

export function SystemInitBlockView({
  block,
  expanded,
  onToggle,
}: {
  block: SystemInitBlock;
  expanded: boolean;
  onToggle: () => void;
}) {
  const title = [
    block.agentName,
    block.agentVersion ? `v${block.agentVersion}` : null,
  ]
    .filter(Boolean)
    .join(" ");
  const summaryParts = buildSummaryParts(block);

  return (
    <div className="turn-block system-init-block system-init-session">
      <div
        className="init-session-header"
        onClick={onToggle}
        style={{ cursor: "pointer" }}
      >
        <span className="init-session-dot" />
        <span className="init-session-title">
          <strong>{title || "Session initialized"}</strong>
        </span>
        <span className={`chevron init-chevron ${expanded ? "expanded" : ""}`}>
          {"\u25B6"}
        </span>
      </div>
      {expanded && (
        <div className="init-session-body">
          <ClaudeInitSections block={block} />
          <ACPInitSections block={block} />
          {block.commands.length > 0 && (
            <InitPillSection
              icon={"\u{1F4AC}"}
              label="Commands"
              count={block.commands.length}
              items={block.commands}
            />
          )}
          {summaryParts.length > 0 && (
            <div className="init-session-footer">
              {summaryParts.join(" \u00b7 ")}
            </div>
          )}
          <ExtraDataView extra={block.extra} />
        </div>
      )}
    </div>
  );
}
