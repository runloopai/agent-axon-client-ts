import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type KeyboardEvent,
} from "react";
import type { AgentType, AvailableCommand, AxonEventView, UserAttachment } from "./types.js";
import { useAgent } from "./hooks/useAgent.js";
import { SetupCard } from "./components/SetupCard.js";
import { ControlsBar } from "./components/ControlsBar.js";
import { AssistantTurn } from "./components/AssistantTurn.js";
import { ElicitationForm } from "./components/ElicitationForm.js";
import { PermissionDialog } from "./components/PermissionDialog.js";
import { ControlRequestPrompt } from "./components/ControlRequestPrompt.js";
import { CommandPicker } from "./components/CommandPicker.js";
import { AxonEventItem } from "./components/AxonEventItem.js";
import { TurnBlocksInspector } from "./components/TurnBlocksInspector.js";

function UserAttachments({ attachments }: { attachments: UserAttachment[] }) {
  return (
    <div className="user-attachments">
      {attachments.map((a, i) =>
        a.type === "image" && a.data && a.mimeType ? (
          <div key={i} className="user-attachment-image">
            <img src={`data:${a.mimeType};base64,${a.data}`} alt={a.name ?? "attachment"} />
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

export default function App() {
  const [selectedAgentType, setSelectedAgentType] = useState<AgentType>("acp");
  const [activeAgentType, setActiveAgentType] = useState<AgentType | null>(null);
  const agent = useAgent(activeAgentType);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatAreaRef = useRef<HTMLDivElement>(null);
  const axonEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [agentBinary, setAgentBinary] = useState("opencode");
  const [launchArgs, setLaunchArgs] = useState("acp");
  const [launchCommands, setLaunchCommands] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [blueprintName, setBlueprintName] = useState("");
  const [model, setModel] = useState("");
  const [inputText, setInputText] = useState("");
  const [expandedBlocks, setExpandedBlocks] = useState<Set<string>>(new Set());
  const [expandedAxonEvents, setExpandedAxonEvents] = useState<Set<number>>(new Set());
  const [rightTab, setRightTab] = useState<"activity" | "axon">("activity");
  const [showCommandPicker, setShowCommandPicker] = useState(false);
  const [commandPickerIndex, setCommandPickerIndex] = useState(0);

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

  useEffect(() => {
    axonEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [agent.axonEvents]);

  const toggleBlock = (id: string) => {
    setExpandedBlocks((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleStart = async () => {
    setActiveAgentType(selectedAgentType);

    const config: Record<string, unknown> = {
      launchCommands: launchCommands ? launchCommands.split("\n").filter(Boolean) : undefined,
      systemPrompt: systemPrompt || undefined,
    };

    if (selectedAgentType === "acp") {
      config.agentBinary = agentBinary;
      config.launchArgs = launchArgs ? launchArgs.split(/\s+/) : undefined;
    } else {
      config.blueprintName = blueprintName || undefined;
      config.model = model || undefined;
    }

    await agent.start(config);
  };

  const handleSend = async () => {
    if (!inputText.trim()) return;
    setShowCommandPicker(false);
    const text = inputText;
    setInputText("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    await agent.sendMessage(text);
  };

  const selectCommand = (cmd: AvailableCommand) => {
    setInputText(`/${cmd.name} `);
    setShowCommandPicker(false);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (showCommandPicker && filteredCommands.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setCommandPickerIndex((i) => Math.min(i + 1, filteredCommands.length - 1));
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

  const slashFilter =
    inputText.startsWith("/") && !inputText.includes(" ")
      ? inputText.slice(1).toLowerCase()
      : null;
  const filteredCommands =
    slashFilter !== null
      ? agent.availableCommands.filter((c) => c.name.toLowerCase().includes(slashFilter))
      : [];

  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputText(val);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";

    const isSlash = val.startsWith("/") && !val.includes(" ");
    if (isSlash && agent.availableCommands.length > 0) {
      setShowCommandPicker(true);
      setCommandPickerIndex(0);
    } else {
      setShowCommandPicker(false);
    }
  };

  const copyAxonEvent = useCallback((event: AxonEventView) => {
    let parsedPayload: unknown = event.payload;
    try { parsedPayload = JSON.parse(event.payload); } catch { /* keep string */ }
    navigator.clipboard.writeText(JSON.stringify({ ...event, payload: parsedPayload }, null, 2));
  }, []);

  const copyAllAxonEvents = useCallback(() => {
    const all = agent.axonEvents.map((event) => {
      let parsedPayload: unknown = event.payload;
      try { parsedPayload = JSON.parse(event.payload); } catch { /* keep string */ }
      return { ...event, payload: parsedPayload };
    });
    navigator.clipboard.writeText(JSON.stringify(all, null, 2));
  }, [agent.axonEvents]);

  const handleShutdown = async () => {
    await agent.shutdown();
    setActiveAgentType(null);
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
            agentType={selectedAgentType}
            setAgentType={setSelectedAgentType}
            agentBinary={agentBinary}
            setAgentBinary={setAgentBinary}
            launchArgs={launchArgs}
            setLaunchArgs={setLaunchArgs}
            launchCommands={launchCommands}
            setLaunchCommands={setLaunchCommands}
            systemPrompt={systemPrompt}
            setSystemPrompt={setSystemPrompt}
            blueprintName={blueprintName}
            setBlueprintName={setBlueprintName}
            model={model}
            setModel={setModel}
            onStart={handleStart}
            connectionPhase={agent.connectionPhase}
            connectionStatus={agent.connectionStatus}
            error={agent.error}
          />
        </div>
      </div>
    );
  }

  const agentLabel = activeAgentType === "claude" ? "Claude Code" : "ACP Agent";

  return (
    <div className="app">
      <div className="header">
        <h1>{agentLabel}</h1>
        <div className="status-bar">
          <div className={`status-dot ${agent.connectionPhase === "ready" ? "ready" : "connecting"}`} />
          <div className="status-ids">
            {agent.devboxId && (
              <div className="status-id">
                devbox:{" "}
                {agent.runloopUrl ? (
                  <a href={`${agent.runloopUrl.replace("api", "platform")}/devboxes/${agent.devboxId}`} target="_blank" rel="noopener noreferrer">
                    {agent.devboxId}
                  </a>
                ) : (
                  <span>{agent.devboxId}</span>
                )}
              </div>
            )}
            {agent.axonId && <div className="status-id">axon: <span>{agent.axonId}</span></div>}
            {agent.sessionId && <div className="status-id">session: <span>{agent.sessionId}</span></div>}
          </div>
          <button className="btn btn-danger" onClick={handleShutdown}>Shutdown</button>
        </div>
      </div>

      <div className="main-area">
        {activeAgentType === "acp" && (
          <ControlsBar
            availableModes={agent.availableModes}
            currentMode={agent.currentMode}
            configOptions={agent.configOptions}
            availableModels={agent.availableModels}
            currentModelId={agent.currentModelId}
            autoApprovePermissions={agent.autoApprovePermissions}
            onSetMode={agent.setMode}
            onSetModel={agent.setACPModel}
            onSetConfigOption={agent.setConfigOption}
            onSetAutoApprovePermissions={agent.setAutoApprovePermissions}
          />
        )}

        {activeAgentType === "claude" && (
          <div className="controls-bar">
            <label className="config-toggle">
              <input
                type="checkbox"
                checked={agent.autoApprovePermissions}
                onChange={(e) => agent.setAutoApprovePermissions(e.target.checked)}
              />
              <span className="config-toggle-label">Auto-approve permissions</span>
            </label>
            {agent.initInfo && (
              <span className="config-label">Model: {agent.initInfo.model}</span>
            )}
          </div>
        )}

        <div className="chat-area" ref={chatAreaRef}>
          {agent.messages.length === 0 && !agent.isAgentTurn && (
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
                terminals={agent.terminals}
                isLive={false}
                stopReason={msg.stopReason}
              />
            ),
          )}

          {agent.currentTurnBlocks.length > 0 && (
            <AssistantTurn
              blocks={agent.currentTurnBlocks}
              expandedBlocks={expandedBlocks}
              onToggleBlock={toggleBlock}
              terminals={agent.terminals}
              isLive={agent.isAgentTurn}
            />
          )}

          {agent.pendingControlRequest && (
            <ControlRequestPrompt
              request={agent.pendingControlRequest}
              onRespond={agent.sendControlResponse}
            />
          )}

          {agent.pendingPermission && (
            <PermissionDialog
              permission={agent.pendingPermission}
              onAllow={agent.respondToPermission}
              onCancel={agent.cancelPermission}
            />
          )}

          {agent.pendingElicitation && (
            <ElicitationForm
              elicitation={agent.pendingElicitation}
              onRespond={agent.respondToElicitation}
            />
          )}

          <div ref={chatEndRef} />
        </div>

        <div className="input-bar">
          {showCommandPicker && filteredCommands.length > 0 && (
            <CommandPicker
              commands={filteredCommands}
              selectedIndex={commandPickerIndex}
              onSelect={selectCommand}
              onHover={setCommandPickerIndex}
            />
          )}
          <div className="input-row">
            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={handleTextareaInput}
              onKeyDown={handleKeyDown}
              placeholder="Send a message..."
              rows={1}
              disabled={agent.connectionPhase !== "ready" || agent.isAgentTurn || agent.isSendingPrompt}
            />
            {agent.isAgentTurn ? (
              <button className="btn btn-cancel" onClick={agent.cancel}>Cancel</button>
            ) : (
              <button
                className="btn-send"
                onClick={handleSend}
                disabled={!inputText.trim() || agent.connectionPhase !== "ready" || agent.isSendingPrompt}
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
            {agent.messages.length + agent.currentTurnBlocks.length > 0 && (
              <span className="tab-count">
                {agent.messages.reduce((s, m) => s + (m.blocks?.length ?? 0), 0) + agent.currentTurnBlocks.length}
              </span>
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
                <button className="btn btn-ghost btn-copy-all" onClick={copyAllAxonEvents}>Copy All</button>
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
                onCopy={() => copyAxonEvent(event)}
              />
            ))}
            <div ref={axonEndRef} />
          </div>
        )}
      </div>
    </div>
  );
}
