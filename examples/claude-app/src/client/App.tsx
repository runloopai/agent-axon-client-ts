import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useLayoutEffect,
  forwardRef,
  type KeyboardEvent,
} from "react";
import Markdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import {
  useClaudeAgent,
  type ConnectionPhase,
  type TurnBlock,
  type ThinkingBlock,
  type ToolCallBlock,
  type TextBlock,
  type TaskBlock,
  type TodoBlock,
  type TodoEntry,
  type UsageState,
  type InitInfo,
} from "./hooks/useClaudeAgent.js";

function phaseLabel(phase: ConnectionPhase): string {
  if (phase === "connecting") return "Connecting to Claude Code\u2026";
  return "";
}

const PERMISSION_MODES = [
  { id: "default", label: "Default" },
  { id: "acceptEdits", label: "Accept Edits" },
  { id: "plan", label: "Plan" },
  { id: "dontAsk", label: "Don't Ask" },
];

// ── Shared helpers ──────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    },
    [text],
  );
  return (
    <button
      className={`copy-btn ${copied ? "copied" : ""}`}
      onClick={handleCopy}
      title="Copy"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
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

// ── Main App ────────────────────────────────────────────────

export default function App() {
  const agent = useClaudeAgent();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [blueprintName, setBlueprintName] = useState("runloop/agents");
  const [launchCommands, setLaunchCommands] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [startModel, setStartModel] = useState("claude-haiku-4-5");
  const [inputText, setInputText] = useState("");
  const [expandedBlocks, setExpandedBlocks] = useState<Set<string>>(new Set());
  const [rightTab, setRightTab] = useState<"tools" | "info">("tools");

  useEffect(() => {
    const el = chatAreaRef.current;
    if (!el) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < 150) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [agent.messages, agent.currentTurnBlocks]);

  const toggleBlock = (id: string) => {
    setExpandedBlocks((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleStart = async () => {
    await agent.start({
      blueprintName: blueprintName || undefined,
      launchCommands: launchCommands
        ? launchCommands.split("\n").filter(Boolean)
        : undefined,
      systemPrompt: systemPrompt || undefined,
      model: startModel || undefined,
    });
  };

  const handleSend = async () => {
    if (!inputText.trim()) return;
    const text = inputText;
    setInputText("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    await agent.sendMessage(text);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  };

  if (
    agent.connectionPhase === "idle" ||
    agent.connectionPhase === "error" ||
    agent.connectionPhase === "connecting"
  ) {
    return (
      <div className="app">
        <div className="setup-panel">
          <SetupCard
            blueprintName={blueprintName}
            setBlueprintName={setBlueprintName}
            launchCommands={launchCommands}
            setLaunchCommands={setLaunchCommands}
            systemPrompt={systemPrompt}
            setSystemPrompt={setSystemPrompt}
            startModel={startModel}
            setStartModel={setStartModel}
            onStart={handleStart}
            connectionPhase={agent.connectionPhase}
            error={agent.error}
          />
        </div>
      </div>
    );
  }

  // Collect tool calls from current turn for activity sidebar
  const allToolCalls = [
    ...agent.messages.flatMap((m) =>
      (m.blocks ?? []).filter(
        (b): b is ToolCallBlock => b.type === "tool_call",
      ),
    ),
    ...agent.currentTurnBlocks.filter(
      (b): b is ToolCallBlock => b.type === "tool_call",
    ),
  ];

  return (
    <div className="app app-ready">
      <div className="header">
        <h1>Claude SDK Demo</h1>
        <div className="status-bar">
          <div
            className={`status-dot ${agent.connectionPhase === "ready" ? "ready" : "connecting"}`}
          />
          <div className="status-ids">
            {agent.devboxId && (
              <div className="status-id">
                devbox:{" "}
                {agent.runloopUrl ? (
                  <a
                    href={`${agent.runloopUrl}/devboxes/${agent.devboxId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {agent.devboxId}
                  </a>
                ) : (
                  <span>{agent.devboxId}</span>
                )}
              </div>
            )}
            {agent.axonId && (
              <div className="status-id">
                axon:{" "}
                {agent.runloopUrl ? (
                  <a
                    href={`${agent.runloopUrl}/axons/${agent.axonId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {agent.axonId}
                  </a>
                ) : (
                  <span>{agent.axonId}</span>
                )}
              </div>
            )}
          </div>
          {agent.usage && <UsageBar usage={agent.usage} />}
          <button className="btn btn-danger" onClick={agent.shutdown}>
            Shutdown
          </button>
        </div>
      </div>

      <div className="main-area">
        {(agent.initInfo || agent.permissionMode) && (
          <ControlsBar
            permissionMode={agent.permissionMode}
            currentModel={agent.currentModel}
            onSetPermissionMode={agent.setPermissionMode}
            onSetModel={agent.setModel}
          />
        )}

        <div className="chat-area" ref={chatAreaRef}>
          {agent.messages.length === 0 && !agent.isAgentTurn && (
            <div className="empty-state">Send a message to start chatting</div>
          )}

          {agent.messages.map((msg) =>
            msg.role === "user" ? (
              <div key={msg.id} className="message user">
                <div className="message-text">{msg.content}</div>
              </div>
            ) : (
              <AssistantTurn
                key={msg.id}
                blocks={msg.blocks ?? []}
                expandedBlocks={expandedBlocks}
                onToggleBlock={toggleBlock}
                isLive={false}
                stopReason={msg.stopReason}
                cost={msg.cost}
                numTurns={msg.numTurns}
                durationMs={msg.durationMs}
              />
            ),
          )}

          {agent.isAgentTurn && agent.currentTurnBlocks.length > 0 && (
            <AssistantTurn
              blocks={agent.currentTurnBlocks}
              expandedBlocks={expandedBlocks}
              onToggleBlock={toggleBlock}
              isLive={true}
            />
          )}

          {agent.error && (
            <div className="error-banner chat-error">{agent.error}</div>
          )}

          <div ref={chatEndRef} />
        </div>

        <div className="input-bar">
          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={handleTextareaInput}
            onKeyDown={handleKeyDown}
            placeholder="Send a message"
            rows={1}
            disabled={agent.connectionPhase !== "ready"}
          />
          {agent.isStreaming || agent.isAgentTurn ? (
            <button className="btn btn-cancel" onClick={agent.cancel}>
              Cancel
            </button>
          ) : (
            <button
              className="btn-send"
              onClick={handleSend}
              disabled={!inputText.trim() || agent.connectionPhase !== "ready"}
            >
              Send
            </button>
          )}
        </div>
      </div>

      <div className="events-sidebar">
        <div className="sidebar-tabs">
          <button
            className={`sidebar-tab ${rightTab === "tools" ? "active" : ""}`}
            onClick={() => setRightTab("tools")}
          >
            Tool Calls
            {allToolCalls.length > 0 && (
              <span className="tab-count">{allToolCalls.length}</span>
            )}
          </button>
          <button
            className={`sidebar-tab ${rightTab === "info" ? "active" : ""}`}
            onClick={() => setRightTab("info")}
          >
            Info
          </button>
        </div>

        {rightTab === "tools" ? (
          <div className="events-list">
            {allToolCalls.length === 0 && (
              <div className="empty-state">No tool calls yet</div>
            )}
            {allToolCalls.map((tc) => (
              <ToolCallSidebarItem key={tc.id} toolCall={tc} />
            ))}
          </div>
        ) : (
          <div className="events-list">
            {agent.initInfo ? (
              <InfoPanel initInfo={agent.initInfo} usage={agent.usage} />
            ) : (
              <div className="empty-state">Waiting for initialization...</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Block-based assistant turn ──────────────────────────────

function AssistantTurn({
  blocks,
  expandedBlocks,
  onToggleBlock,
  isLive,
  stopReason,
  cost,
  numTurns,
  durationMs,
}: {
  blocks: TurnBlock[];
  expandedBlocks: Set<string>;
  onToggleBlock: (id: string) => void;
  isLive: boolean;
  stopReason?: string;
  cost?: number;
  numTurns?: number;
  durationMs?: number;
}) {
  if (blocks.length === 0) return null;

  return (
    <div className="assistant-turn">
      {blocks.map((block, idx) => {
        const isLastBlock = idx === blocks.length - 1;
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
          case "task":
            return <TaskBlockView key={block.id} block={block} />;
          case "todo":
            return <TodoBlockView key={block.id} block={block} />;
          default:
            return null;
        }
      })}
      {!isLive && (
        <TurnSummaryFooter
          blocks={blocks}
          stopReason={stopReason}
          cost={cost}
          numTurns={numTurns}
          durationMs={durationMs}
        />
      )}
    </div>
  );
}

function TurnSummaryFooter({
  blocks,
  stopReason,
  cost,
  numTurns,
  durationMs,
}: {
  blocks: TurnBlock[];
  stopReason?: string;
  cost?: number;
  numTurns?: number;
  durationMs?: number;
}) {
  const toolCalls = blocks.filter(
    (b): b is ToolCallBlock => b.type === "tool_call",
  );
  const hasInfo =
    toolCalls.length > 0 ||
    cost != null ||
    durationMs != null ||
    (stopReason && stopReason !== "end_turn");

  if (!hasInfo) return null;

  const parts: string[] = [];
  if (toolCalls.length > 0) {
    const counts: Record<string, number> = {};
    for (const tc of toolCalls) {
      counts[tc.toolName] = (counts[tc.toolName] || 0) + 1;
    }
    for (const [name, n] of Object.entries(counts)) {
      parts.push(n === 1 ? name : `${n}x ${name}`);
    }
  }

  return (
    <div className="turn-summary">
      {parts.length > 0 && (
        <span className="turn-summary-text">{parts.join(", ")}</span>
      )}
      {durationMs != null && (
        <span className="turn-summary-text">
          {" "}
          {"\u00B7"} {(durationMs / 1000).toFixed(1)}s
        </span>
      )}
      {cost != null && (
        <span className="turn-summary-text">
          {" "}
          {"\u00B7"} ${cost.toFixed(4)}
        </span>
      )}
      {numTurns != null && numTurns > 1 && (
        <span className="turn-summary-text">
          {" "}
          {"\u00B7"} {numTurns} turns
        </span>
      )}
      {stopReason && stopReason !== "end_turn" && (
        <span className="stop-reason-badge">{stopReason}</span>
      )}
    </div>
  );
}

const markdownComponents: Record<
  string,
  React.ComponentType<Record<string, unknown>>
> = {
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
    return (
      <code className={className as string} {...props}>
        {children as React.ReactNode}
      </code>
    );
  },
};

const MarkdownContent = forwardRef<
  HTMLDivElement,
  { text: string; className?: string; style?: React.CSSProperties }
>(function MarkdownContent({ text, className, style }, ref) {
  return (
    <div ref={ref} className={className} style={style}>
      <Markdown components={markdownComponents}>{text}</Markdown>
    </div>
  );
});

const THINKING_COLLAPSED_HEIGHT = 60;

function ThinkingBlockView({
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
    </div>
  );
}

function getToolIcon(toolName: string): string {
  const name = toolName.toLowerCase();
  if (
    name.includes("read") ||
    name.includes("glob") ||
    name.includes("grep") ||
    name.includes("search")
  )
    return "\u{1F441}";
  if (
    name.includes("edit") ||
    name.includes("write") ||
    name.includes("notebook")
  )
    return "\u270F";
  if (
    name.includes("bash") ||
    name.includes("exec") ||
    name.includes("terminal")
  )
    return "\u{1F4BB}";
  if (name.includes("delete") || name.includes("remove")) return "\u{1F5D1}";
  if (name.includes("fetch") || name.includes("web")) return "\u{1F310}";
  if (name.includes("task") || name.includes("agent")) return "\u{1F9E0}";
  return "\u2699";
}

function getToolColorClass(toolName: string): string {
  const name = toolName.toLowerCase();
  if (
    name.includes("read") ||
    name.includes("glob") ||
    name.includes("grep") ||
    name.includes("search")
  )
    return "kind-read";
  if (
    name.includes("edit") ||
    name.includes("write") ||
    name.includes("notebook")
  )
    return "kind-edit";
  if (
    name.includes("bash") ||
    name.includes("exec") ||
    name.includes("terminal")
  )
    return "kind-execute";
  if (name.includes("delete") || name.includes("remove")) return "kind-delete";
  if (name.includes("fetch") || name.includes("web")) return "kind-fetch";
  return "kind-other";
}

function ToolCallBlockView({
  block,
  expanded,
  onToggle,
}: {
  block: ToolCallBlock;
  expanded: boolean;
  onToggle: () => void;
}) {
  const icon = getToolIcon(block.toolName);
  const colorClass = getToolColorClass(block.toolName);
  const isFailed = block.status === "failed";
  const isBash = block.toolName.toLowerCase().includes("bash");
  const hasContent = block.output != null;

  const autoExpand = isBash || isFailed;
  const showBody = autoExpand || expanded;

  const durationLabel =
    block.duration != null &&
    (block.status === "completed" || block.status === "failed")
      ? `${block.duration}s`
      : null;

  // Format display title
  let displayTitle = block.toolName;
  if (block.input && typeof block.input === "object") {
    const input = block.input as Record<string, unknown>;
    if (input.command) displayTitle = input.command as string;
    else if (input.file_path) displayTitle = input.file_path as string;
    else if (input.pattern)
      displayTitle = `${block.toolName}: ${input.pattern}`;
    else if (input.path) displayTitle = input.path as string;
  }

  if (isBash) {
    return (
      <div
        className={`turn-block tool-call-block tc-execute ${colorClass} status-${block.status}`}
      >
        <div
          className="tc-header tc-header-exec"
          onClick={hasContent ? onToggle : undefined}
          style={hasContent ? { cursor: "pointer" } : undefined}
        >
          {statusIndicator(block.status)}
          <span className="tc-kind-icon">{icon}</span>
          <span className="tc-title tc-title-cmd">{displayTitle}</span>
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
        {showBody && block.output && (
          <div className="tc-body tc-body-terminal">
            <CopyButton text={block.output} />
            <pre className="tc-output-pre">{block.output}</pre>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`turn-block tool-call-block ${colorClass} status-${block.status}`}
    >
      <div
        className="tc-header"
        onClick={hasContent ? onToggle : undefined}
        style={hasContent ? { cursor: "pointer" } : undefined}
      >
        {statusIndicator(block.status)}
        <span className="tc-kind-icon">{icon}</span>
        <span className="tc-title">{displayTitle}</span>
        {durationLabel && <span className="tc-duration">{durationLabel}</span>}
        {hasContent && (
          <span className={`chevron tc-chevron ${expanded ? "expanded" : ""}`}>
            {"\u25B6"}
          </span>
        )}
      </div>
      {showBody && block.output && (
        <div className="tc-body">
          <div className="tc-content-wrapper">
            <CopyButton text={block.output} />
            <pre className="tc-output-pre">{block.output}</pre>
          </div>
        </div>
      )}
    </div>
  );
}

function TaskBlockView({ block }: { block: TaskBlock }) {
  const statusIcon =
    block.status === "completed"
      ? "\u2713"
      : block.status === "failed" || block.status === "stopped"
        ? "\u2717"
        : null;

  return (
    <div className={`turn-block task-block task-${block.status}`}>
      <div className="task-header">
        {block.status === "started" || block.status === "in_progress" ? (
          <span className="tc-status-spinner" />
        ) : (
          <span className={`task-status-icon ${block.status}`}>
            {statusIcon}
          </span>
        )}
        <span className="task-description">{block.description}</span>
        {block.toolUses != null && (
          <span className="task-meta">{block.toolUses} tool uses</span>
        )}
      </div>
      {block.summary && <div className="task-summary">{block.summary}</div>}
    </div>
  );
}

function todoStatusIcon(status: string) {
  switch (status) {
    case "in_progress":
      return <span className="todo-status-spinner" />;
    case "completed":
      return <span className="todo-status-check">{"\u2713"}</span>;
    default:
      return <span className="todo-status-pending">{"\u25CB"}</span>;
  }
}

function TodoBlockView({ block }: { block: TodoBlock }) {
  return (
    <div className="turn-block todo-block">
      <div className="todo-header">Plan</div>
      <div className="todo-entries">
        {block.entries.map((entry, i) => (
          <TodoEntryView key={i} entry={entry} />
        ))}
      </div>
    </div>
  );
}

function TodoEntryView({ entry }: { entry: TodoEntry }) {
  return (
    <div className={`todo-entry todo-entry-${entry.status}`}>
      {todoStatusIcon(entry.status)}
      <span className="todo-entry-text">
        {entry.activeForm && entry.status === "in_progress"
          ? entry.activeForm
          : entry.content}
      </span>
    </div>
  );
}

function TextBlockView({
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
    </div>
  );
}

function UsageBar({ usage }: { usage: UsageState }) {
  const total = usage.inputTokens + usage.outputTokens;
  return (
    <div
      className="usage-bar"
      title={`Input: ${usage.inputTokens.toLocaleString()} | Output: ${usage.outputTokens.toLocaleString()} | Cache: ${usage.cacheReadInputTokens.toLocaleString()} read, ${usage.cacheCreationInputTokens.toLocaleString()} created`}
    >
      <span className="usage-label">{total.toLocaleString()} tokens</span>
    </div>
  );
}

// ── Controls Bar ────────────────────────────────────────────

function ControlsBar({
  permissionMode,
  currentModel,
  onSetPermissionMode,
  onSetModel,
}: {
  permissionMode: string | null;
  currentModel: string | null;
  onSetPermissionMode: (mode: string) => void;
  onSetModel: (model: string) => void;
}) {
  const [showModelInput, setShowModelInput] = useState(false);
  const [modelInput, setModelInput] = useState(currentModel ?? "");

  return (
    <div className="controls-bar">
      <div className="mode-switcher">
        {PERMISSION_MODES.map((mode) => (
          <button
            key={mode.id}
            className={`mode-btn ${permissionMode === mode.id ? "active" : ""}`}
            onClick={() => onSetPermissionMode(mode.id)}
          >
            {mode.label}
          </button>
        ))}
      </div>
      {currentModel && (
        <span className="model-display">
          <span className="config-label">Model:</span>
          {showModelInput ? (
            <input
              className="model-input"
              value={modelInput}
              onChange={(e) => setModelInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onSetModel(modelInput);
                  setShowModelInput(false);
                }
                if (e.key === "Escape") setShowModelInput(false);
              }}
              onBlur={() => setShowModelInput(false)}
              autoFocus
            />
          ) : (
            <span
              className="model-name"
              onClick={() => {
                setModelInput(currentModel);
                setShowModelInput(true);
              }}
            >
              {currentModel}
            </span>
          )}
        </span>
      )}
    </div>
  );
}

// ── Setup Card ──────────────────────────────────────────────

function SetupCard({
  blueprintName,
  setBlueprintName,
  launchCommands,
  setLaunchCommands,
  systemPrompt,
  setSystemPrompt,
  startModel,
  setStartModel,
  onStart,
  connectionPhase,
  error,
}: {
  blueprintName: string;
  setBlueprintName: (v: string) => void;
  launchCommands: string;
  setLaunchCommands: (v: string) => void;
  systemPrompt: string;
  setSystemPrompt: (v: string) => void;
  startModel: string;
  setStartModel: (v: string) => void;
  onStart: () => void;
  connectionPhase: ConnectionPhase;
  error: string | null;
}) {
  const connecting = connectionPhase === "connecting";

  return (
    <div className="setup-card">
      <div className="setup-header">
        <h2>Claude Code Demo</h2>
        <p className="setup-subtitle">
          Interactive client for{" "}
          <a
            href="https://docs.anthropic.com/en/docs/claude-code"
            target="_blank"
            rel="noopener noreferrer"
          >
            Claude Code
          </a>{" "}
          running in a secure cloud sandbox via the native Claude SDK.
        </p>
      </div>

      <div className="setup-architecture">
        <div className="arch-label">How it works</div>
        <div className="arch-diagram">
          <div className="arch-node">
            <div className="arch-node-label">This browser</div>
            <div className="arch-node-desc">React UI</div>
          </div>
          <div className="arch-arrow">
            <span className="arch-arrow-line" />
            <span className="arch-arrow-proto">WebSocket</span>
          </div>
          <div className="arch-node">
            <div className="arch-node-label">Express server</div>
            <div className="arch-node-desc">Claude SDK client</div>
          </div>
          <div className="arch-arrow">
            <span className="arch-arrow-line" />
            <span className="arch-arrow-proto">Axon (SSE)</span>
          </div>
          <div className="arch-node arch-node-cloud">
            <div className="arch-node-label">Runloop Sandbox</div>
            <div className="arch-node-desc">Claude Code</div>
          </div>
        </div>
        <p className="arch-explain">
          Clicking start provisions a Runloop <strong>devbox</strong> (cloud
          sandbox) and an <strong>Axon channel</strong> (real-time event bus).
          The Claude SDK streams messages through Axon to Claude Code running
          inside the sandbox. You chat here, Claude works there.
        </p>
      </div>

      <div className="setup-form-section">
        <div className="form-group">
          <label>Blueprint</label>
          <div className="form-hint">
            A Runloop blueprint pre-configures the sandbox environment
            (installed packages, repos, files). Leave blank for a default
            sandbox.
          </div>
          <input
            value={blueprintName}
            onChange={(e) => setBlueprintName(e.target.value)}
            placeholder="runloop/agents"
            disabled={connecting}
          />
        </div>
        <div className="form-group">
          <label>Model</label>
          <div className="form-hint">
            Which Claude model to use. Haiku is fast and cheap for testing;
            Sonnet/Opus for production quality.
          </div>
          <input
            value={startModel}
            onChange={(e) => setStartModel(e.target.value)}
            placeholder="claude-sonnet-4-20250514"
            disabled={connecting}
          />
        </div>
        <div className="form-group">
          <label>Launch Commands</label>
          <div className="form-hint">
            Shell commands to run in the sandbox before starting Claude (one per
            line). Use for cloning repos, installing dependencies, etc.
          </div>
          <input
            value={launchCommands}
            onChange={(e) => setLaunchCommands(e.target.value)}
            placeholder="git clone https://..."
            disabled={connecting}
          />
        </div>
        <div className="form-group">
          <label>System Prompt</label>
          <div className="form-hint">
            Custom instructions prepended to the conversation. Sets Claude's
            behavior, focus area, or constraints.
          </div>
          <textarea
            className="setup-textarea"
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="You are a senior engineer. Focus on writing tests..."
            disabled={connecting}
            rows={3}
          />
        </div>
      </div>

      <button
        className="btn btn-primary"
        onClick={onStart}
        disabled={connecting}
      >
        {connecting ? "Connecting" : "Create Sandbox & Start"}
      </button>
      {connecting && (
        <div className="phase-indicator">
          <div className="phase-spinner" />
          <span>Provisioning sandbox and connecting to Claude Code</span>
        </div>
      )}
      {error && <div className="error-banner">{error}</div>}
    </div>
  );
}

// ── Tool call sidebar ───────────────────────────────────────

function ToolCallSidebarItem({ toolCall }: { toolCall: ToolCallBlock }) {
  const [expanded, setExpanded] = useState(false);
  const icon = getToolIcon(toolCall.toolName);
  const hasOutput = !!toolCall.output;

  let displayTitle = toolCall.toolName;
  if (toolCall.input && typeof toolCall.input === "object") {
    const input = toolCall.input as Record<string, unknown>;
    if (input.command) displayTitle = input.command as string;
    else if (input.file_path) displayTitle = input.file_path as string;
  }

  return (
    <div className={`tool-activity-item ${toolCall.status}`}>
      <div
        className="tool-activity-header"
        onClick={hasOutput ? () => setExpanded(!expanded) : undefined}
        style={hasOutput ? { cursor: "pointer" } : undefined}
      >
        <div className="tool-call-sidebar-icon">{icon}</div>
        <div className="tool-activity-info">
          <div className="tool-activity-title">{displayTitle}</div>
          <div className="tool-activity-meta">
            <span className={`tool-activity-status ${toolCall.status}`}>
              {toolCall.status}
            </span>
            {toolCall.duration != null && (
              <span className="tool-activity-time">{toolCall.duration}s</span>
            )}
          </div>
        </div>
        {hasOutput && (
          <span className={`chevron ${expanded ? "expanded" : ""}`}>
            {"\u25B6"}
          </span>
        )}
      </div>
      {expanded && toolCall.output && (
        <div className="tool-activity-output">
          <pre>{toolCall.output}</pre>
        </div>
      )}
    </div>
  );
}

// ── Info Panel ──────────────────────────────────────────────

function InfoPanel({
  initInfo,
  usage,
}: {
  initInfo: InitInfo;
  usage: UsageState | null;
}) {
  return (
    <div className="info-panel">
      <div className="info-section">
        <div className="info-section-title">Model</div>
        <div className="info-value">{initInfo.model}</div>
      </div>
      <div className="info-section">
        <div className="info-section-title">Permission Mode</div>
        <div className="info-value">{initInfo.permissionMode}</div>
      </div>
      {usage && (
        <div className="info-section">
          <div className="info-section-title">Token Usage</div>
          <div className="info-grid">
            <span className="info-label">Input:</span>
            <span className="info-value">
              {usage.inputTokens.toLocaleString()}
            </span>
            <span className="info-label">Output:</span>
            <span className="info-value">
              {usage.outputTokens.toLocaleString()}
            </span>
            <span className="info-label">Cache Read:</span>
            <span className="info-value">
              {usage.cacheReadInputTokens.toLocaleString()}
            </span>
            <span className="info-label">Cache Created:</span>
            <span className="info-value">
              {usage.cacheCreationInputTokens.toLocaleString()}
            </span>
          </div>
        </div>
      )}
      <div className="info-section">
        <div className="info-section-title">
          Tools ({initInfo.tools.length})
        </div>
        <div className="info-list">
          {initInfo.tools.map((t) => (
            <span key={t} className="info-chip">
              {t}
            </span>
          ))}
        </div>
      </div>
      {initInfo.mcpServers.length > 0 && (
        <div className="info-section">
          <div className="info-section-title">MCP Servers</div>
          <div className="info-list">
            {initInfo.mcpServers.map((s) => (
              <span key={s.name} className="info-chip">
                {s.name}{" "}
                <span className={`mcp-status ${s.status}`}>({s.status})</span>
              </span>
            ))}
          </div>
        </div>
      )}
      {initInfo.slashCommands.length > 0 && (
        <div className="info-section">
          <div className="info-section-title">Slash Commands</div>
          <div className="info-list">
            {initInfo.slashCommands.map((c) => (
              <span key={c} className="info-chip">
                /{c}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
