import {
  useState,
  useRef,
  useEffect,
  useCallback,
  forwardRef,
  type KeyboardEvent,
} from "react";
import { useDropzone } from "react-dropzone";
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
  type PendingControlRequest,
  type ControlRequestQuestion,
  type AxonEventView,
  type UserAttachment,
} from "./hooks/useClaudeAgent.js";
import { useAttachments } from "./useAttachments.js";
import { AttachmentBar } from "./AttachmentBar.js";
import { AxonEventItem } from "./components/AxonEventItem.js";
import { CommandPicker } from "./components/CommandPicker.js";
import { TurnBlocksInspector } from "./components/TurnBlocksInspector.js";

function phaseLabel(phase: ConnectionPhase): string {
  if (phase === "connecting") return "Connecting to Claude Code\u2026";
  return "";
}

function UserAttachments({ attachments }: { attachments: UserAttachment[] }) {
  return (
    <div className="user-attachments">
      {attachments.map((a, i) =>
        a.type === "image" && a.data && a.mimeType ? (
          <div key={i} className="user-attachment-image">
            <img
              src={`data:${a.mimeType};base64,${a.data}`}
              alt={a.name ?? "attachment"}
            />
          </div>
        ) : a.type === "file" ? (
          <div key={i} className="user-attachment-file">
            <span className="user-attachment-file-icon">{"\uD83D\uDCC4"}</span>
            <span className="user-attachment-file-name">{a.name ?? "file"}</span>
          </div>
        ) : null,
      )}
    </div>
  );
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
  const attach = useAttachments();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [blueprintName, setBlueprintName] = useState("runloop/agents");
  const [launchCommands, setLaunchCommands] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [startModel, setStartModel] = useState("claude-haiku-4-5");
  const [startAutoApprove, setStartAutoApprove] = useState(true);
  const [inputText, setInputText] = useState("");
  const [expandedBlocks, setExpandedBlocks] = useState<Set<string>>(new Set());
  const [rightTab, setRightTab] = useState<"activity" | "axon">("activity");
  const [expandedAxonEvents, setExpandedAxonEvents] = useState<Set<number>>(new Set());
  const [showCommandPicker, setShowCommandPicker] = useState(false);
  const [commandPickerIndex, setCommandPickerIndex] = useState(0);
  const axonEndRef = useRef<HTMLDivElement>(null);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    noClick: true,
    noKeyboard: true,
    onDrop: (files) => attach.addFiles(files),
  });

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
      autoApprovePermissions: startAutoApprove,
    });
  };

  const slashCommands = agent.initInfo?.slashCommands ?? [];
  const slashFilter =
    inputText.startsWith("/") && !inputText.includes(" ")
      ? inputText.slice(1).toLowerCase()
      : null;
  const filteredCommands =
    slashFilter !== null
      ? slashCommands.filter((c) => c.toLowerCase().includes(slashFilter))
      : [];

  const selectCommand = (cmd: string) => {
    setInputText("");
    setShowCommandPicker(false);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    agent.sendMessage(`/${cmd}`);
  };

  const handleSend = async () => {
    if (!attach.hasContent(inputText)) return;
    setShowCommandPicker(false);
    const text = inputText;
    const content = attach.toContentPayload(text);
    setInputText("");
    attach.clearAttachments();
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    const hasAttachments = content.some((c) => c.type !== "text");
    await agent.sendMessage(text, hasAttachments ? content : undefined);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (showCommandPicker && filteredCommands.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setCommandPickerIndex((i) =>
          Math.min(i + 1, filteredCommands.length - 1),
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setCommandPickerIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        selectCommand(filteredCommands[commandPickerIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowCommandPicker(false);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputText(val);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";

    const isSlash = val.startsWith("/") && !val.includes(" ");
    if (isSlash && slashCommands.length > 0) {
      setShowCommandPicker(true);
      setCommandPickerIndex(0);
    } else {
      setShowCommandPicker(false);
    }
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
            autoApprovePermissions={startAutoApprove}
            setAutoApprovePermissions={setStartAutoApprove}
            onStart={handleStart}
            connectionPhase={agent.connectionPhase}
            connectionStatus={agent.connectionStatus}
            error={agent.error}
          />
        </div>
      </div>
    );
  }

  const totalBlocks = agent.messages.reduce(
    (sum, m) => sum + (m.blocks?.length ?? 0),
    0,
  ) + agent.currentTurnBlocks.length;

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
                    href={`${agent.runloopUrl.replace("api", "platform")}/devboxes/${agent.devboxId}`}
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
            autoApprovePermissions={agent.autoApprovePermissions}
            onSetPermissionMode={agent.setPermissionMode}
            onSetModel={agent.setModel}
            onSetAutoApprovePermissions={agent.setAutoApprovePermissions}
          />
        )}

        <div className="chat-area" ref={chatAreaRef}>
          {agent.initInfo && (
            <ConnectionInfoBanner
              initInfo={agent.initInfo}
              usage={agent.usage}
              permissionMode={agent.permissionMode}
              currentModel={agent.currentModel}
            />
          )}

          {agent.messages.length === 0 && !agent.isAgentTurn && !agent.initInfo && (
            <div className="empty-state">Send a message to start chatting</div>
          )}

          {agent.messages.map((msg) =>
            msg.role === "user" ? (
              <div key={msg.id} className="message user">
                <div className="message-text">{msg.content}</div>
                {msg.attachments && msg.attachments.length > 0 && (
                  <UserAttachments attachments={msg.attachments} />
                )}
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

          {agent.pendingControlRequest && (
            <ControlRequestPrompt
              controlRequest={agent.pendingControlRequest}
              onSubmit={agent.sendControlResponse}
            />
          )}

          {agent.error && (
            <div className="error-banner chat-error">{agent.error}</div>
          )}

          <div ref={chatEndRef} />
        </div>

        <div className="input-bar" {...getRootProps()}>
          <input {...getInputProps()} />
          {isDragActive && <div className="dropzone-active">Drop files here</div>}
          {showCommandPicker && filteredCommands.length > 0 && (
            <CommandPicker
              commands={filteredCommands}
              selectedIndex={commandPickerIndex}
              onSelect={selectCommand}
              onHover={setCommandPickerIndex}
            />
          )}
          <AttachmentBar
            attachments={attach.attachments}
            onRemove={attach.removeAttachment}
          />
          <div className="input-row">
            <button
              className="btn-attach"
              onClick={() => fileInputRef.current?.click()}
              disabled={agent.connectionPhase !== "ready"}
              title="Attach files"
            >
              📎
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              style={{ display: "none" }}
              accept="image/*,.txt,.md,.json,.csv,.xml,.yaml,.yml,.ts,.js,.py,.html,.css,.sh,.toml,.cfg,.log"
              onChange={(e) => {
                if (e.target.files) attach.addFiles(Array.from(e.target.files));
                e.target.value = "";
              }}
            />
            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={handleTextareaInput}
              onKeyDown={handleKeyDown}
              onPaste={attach.handlePaste}
              placeholder="Send a message, paste images, or drop files"
              rows={1}
              disabled={agent.connectionPhase !== "ready" || agent.isSendingPrompt}
            />
            {agent.isStreaming || agent.isAgentTurn ? (
              <button className="btn btn-cancel" onClick={agent.cancel}>
                Cancel
              </button>
            ) : (
              <button
                className="btn-send"
                onClick={handleSend}
                disabled={!attach.hasContent(inputText) || agent.connectionPhase !== "ready" || agent.isSendingPrompt}
              >
                {agent.isSendingPrompt ? "Sending\u2026" : "Send"}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="events-sidebar">
        <div className="sidebar-tabs">
          <button
            className={`sidebar-tab ${rightTab === "activity" ? "active" : ""}`}
            onClick={() => setRightTab("activity")}
          >
            Activity
            {totalBlocks > 0 && (
              <span className="tab-count">{totalBlocks}</span>
            )}
          </button>
          <button
            className={`sidebar-tab ${rightTab === "axon" ? "active" : ""}`}
            onClick={() => setRightTab("axon")}
          >
            Axon
            {agent.axonEvents.length > 0 && (
              <span className="tab-count">{agent.axonEvents.length}</span>
            )}
          </button>
        </div>

        {rightTab === "activity" ? (
          <div className="events-list">
            <TurnBlocksInspector
              messages={agent.messages}
              currentTurnBlocks={agent.currentTurnBlocks}
              isAgentTurn={agent.isAgentTurn}
            />
          </div>
        ) : (
          <div className="events-list">
            {agent.axonEvents.length > 0 && (
              <div className="events-list-toolbar">
                <button
                  className="btn btn-ghost btn-copy-all"
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(agent.axonEvents, null, 2));
                  }}
                >
                  Copy All
                </button>
              </div>
            )}
            {agent.axonEvents.length === 0 && (
              <div className="empty-state">No axon events yet</div>
            )}
            {agent.axonEvents.map((event, i) => (
              <AxonEventItem
                key={i}
                event={event}
                expanded={expandedAxonEvents.has(i)}
                onToggle={() =>
                  setExpandedAxonEvents((prev) => {
                    const next = new Set(prev);
                    next.has(i) ? next.delete(i) : next.add(i);
                    return next;
                  })
                }
                onCopy={() => {
                  navigator.clipboard.writeText(JSON.stringify(event, null, 2));
                }}
              />
            ))}
            <div ref={axonEndRef} />
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

const STOP_REASON_LABELS: Record<string, string> = {
  tool_use: "Cancelled",
  max_tokens: "Max tokens",
  error_during_execution: "Error",
};

function humanizeStopReason(reason: string): string {
  return STOP_REASON_LABELS[reason] ?? reason;
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
        <span className="stop-reason-badge">{humanizeStopReason(stopReason)}</span>
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

const THINKING_PREVIEW_HEIGHT = 40;

function ThinkingBlockView({
  block,
  expanded,
  onToggle,
}: {
  block: ThinkingBlock;
  expanded: boolean;
  onToggle: () => void;
}) {
  if (!block.text && !block.isActive) return null;

  const hasContent = !!block.text;
  const isFinished = !block.isActive;
  const canToggle = hasContent && isFinished;

  return (
    <div
      className={`turn-block thinking-block${canToggle ? " thinking-block-clickable" : ""}`}
      onClick={canToggle ? onToggle : undefined}
      role={canToggle ? "button" : undefined}
      tabIndex={canToggle ? 0 : undefined}
    >
      <div className="thinking-header-inline">
        <span
          className={`thinking-chevron${expanded ? " thinking-chevron-open" : ""}${block.isActive ? " thinking-chevron-active" : ""}`}
        />
        <span className="thinking-label">
          Thinking{block.isActive ? "\u2026" : ""}
        </span>
        {block.duration != null && (
          <span className="thinking-duration">{block.duration}s</span>
        )}
      </div>
      {block.text && (
        <MarkdownContent
          text={block.text}
          className={`thinking-content${expanded ? " thinking-content-expanded" : " thinking-content-collapsed"}`}
          style={!expanded ? { maxHeight: THINKING_PREVIEW_HEIGHT } : undefined}
        />
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
  autoApprovePermissions,
  onSetPermissionMode,
  onSetModel,
  onSetAutoApprovePermissions,
}: {
  permissionMode: string | null;
  currentModel: string | null;
  autoApprovePermissions: boolean;
  onSetPermissionMode: (mode: string) => void;
  onSetModel: (model: string) => void;
  onSetAutoApprovePermissions: (enabled: boolean) => void;
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
      <label className="config-toggle">
        <input
          type="checkbox"
          checked={autoApprovePermissions}
          onChange={(e) => onSetAutoApprovePermissions(e.target.checked)}
        />
        <span className="config-toggle-label">Auto-approve permissions</span>
      </label>
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
  autoApprovePermissions,
  setAutoApprovePermissions,
  onStart,
  connectionPhase,
  connectionStatus,
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
  autoApprovePermissions: boolean;
  setAutoApprovePermissions: (v: boolean) => void;
  onStart: () => void;
  connectionPhase: ConnectionPhase;
  connectionStatus: string | null;
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
            placeholder="claude-haiku-4-5"
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
        <label className="config-toggle">
          <input
            type="checkbox"
            checked={autoApprovePermissions}
            onChange={(e) => setAutoApprovePermissions(e.target.checked)}
            disabled={connecting}
          />
          <span className="config-toggle-label">Auto-approve permissions</span>
        </label>
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
          <span>{connectionStatus ?? "Provisioning sandbox and connecting to Claude Code"}</span>
        </div>
      )}
      {error && <div className="error-banner">{error}</div>}
    </div>
  );
}

// ── Control Request Prompt (AskUserQuestion) ────────────────

/**
 * Renders an interactive prompt for a pending can_use_tool control request.
 * Supports single-select and multi-select questions with option cards.
 * When the user submits, sends a control response back to Claude Code
 * with the selected answers in the updatedInput.
 */
function ControlRequestPrompt({
  controlRequest,
  onSubmit,
}: {
  controlRequest: PendingControlRequest;
  onSubmit: (requestId: string, response: Record<string, unknown>) => void;
}) {
  // Track selected options per question index.
  // For single-select: one label string. For multi-select: a Set of label strings.
  const [selections, setSelections] = useState<Map<number, Set<string>>>(new Map());

  const toggleOption = (questionIdx: number, label: string, multiSelect: boolean) => {
    setSelections((prev) => {
      const next = new Map(prev);
      const current = next.get(questionIdx) ?? new Set<string>();

      if (multiSelect) {
        const updated = new Set(current);
        if (updated.has(label)) {
          updated.delete(label);
        } else {
          updated.add(label);
        }
        next.set(questionIdx, updated);
      } else {
        // Single-select: replace selection
        next.set(questionIdx, new Set([label]));
      }

      return next;
    });
  };

  const handleSubmit = () => {
    // Build the answers map: keyed by question text, value is the selected label(s).
    // Questions array is emptied — Claude Code expects answers in this format.
    const answers: Record<string, string> = {};
    for (const [idx, question] of controlRequest.questions.entries()) {
      const selected = selections.get(idx);
      if (selected && selected.size > 0) {
        answers[question.question] = Array.from(selected).join(", ");
      }
    }

    onSubmit(controlRequest.requestId, {
      behavior: "allow",
      updatedInput: { questions: [], answers },
    });
  };

  // Check if all questions have at least one selection
  const allAnswered = controlRequest.questions.every(
    (_, idx) => (selections.get(idx)?.size ?? 0) > 0,
  );

  return (
    <div className="control-request-prompt">
      <div className="control-request-header">
        Claude is asking a question
      </div>
      {controlRequest.questions.map((question, qIdx) => (
        <QuestionView
          key={qIdx}
          question={question}
          selected={selections.get(qIdx) ?? new Set()}
          onToggle={(label) => toggleOption(qIdx, label, question.multiSelect)}
        />
      ))}
      <div className="control-request-actions">
        <button
          className="btn btn-primary"
          onClick={handleSubmit}
          disabled={!allAnswered}
        >
          Submit
        </button>
      </div>
    </div>
  );
}

function QuestionView({
  question,
  selected,
  onToggle,
}: {
  question: ControlRequestQuestion;
  selected: Set<string>;
  onToggle: (label: string) => void;
}) {
  return (
    <div className="control-request-question">
      <div className="control-request-question-header">{question.header}</div>
      {question.question && (
        <div className="control-request-question-text">{question.question}</div>
      )}
      <div className="control-request-options">
        {question.options.map((option) => {
          const isSelected = selected.has(option.label);
          return (
            <button
              key={option.label}
              className={`control-request-option ${isSelected ? "selected" : ""}`}
              onClick={() => onToggle(option.label)}
            >
              <span className="option-indicator">
                {question.multiSelect
                  ? (isSelected ? "\u2611" : "\u2610")
                  : (isSelected ? "\u25C9" : "\u25CB")}
              </span>
              <span className="option-content">
                <span className="option-label">{option.label}</span>
                {option.description && (
                  <span className="option-description">{option.description}</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Connection Info Banner (chat area) ─────────────────────

function ConnectionInfoBanner({
  initInfo,
  usage,
  permissionMode,
  currentModel,
}: {
  initInfo: InitInfo;
  usage: UsageState | null;
  permissionMode: string | null;
  currentModel: string | null;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`conn-banner ${expanded ? "conn-banner-expanded" : ""}`}>
      <div className="conn-banner-header" onClick={() => setExpanded(!expanded)}>
        <span className="conn-banner-dot" />
        <span className="conn-banner-title">
          <strong>Claude Code</strong>
          {" connected"}
        </span>
        <span className="conn-banner-proto">Claude SDK</span>
        <span className={`chevron conn-banner-chevron ${expanded ? "expanded" : ""}`}>{"\u25B6"}</span>
      </div>

      {!expanded && (
        <div className="conn-banner-summary">
          {initInfo.tools.length > 0 && (
            <span className="cap-badge cap-yes cap-inline">{initInfo.tools.length} tools</span>
          )}
          {initInfo.mcpServers.length > 0 && (
            <span className="cap-badge cap-yes cap-inline">{initInfo.mcpServers.length} MCP</span>
          )}
          {initInfo.slashCommands.length > 0 && (
            <span className="cap-badge cap-yes cap-inline">{initInfo.slashCommands.length} commands</span>
          )}
          {(currentModel ?? initInfo.model) && (
            <span className="conn-model-chip">{currentModel ?? initInfo.model}</span>
          )}
        </div>
      )}

      {expanded && (
        <div className="conn-banner-body">
          <div className="conn-section">
            <div className="conn-section-title">Session</div>
            <div className="conn-details">
              <div className="conn-kv">
                <span className="conn-kv-key">Model</span>
                <span className="conn-kv-val"><code>{currentModel ?? initInfo.model}</code></span>
              </div>
              <div className="conn-kv">
                <span className="conn-kv-key">Permission Mode</span>
                <span className="conn-kv-val">{permissionMode ?? initInfo.permissionMode}</span>
              </div>
            </div>
          </div>

          {usage && (
            <div className="conn-section">
              <div className="conn-section-title">Token Usage</div>
              <div className="conn-details">
                <div className="conn-kv">
                  <span className="conn-kv-key">Input</span>
                  <span className="conn-kv-val">{usage.inputTokens.toLocaleString()}</span>
                </div>
                <div className="conn-kv">
                  <span className="conn-kv-key">Output</span>
                  <span className="conn-kv-val">{usage.outputTokens.toLocaleString()}</span>
                </div>
                <div className="conn-kv">
                  <span className="conn-kv-key">Cache Read</span>
                  <span className="conn-kv-val">{usage.cacheReadInputTokens.toLocaleString()}</span>
                </div>
                <div className="conn-kv">
                  <span className="conn-kv-key">Cache Created</span>
                  <span className="conn-kv-val">{usage.cacheCreationInputTokens.toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}

          <div className="conn-section">
            <div className="conn-section-title">Tools ({initInfo.tools.length})</div>
            <div className="conn-caps">
              {initInfo.tools.map((t) => (
                <span key={t} className="cap-badge cap-yes">{t}</span>
              ))}
            </div>
          </div>

          {initInfo.mcpServers.length > 0 && (
            <div className="conn-section">
              <div className="conn-section-title">MCP Servers</div>
              <div className="conn-caps">
                {initInfo.mcpServers.map((s) => (
                  <span key={s.name} className="cap-badge cap-yes">
                    {s.name}{" "}
                    <span className={`mcp-status ${s.status}`}>({s.status})</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {initInfo.slashCommands.length > 0 && (
            <div className="conn-section">
              <div className="conn-section-title">Slash Commands</div>
              <div className="conn-caps">
                {initInfo.slashCommands.map((c) => (
                  <span key={c} className="cap-badge cap-yes">/{c}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
