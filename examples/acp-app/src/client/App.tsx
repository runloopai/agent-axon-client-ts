import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type KeyboardEvent,
} from "react";
import {
  useNodeAgent,
  type AvailableCommand,
  type AxonEventView,
} from "./hooks/useNodeAgent.js";

import { SetupCard } from "./components/SetupCard.js";
import { ControlsBar } from "./components/ControlsBar.js";
import { ConnectionInfoBanner } from "./components/Banners.js";
import { AssistantTurn } from "./components/AssistantTurn.js";
import { ElicitationForm } from "./components/ElicitationForm.js";
import { CommandPicker } from "./components/CommandPicker.js";
import { UsageBar } from "./components/UsageBar.js";
import {
  FileOpItem,
  TerminalCard,
} from "./components/ActivityPanel.js";
import { AxonEventItem } from "./components/AxonEventItem.js";
import { TurnBlocksInspector } from "./components/TurnBlocksInspector.js";

export default function App() {
  const agent = useNodeAgent();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatAreaRef = useRef<HTMLDivElement>(null);
  const axonEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [agentBinary, setAgentBinary] = useState("opencode");
  const [launchArgs, setLaunchArgs] = useState("acp");
  const [launchCommands, setLaunchCommands] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [inputText, setInputText] = useState("");
  const [expandedBlocks, setExpandedBlocks] = useState<Set<string>>(new Set());
  const [expandedAxonEvents, setExpandedAxonEvents] = useState<Set<number>>(
    new Set(),
  );
  const [rightTab, setRightTab] = useState<"activity" | "axon">("activity");
  const [expandedTerminal, setExpandedTerminal] = useState<string | null>(null);
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
    await agent.start({
      agentBinary,
      launchArgs: launchArgs ? launchArgs.split(/\s+/) : undefined,
      launchCommands: launchCommands
        ? launchCommands.split("\n").filter(Boolean)
        : undefined,
      systemPrompt: systemPrompt || undefined,
    });
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
    if (cmd.input) {
      setInputText(`/${cmd.name} `);
      setShowCommandPicker(false);
      textareaRef.current?.focus();
    } else {
      setInputText("");
      setShowCommandPicker(false);
      if (textareaRef.current) textareaRef.current.style.height = "auto";
      agent.sendMessage(`/${cmd.name}`);
    }
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

  const slashFilter =
    inputText.startsWith("/") && !inputText.includes(" ")
      ? inputText.slice(1).toLowerCase()
      : null;
  const filteredCommands =
    slashFilter !== null
      ? agent.availableCommands.filter((c) =>
          c.name.toLowerCase().includes(slashFilter),
        )
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
    try {
      parsedPayload = JSON.parse(event.payload);
    } catch {
      /* keep string */
    }
    navigator.clipboard.writeText(
      JSON.stringify({ ...event, payload: parsedPayload }, null, 2),
    );
  }, []);

  const copyAllAxonEvents = useCallback(() => {
    const all = agent.axonEvents.map((event) => {
      let parsedPayload: unknown = event.payload;
      try {
        parsedPayload = JSON.parse(event.payload);
      } catch {
        /* keep string */
      }
      return { ...event, payload: parsedPayload };
    });
    navigator.clipboard.writeText(JSON.stringify(all, null, 2));
  }, [agent.axonEvents]);

  if (
    agent.connectionPhase === "idle" ||
    agent.connectionPhase === "error" ||
    agent.connectionPhase === "connecting"
  ) {
    return (
      <div className="app">
        <div className="setup-panel">
          <SetupCard
            agentBinary={agentBinary}
            setAgentBinary={setAgentBinary}
            launchArgs={launchArgs}
            setLaunchArgs={setLaunchArgs}
            launchCommands={launchCommands}
            setLaunchCommands={setLaunchCommands}
            systemPrompt={systemPrompt}
            setSystemPrompt={setSystemPrompt}
            onStart={handleStart}
            connectionPhase={agent.connectionPhase}
            error={agent.error}
          />
        </div>
      </div>
    );
  }

  const terminalArray = Array.from(agent.terminals.values());

  return (
    <div className="app">
      <div className="header">
        <h1>Node ACP Demo</h1>
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
                axon: <span>{agent.axonId}</span>
              </div>
            )}
            {agent.sessionId && (
              <div className="status-id">
                session: <span>{agent.sessionId}</span>
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
        {(agent.availableModes.length > 0 ||
          agent.configOptions.length > 0 ||
          agent.availableModels.length > 0) && (
          <ControlsBar
            availableModes={agent.availableModes}
            currentMode={agent.currentMode}
            configOptions={agent.configOptions}
            availableModels={agent.availableModels}
            currentModelId={agent.currentModelId}
            onSetMode={agent.setMode}
            onSetModel={agent.setModel}
            onSetConfigOption={agent.setConfigOption}
          />
        )}

        <div className="chat-area" ref={chatAreaRef}>
          {agent.agentInfo && (
            <ConnectionInfoBanner
              info={agent.agentInfo}
              connectionDetails={agent.connectionDetails}
              sessionId={agent.sessionId}
              currentMode={agent.currentMode}
              availableModes={agent.availableModes}
              availableCommands={agent.availableCommands}
              authMethods={agent.authMethods}
              isAuthenticated={agent.isAuthenticated}
              authDismissed={agent.authDismissed}
              onAuthenticate={agent.authenticate}
              onDismissAuth={agent.dismissAuth}
            />
          )}

          {agent.messages.length === 0 &&
            !agent.isAgentTurn &&
            !agent.agentInfo && (
              <div className="empty-state">
                Send a message to start chatting
              </div>
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
          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={handleTextareaInput}
            onKeyDown={handleKeyDown}
            placeholder="Send a message"
            rows={1}
            disabled={agent.connectionPhase !== "ready" || agent.isAgentTurn}
          />
          {agent.isAgentTurn ? (
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
            className={`sidebar-tab ${rightTab === "activity" ? "active" : ""}`}
            onClick={() => setRightTab("activity")}
          >
            Activity
            {agent.messages.length + agent.currentTurnBlocks.length > 0 && (
              <span className="tab-count">
                {agent.messages.reduce((s, m) => s + (m.blocks?.length ?? 0), 0) +
                  agent.currentTurnBlocks.length}
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
              expandedBlocks={expandedBlocks}
              onToggleBlock={toggleBlock}
            />

            {terminalArray.length > 0 && (
              <div className="activity-section">
                <div className="activity-section-title">Local Terminals</div>
                {terminalArray.map((term) => (
                  <TerminalCard
                    key={term.terminalId}
                    terminal={term}
                    expanded={expandedTerminal === term.terminalId}
                    onToggle={() =>
                      setExpandedTerminal(
                        expandedTerminal === term.terminalId
                          ? null
                          : term.terminalId,
                      )
                    }
                  />
                ))}
              </div>
            )}

            {agent.fileOps.length > 0 && (
              <div className="activity-section">
                <div className="activity-section-title">
                  Local File Operations
                </div>
                {agent.fileOps.map((op) => (
                  <FileOpItem key={op.id} op={op} />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="events-list">
            {agent.axonEvents.length > 0 && (
              <div className="events-list-toolbar">
                <button
                  className="btn btn-ghost btn-copy-all"
                  onClick={copyAllAxonEvents}
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
