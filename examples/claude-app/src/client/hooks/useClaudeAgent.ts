import { useState, useRef, useCallback, useEffect } from "react";
import type { AxonEventView } from "@runloop/agent-axon-client/claude";
import type { WsEvent } from "../../server/ws.ts";

export type { AxonEventView } from "@runloop/agent-axon-client/claude";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConnectionPhase = "idle" | "connecting" | "ready" | "error";

export interface ThinkingBlock {
  type: "thinking";
  id: string;
  text: string;
  duration: number | null;
  isActive: boolean;
}

export interface ToolCallBlock {
  type: "tool_call";
  id: string;
  toolUseId: string;
  toolName: string;
  input: unknown;
  output: string | null;
  status: "pending" | "running" | "completed" | "failed";
  startedAt: number;
  duration?: number | null;
}

export interface TextBlock {
  type: "text";
  id: string;
  text: string;
}

export interface TaskBlock {
  type: "task";
  id: string;
  taskId: string;
  description: string;
  status: "started" | "in_progress" | "completed" | "failed" | "stopped";
  summary?: string;
  toolUses?: number;
}

export interface TodoEntry {
  content: string;
  status: "pending" | "in_progress" | "completed";
  activeForm?: string;
}

export interface TodoBlock {
  type: "todo";
  id: string;
  entries: TodoEntry[];
}

export type TurnBlock = ThinkingBlock | ToolCallBlock | TextBlock | TaskBlock | TodoBlock;

/**
 * A question option within a can_use_tool AskUserQuestion control request.
 */
export interface ControlRequestOption {
  label: string;
  description?: string;
}

/**
 * A single question from an AskUserQuestion control request.
 */
export interface ControlRequestQuestion {
  header: string;
  question: string;
  multiSelect: boolean;
  options: ControlRequestOption[];
}

/**
 * Represents a pending control request from Claude Code that requires
 * user interaction — e.g. answering a question before the tool can proceed.
 */
export interface PendingControlRequest {
  requestId: string;
  toolName: string;
  toolUseId: string;
  questions: ControlRequestQuestion[];
  rawRequest: Record<string, unknown>;
}

export interface UserAttachment {
  type: "image" | "file";
  name?: string;
  data?: string;
  mimeType?: string;
  text?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: UserAttachment[];
  blocks?: TurnBlock[];
  stopReason?: string;
  cost?: number;
  numTurns?: number;
  durationMs?: number;
}

export interface UsageState {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
}

export interface InitInfo {
  model: string;
  tools: string[];
  mcpServers: Array<{ name: string; status: string }>;
  permissionMode: string;
  slashCommands: string[];
}

export interface UseClaudeAgentReturn {
  connectionPhase: ConnectionPhase;
  connectionStatus: string | null;
  error: string | null;
  messages: ChatMessage[];
  currentTurnBlocks: TurnBlock[];
  isAgentTurn: boolean;
  isStreaming: boolean;
  isSendingPrompt: boolean;
  usage: UsageState | null;
  initInfo: InitInfo | null;
  devboxId: string | null;
  axonId: string | null;
  runloopUrl: string | null;
  permissionMode: string | null;
  currentModel: string | null;
  autoApprovePermissions: boolean;
  /** Raw Axon events for the event viewer. */
  axonEvents: AxonEventView[];
  /** A pending control request awaiting user input (e.g. AskUserQuestion), or null. */
  pendingControlRequest: PendingControlRequest | null;
  start: (config: { blueprintName?: string; launchCommands?: string[]; systemPrompt?: string; model?: string; autoApprovePermissions?: boolean }) => Promise<void>;
  sendMessage: (text: string, content?: Array<{ type: string; [key: string]: unknown }>) => Promise<void>;
  cancel: () => Promise<void>;
  setModel: (model: string) => Promise<void>;
  setPermissionMode: (mode: string) => Promise<void>;
  setAutoApprovePermissions: (enabled: boolean) => Promise<void>;
  /** Send a control response for a pending control request (e.g. user answered a question). */
  sendControlResponse: (requestId: string, response: Record<string, unknown>) => Promise<void>;
  shutdown: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function api<T = unknown>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body !== undefined ? "POST" : "GET",
    headers: body !== undefined ? { "Content-Type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json as T;
}

let blockIdCounter = 0;
function nextBlockId(prefix: string): string {
  return `${prefix}-${++blockIdCounter}`;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useClaudeAgent(): UseClaudeAgentReturn {
  const [connectionPhase, setConnectionPhase] = useState<ConnectionPhase>("idle");
  const [connectionStatus, setConnectionStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSendingPrompt, setIsSendingPrompt] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentTurnBlocks, setCurrentTurnBlocks] = useState<TurnBlock[]>([]);
  const [isAgentTurn, setIsAgentTurn] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [usage, setUsage] = useState<UsageState | null>(null);
  const [initInfo, setInitInfo] = useState<InitInfo | null>(null);
  const [devboxId, setDevboxId] = useState<string | null>(null);
  const [axonId, setAxonId] = useState<string | null>(null);
  const [runloopUrl, setRunloopUrl] = useState<string | null>(null);
  const [permissionMode, setPermissionMode] = useState<string | null>(null);
  const [currentModel, setCurrentModel] = useState<string | null>(null);
  const [pendingControlRequest, setPendingControlRequest] = useState<PendingControlRequest | null>(null);
  const [autoApprovePermissions, setAutoApprovePermissionsState] = useState(true);
  const [axonEvents, setAxonEvents] = useState<AxonEventView[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const blocksRef = useRef<TurnBlock[]>([]);
  const thinkingStartRef = useRef<number | null>(null);

  // Active content block tracking for stream_event processing
  const activeBlockIndexRef = useRef<Map<number, string>>(new Map());

  function pushBlock(block: TurnBlock) {
    blocksRef.current = [...blocksRef.current, block];
    setCurrentTurnBlocks(blocksRef.current);
  }

  function updateBlocks(updater: (blocks: TurnBlock[]) => TurnBlock[]) {
    blocksRef.current = updater(blocksRef.current);
    setCurrentTurnBlocks(blocksRef.current);
  }

  function lastBlock(): TurnBlock | undefined {
    return blocksRef.current[blocksRef.current.length - 1];
  }

  function finalizeThinking() {
    if (!thinkingStartRef.current) return;
    const duration = Math.round((Date.now() - thinkingStartRef.current) / 1000);
    updateBlocks((blocks) =>
      blocks.map((b) =>
        b.type === "thinking" && b.isActive
          ? { ...b, isActive: false, duration }
          : b,
      ),
    );
    thinkingStartRef.current = null;
  }

  function finalizeTurn(stopReason?: string, cost?: number, numTurns?: number, durationMs?: number) {
    finalizeThinking();
    const turnBlocks = blocksRef.current;
    if (turnBlocks.length > 0) {
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: "",
          blocks: turnBlocks,
          ...(stopReason ? { stopReason } : {}),
          ...(cost != null ? { cost } : {}),
          ...(numTurns != null ? { numTurns } : {}),
          ...(durationMs != null ? { durationMs } : {}),
        },
      ]);
    }
    blocksRef.current = [];
    thinkingStartRef.current = null;
    activeBlockIndexRef.current.clear();
    setCurrentTurnBlocks([]);
    setIsAgentTurn(false);
    setIsStreaming(false);
  }

  // ---------------------------------------------------------------------------
  // SDKMessage processing
  // ---------------------------------------------------------------------------

  function handleSDKMessage(msg: Record<string, unknown>): void {
    const msgType = msg.type as string;

    switch (msgType) {
      // ── stream_event: real-time streaming deltas ──
      case "stream_event": {
        const event = msg.event as Record<string, unknown>;
        if (!event) break;
        handleStreamEvent(event);
        break;
      }

      // ── user: tool results come back as user messages ──
      case "user": {
        const message = msg.message as Record<string, unknown>;
        if (!message) break;
        const content = message.content as Array<Record<string, unknown>>;
        if (!Array.isArray(content)) break;

        // Check for TodoWrite results in tool_use_result
        const toolUseResult = msg.tool_use_result as Record<string, unknown> | undefined;
        if (toolUseResult?.newTodos) {
          const newTodos = toolUseResult.newTodos as Array<Record<string, unknown>>;
          const entries: TodoEntry[] = newTodos.map((t) => ({
            content: (t.content as string) ?? "",
            status: (t.status as TodoEntry["status"]) ?? "pending",
            activeForm: t.activeForm as string | undefined,
          }));

          const existingTodo = blocksRef.current.find((b) => b.type === "todo");
          if (existingTodo) {
            updateBlocks((blocks) =>
              blocks.map((b) =>
                b.type === "todo" ? { ...b, entries } : b,
              ),
            );
          } else {
            pushBlock({ type: "todo", id: nextBlockId("todo"), entries });
          }
        }

        for (const block of content) {
          if (block.type === "tool_result") {
            const toolUseId = block.tool_use_id as string;
            const resultContent = block.content as unknown;
            let outputText = "";
            if (typeof resultContent === "string") {
              outputText = resultContent;
            } else if (Array.isArray(resultContent)) {
              outputText = resultContent
                .filter((c: Record<string, unknown>) => c.type === "text")
                .map((c: Record<string, unknown>) => c.text as string)
                .join("\n");
            }
            const isError = block.is_error === true;

            updateBlocks((blocks) =>
              blocks.map((b) => {
                if (b.type !== "tool_call" || b.toolUseId !== toolUseId) return b;
                const isFinishing = b.status !== "completed" && b.status !== "failed";
                return {
                  ...b,
                  output: outputText || b.output,
                  status: isError ? "failed" : "completed",
                  duration: isFinishing
                    ? Math.round((Date.now() - b.startedAt) / 1000 * 10) / 10
                    : b.duration,
                };
              }),
            );
          }
        }
        break;
      }

      // ── assistant: complete message with all content blocks ──
      case "assistant": {
        const message = msg.message as Record<string, unknown>;
        if (!message) break;
        const content = message.content as Array<Record<string, unknown>>;
        if (!Array.isArray(content)) break;

        setIsAgentTurn(true);

        for (const block of content) {
          if (block.type === "thinking") {
            finalizeThinking();
            pushBlock({
              type: "thinking",
              id: nextBlockId("think"),
              text: (block.thinking as string) ?? "",
              duration: null,
              isActive: false,
            });
          } else if (block.type === "text") {
            finalizeThinking();
            pushBlock({
              type: "text",
              id: nextBlockId("txt"),
              text: (block.text as string) ?? "",
            });
          } else if (block.type === "tool_use") {
            finalizeThinking();
            pushBlock({
              type: "tool_call",
              id: nextBlockId("tc"),
              toolUseId: (block.id as string) ?? "",
              toolName: (block.name as string) ?? "unknown",
              input: block.input ?? null,
              output: null,
              status: "running",
              startedAt: Date.now(),
              duration: null,
            });
          }
        }

        const errorType = msg.error as string | undefined;
        if (errorType) {
          setError(`Assistant error: ${errorType}`);
        }
        break;
      }

      // ── result: turn complete ──
      case "result": {
        const isError = msg.is_error as boolean;
        const stopReason = (msg.stop_reason as string) ?? (isError ? msg.subtype as string : undefined);
        const cost = msg.total_cost_usd as number | undefined;
        const numTurns = msg.num_turns as number | undefined;
        const durationMs = msg.duration_ms as number | undefined;
        const msgUsage = msg.usage as Record<string, number> | undefined;

        if (msgUsage) {
          setUsage({
            inputTokens: msgUsage.input_tokens ?? 0,
            outputTokens: msgUsage.output_tokens ?? 0,
            cacheCreationInputTokens: msgUsage.cache_creation_input_tokens ?? 0,
            cacheReadInputTokens: msgUsage.cache_read_input_tokens ?? 0,
          });
        }

        if (isError) {
          const errors = msg.errors as string[] | undefined;
          const userErrors = errors?.filter((e) => !e.startsWith("[ede_diagnostic]"));
          if (userErrors?.length) {
            setError(userErrors.join("; "));
          }
        }

        finalizeTurn(stopReason ?? undefined, cost, numTurns, durationMs);
        break;
      }

      // ── system: init, status, tasks, etc. ──
      case "system": {
        const subtype = msg.subtype as string;
        switch (subtype) {
          case "init": {
            setInitInfo({
              model: (msg.model as string) ?? "unknown",
              tools: (msg.tools as string[]) ?? [],
              mcpServers: (msg.mcp_servers as Array<{ name: string; status: string }>) ?? [],
              permissionMode: (msg.permissionMode as string) ?? "default",
              slashCommands: (msg.slash_commands as string[]) ?? [],
            });
            setCurrentModel((msg.model as string) ?? null);
            setPermissionMode((msg.permissionMode as string) ?? null);
            break;
          }
          case "status": {
            const mode = msg.permissionMode as string | undefined;
            if (mode) setPermissionMode(mode);
            break;
          }
          case "task_started": {
            pushBlock({
              type: "task",
              id: nextBlockId("task"),
              taskId: (msg.task_id as string) ?? "",
              description: (msg.description as string) ?? "",
              status: "started",
            });
            setIsAgentTurn(true);
            break;
          }
          case "task_progress": {
            const taskId = msg.task_id as string;
            const description = msg.description as string;
            const taskUsage = msg.usage as Record<string, number> | undefined;
            updateBlocks((blocks) =>
              blocks.map((b) =>
                b.type === "task" && b.taskId === taskId
                  ? {
                      ...b,
                      status: "in_progress" as const,
                      description,
                      toolUses: taskUsage?.tool_uses,
                    }
                  : b,
              ),
            );
            break;
          }
          case "task_notification": {
            const taskId = msg.task_id as string;
            const status = msg.status as string;
            const summary = msg.summary as string;
            updateBlocks((blocks) =>
              blocks.map((b) =>
                b.type === "task" && b.taskId === taskId
                  ? { ...b, status: status as TaskBlock["status"], summary }
                  : b,
              ),
            );
            break;
          }
        }
        break;
      }

      // ── tool_progress: tool execution updates ──
      case "tool_progress": {
        const toolUseId = msg.tool_use_id as string;
        updateBlocks((blocks) =>
          blocks.map((b) =>
            b.type === "tool_call" && b.toolUseId === toolUseId
              ? { ...b, status: "running" as const }
              : b,
          ),
        );
        break;
      }

      // ── rate_limit_event ──
      case "rate_limit_event": {
        const info = msg.rate_limit_info as Record<string, unknown>;
        if (info?.status === "rejected") {
          setError(`Rate limited. Resets at: ${info.resetsAt}`);
        }
        break;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Stream event processing (BetaRawMessageStreamEvent)
  // ---------------------------------------------------------------------------

  function handleStreamEvent(event: Record<string, unknown>): void {
    const eventType = event.type as string;

    switch (eventType) {
      case "content_block_start": {
        const index = event.index as number;
        const contentBlock = event.content_block as Record<string, unknown>;
        if (!contentBlock) break;

        const blockType = contentBlock.type as string;

        if (blockType === "thinking") {
          finalizeThinking();
          thinkingStartRef.current = Date.now();
          const blockId = nextBlockId("think");
          activeBlockIndexRef.current.set(index, blockId);
          pushBlock({
            type: "thinking",
            id: blockId,
            text: "",
            duration: null,
            isActive: true,
          });
          setIsAgentTurn(true);
        } else if (blockType === "text") {
          finalizeThinking();
          const blockId = nextBlockId("txt");
          activeBlockIndexRef.current.set(index, blockId);
          pushBlock({
            type: "text",
            id: blockId,
            text: "",
          });
          setIsStreaming(true);
          setIsAgentTurn(true);
        } else if (blockType === "tool_use") {
          finalizeThinking();
          const blockId = nextBlockId("tc");
          activeBlockIndexRef.current.set(index, blockId);
          pushBlock({
            type: "tool_call",
            id: blockId,
            toolUseId: (contentBlock.id as string) ?? "",
            toolName: (contentBlock.name as string) ?? "unknown",
            input: null,
            output: null,
            status: "pending",
            startedAt: Date.now(),
            duration: null,
          });
          setIsAgentTurn(true);
        }
        break;
      }

      case "content_block_delta": {
        const index = event.index as number;
        const delta = event.delta as Record<string, unknown>;
        if (!delta) break;

        const blockId = activeBlockIndexRef.current.get(index);
        if (!blockId) break;

        const deltaType = delta.type as string;

        if (deltaType === "thinking_delta") {
          const thinking = delta.thinking as string;
          if (thinking) {
            updateBlocks((blocks) =>
              blocks.map((b) =>
                b.id === blockId && b.type === "thinking"
                  ? { ...b, text: b.text + thinking }
                  : b,
              ),
            );
          }
        } else if (deltaType === "text_delta") {
          const text = delta.text as string;
          if (text) {
            updateBlocks((blocks) =>
              blocks.map((b) =>
                b.id === blockId && b.type === "text"
                  ? { ...b, text: b.text + text }
                  : b,
              ),
            );
          }
        } else if (deltaType === "input_json_delta") {
          // Tool input arrives as JSON deltas — we accumulate but don't need to display
          // The full input will come in the assistant message
        }
        break;
      }

      case "content_block_stop": {
        const index = event.index as number;
        const blockId = activeBlockIndexRef.current.get(index);
        if (blockId) {
          // Finalize thinking duration if this was a thinking block
          const block = blocksRef.current.find((b) => b.id === blockId);
          if (block?.type === "thinking" && block.isActive) {
            finalizeThinking();
          }
          activeBlockIndexRef.current.delete(index);
        }
        break;
      }

      case "message_start":
        setIsAgentTurn(true);
        break;

      case "message_delta": {
        // Contains stop_reason and usage at the end of a message
        const messageDelta = event.delta as Record<string, unknown>;
        const deltaUsage = event.usage as Record<string, number> | undefined;
        if (deltaUsage) {
          setUsage((prev) => ({
            inputTokens: prev?.inputTokens ?? 0,
            outputTokens: deltaUsage.output_tokens ?? prev?.outputTokens ?? 0,
            cacheCreationInputTokens: prev?.cacheCreationInputTokens ?? 0,
            cacheReadInputTokens: prev?.cacheReadInputTokens ?? 0,
          }));
        }
        break;
      }

      case "message_stop":
        // Message complete, but turn may continue (tool use → tool result loop)
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Incoming control request handling
  // ---------------------------------------------------------------------------

  /**
   * Handle a can_use_tool control request from the server.
   * Parses the request and sets it as the pending control request so the UI
   * can render an interactive prompt (e.g. multi-select for AskUserQuestion).
   */
  function handleControlRequest(msg: Record<string, unknown>): void {
    const requestId = msg.request_id as string;
    const request = msg.request as Record<string, unknown>;
    if (!request || request.subtype !== "can_use_tool") return;

    const toolName = request.tool_name as string;
    const toolUseId = request.tool_use_id as string;
    const input = request.input as Record<string, unknown>;
    const questions = (input?.questions as ControlRequestQuestion[]) ?? [];

    console.log(`[control] can_use_tool: tool=${toolName} id=${requestId} questions=${questions.length}`);

    setPendingControlRequest({
      requestId,
      toolName,
      toolUseId,
      questions,
      rawRequest: msg,
    });
  }

  // ---------------------------------------------------------------------------
  // WebSocket connection
  // ---------------------------------------------------------------------------

  const connectWs = useCallback(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const socket = new WebSocket(wsUrl);
    wsRef.current = socket;

    socket.onopen = () => {
      console.log("[ws] connected");
    };

    socket.onmessage = (ev) => {
      let parsed: WsEvent;
      try {
        parsed = JSON.parse(ev.data);
      } catch {
        return;
      }

      console.log("[ws] received:", parsed.type, parsed.type === "sdk_message" ? (parsed.message as any)?.type : "");

      if (parsed.type === "axon_event") {
        setAxonEvents((prev) => [...prev, parsed.event]);
        return;
      }

      if (parsed.type === "connection_progress") {
        setConnectionStatus(parsed.step);
        return;
      }

      if (parsed.type === "sdk_message") {
        handleSDKMessage(parsed.message as Record<string, unknown>);
      } else if (parsed.type === "control_request") {
        handleControlRequest(parsed.controlRequest as Record<string, unknown>);
      } else if (parsed.type === "turn_complete") {
        // Already handled via sdk_message result
      } else if (parsed.type === "turn_error") {
        finalizeTurn();
        setError(parsed.error ?? "Turn failed");
      }
    };

    socket.onclose = () => {
      wsRef.current = null;
    };
  }, []);

  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  // ---------------------------------------------------------------------------
  // API methods
  // ---------------------------------------------------------------------------

  const start = useCallback(
    async (config: { blueprintName?: string; launchCommands?: string[]; systemPrompt?: string; model?: string; autoApprovePermissions?: boolean }) => {
      try {
        setError(null);
        setConnectionPhase("connecting");
        if (config.autoApprovePermissions !== undefined) {
          setAutoApprovePermissionsState(config.autoApprovePermissions);
        }

        connectWs();

        const resp = await api<{
          devboxId: string;
          axonId: string;
          runloopUrl?: string;
        }>("/api/start", {
          blueprintName: config.blueprintName,
          launchCommands: config.launchCommands,
          systemPrompt: config.systemPrompt,
          model: config.model,
          autoApprovePermissions: config.autoApprovePermissions,
        });

        setDevboxId(resp.devboxId);
        setAxonId(resp.axonId);
        if (resp.runloopUrl) setRunloopUrl(resp.runloopUrl);

        setMessages([]);
        setCurrentTurnBlocks([]);
        blocksRef.current = [];
        setConnectionStatus(null);
        setConnectionPhase("ready");
      } catch (err) {
        setConnectionPhase("error");
        setConnectionStatus(null);
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [connectWs],
  );

  const sendMessage = useCallback(async (text: string, content?: Array<{ type: string; [key: string]: unknown }>) => {
    if (!text.trim() && (!content || content.length === 0)) return;

    const attachments: UserAttachment[] | undefined = content
      ?.filter((c) => c.type === "image" || c.type === "file")
      .map((c) => ({
        type: c.type as "image" | "file",
        name: c.name as string | undefined,
        data: c.data as string | undefined,
        mimeType: c.mimeType as string | undefined,
        text: c.text as string | undefined,
      }));

    setMessages((prev) => [
      ...prev,
      {
        id: `user-${Date.now()}`,
        role: "user",
        content: text,
        ...(attachments && attachments.length > 0 ? { attachments } : {}),
      },
    ]);

    blocksRef.current = [];
    thinkingStartRef.current = null;
    activeBlockIndexRef.current.clear();
    setCurrentTurnBlocks([]);
    setIsAgentTurn(true);
    setIsStreaming(false);

    setIsSendingPrompt(true);
    try {
      if (content && content.length > 0) {
        await api("/api/prompt", { content });
      } else {
        await api("/api/prompt", { text });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      finalizeTurn();
    } finally {
      setIsSendingPrompt(false);
    }
  }, []);

  const cancel = useCallback(async () => {
    try {
      await api("/api/cancel", {});
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const setModelFn = useCallback(async (model: string) => {
    setCurrentModel(model);
    try {
      await api("/api/set-model", { model });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const setPermissionModeFn = useCallback(async (mode: string) => {
    setPermissionMode(mode);
    try {
      await api("/api/set-permission-mode", { mode });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const setAutoApprovePermissions = useCallback(async (enabled: boolean) => {
    setAutoApprovePermissionsState(enabled);
    try {
      await api("/api/set-auto-approve-permissions", { enabled });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const sendControlResponse = useCallback(async (requestId: string, response: Record<string, unknown>) => {
    try {
      await api("/api/control-response", { requestId, response });
      setPendingControlRequest(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const shutdown = useCallback(async () => {
    try {
      await api("/api/shutdown", {});
    } catch {
      /* ignore */
    }
    wsRef.current?.close();
    wsRef.current = null;
    setConnectionPhase("idle");
    setConnectionStatus(null);
    setIsSendingPrompt(false);
    setDevboxId(null);
    setAxonId(null);
    setIsStreaming(false);
    setIsAgentTurn(false);
    setCurrentTurnBlocks([]);
    setUsage(null);
    setInitInfo(null);
    setPermissionMode(null);
    setCurrentModel(null);
    setPendingControlRequest(null);
    setAutoApprovePermissionsState(true);
    setAxonEvents([]);
  }, []);

  return {
    connectionPhase,
    connectionStatus,
    error,
    messages,
    currentTurnBlocks,
    isAgentTurn,
    isStreaming,
    isSendingPrompt,
    usage,
    initInfo,
    devboxId,
    axonId,
    runloopUrl,
    permissionMode,
    currentModel,
    autoApprovePermissions,
    axonEvents,
    pendingControlRequest,
    start,
    sendMessage,
    cancel,
    setModel: setModelFn,
    setPermissionMode: setPermissionModeFn,
    setAutoApprovePermissions,
    sendControlResponse,
    shutdown,
  };
}
