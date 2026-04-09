import { useState, useRef, useCallback, useEffect } from "react";
import { extractClaudeUserMessage } from "@runloop/agent-axon-client/claude";
import type { ClaudeTimelineEvent } from "@runloop/agent-axon-client/claude";
import type { WsEvent } from "../../server/ws.js";
import type {
  TurnBlock,
  ChatMessage,
  UsageState,
  InitInfo,
  PendingControlRequest,
  ControlRequestQuestion,
  TaskBlock,
  PlanEntry,
  AxonEventView,
  ToolCallBlock,
  ClaudeInitExtensions,
} from "../types.js";
import { nextBlockId, inferToolKind } from "./parsers.js";
import { api } from "./api.js";

export interface UseClaudeAgentReturn {
  connectionPhase: "idle" | "connecting" | "ready" | "error";
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
  axonEvents: AxonEventView[];
  timelineEvents: ClaudeTimelineEvent[];
  pendingControlRequest: PendingControlRequest | null;
  start: (config: { blueprintName?: string; launchCommands?: string[]; systemPrompt?: string; model?: string; autoApprovePermissions?: boolean }) => Promise<void>;
  sendMessage: (text: string, content?: Array<{ type: string; [key: string]: unknown }>) => Promise<void>;
  cancel: () => Promise<void>;
  setModel: (model: string) => Promise<void>;
  setPermissionMode: (mode: string) => Promise<void>;
  setAutoApprovePermissions: (enabled: boolean) => Promise<void>;
  sendControlResponse: (requestId: string, response: Record<string, unknown>) => Promise<void>;
  shutdown: () => Promise<void>;
}

export function useClaudeAgent(agentId: string | null): UseClaudeAgentReturn {
  const [connectionPhase, setConnectionPhase] = useState<"idle" | "connecting" | "ready" | "error">("idle");
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
  const [timelineEvents, setTimelineEvents] = useState<ClaudeTimelineEvent[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const blocksRef = useRef<TurnBlock[]>([]);
  const thinkingStartRef = useRef<number | null>(null);
  const activeBlockIndexRef = useRef<Map<number, string>>(new Map());

  function resetAllState() {
    setConnectionStatus(null);
    setError(null);
    setIsSendingPrompt(false);
    setMessages([]);
    setCurrentTurnBlocks([]);
    setIsAgentTurn(false);
    setIsStreaming(false);
    setUsage(null);
    setInitInfo(null);
    setDevboxId(null);
    setAxonId(null);
    setRunloopUrl(null);
    setPermissionMode(null);
    setCurrentModel(null);
    setPendingControlRequest(null);
    setAutoApprovePermissionsState(true);
    setAxonEvents([]);
    setTimelineEvents([]);
    blocksRef.current = [];
    thinkingStartRef.current = null;
    activeBlockIndexRef.current.clear();
  }

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

  function handleSDKMessage(msg: Record<string, unknown>): void {
    const msgType = msg.type as string;

    switch (msgType) {
      case "stream_event": {
        const event = msg.event as Record<string, unknown>;
        if (!event) break;
        handleStreamEvent(event);
        break;
      }

      case "user": {
        const message = msg.message as Record<string, unknown>;
        if (!message) break;
        const content = message.content as Array<Record<string, unknown>>;
        if (!Array.isArray(content)) break;

        const toolUseResult = msg.tool_use_result as Record<string, unknown> | undefined;
        if (toolUseResult?.newTodos) {
          const newTodos = toolUseResult.newTodos as Array<Record<string, unknown>>;
          const entries: PlanEntry[] = newTodos.map((t) => ({
            content: (t.content as string) ?? "",
            status: (t.status as PlanEntry["status"]) ?? "pending",
            priority: null,
          }));

          const existingPlan = blocksRef.current.find((b) => b.type === "plan");
          if (existingPlan) {
            updateBlocks((blocks) =>
              blocks.map((b) =>
                b.type === "plan" ? { ...b, entries } : b,
              ),
            );
          } else {
            pushBlock({ type: "plan", id: nextBlockId("plan"), entries });
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
                if (b.type !== "tool_call" || b.toolCallId !== toolUseId) return b;
                const tc = b as ToolCallBlock;
                const isFinishing = tc.status !== "completed" && tc.status !== "failed";
                return {
                  ...tc,
                  rawOutput: outputText || tc.rawOutput,
                  content: outputText ? [{ type: "content" as const, text: outputText }] : tc.content,
                  status: isError ? "failed" as const : "completed" as const,
                  duration: isFinishing
                    ? Math.round((Date.now() - tc.startedAt) / 1000 * 10) / 10
                    : tc.duration,
                };
              }),
            );
          }
        }
        break;
      }

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
            const toolName = (block.name as string) ?? "unknown";
            pushBlock({
              type: "tool_call",
              id: nextBlockId("tc"),
              toolCallId: (block.id as string) ?? "",
              title: toolName,
              kind: inferToolKind(toolName),
              status: "in_progress",
              locations: [],
              content: [],
              rawInput: block.input ?? null,
              rawOutput: null,
              startedAt: Date.now(),
              duration: null,
              extra: { toolName },
            });
          }
        }
        break;
      }

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

      case "system": {
        const subtype = msg.subtype as string;
        switch (subtype) {
          case "init": {
            const tools = (msg.tools as string[]) ?? [];
            const mcpServers = (msg.mcp_servers as Array<{ name: string; status: string }>) ?? [];
            const initPermissionMode = (msg.permissionMode as string) ?? "default";
            const slashCommands = (msg.slash_commands as string[]) ?? [];
            const initModel = (msg.model as string) ?? "unknown";

            setInitInfo((prev) => {
              if (prev) {
                setCurrentModel(initModel ?? null);
                setPermissionMode(initPermissionMode ?? null);
                return { ...prev, model: initModel, tools, mcpServers, permissionMode: initPermissionMode, slashCommands };
              }

              setCurrentModel(initModel ?? null);
              setPermissionMode(initPermissionMode ?? null);

              const extensions: ClaudeInitExtensions = {
                protocol: "claude",
                tools,
                mcpServers,
                permissionMode: initPermissionMode,
              };
              pushBlock({
                type: "system_init",
                id: nextBlockId("init"),
                agentName: "Claude Code",
                agentVersion: null,
                model: initModel,
                commands: slashCommands,
                extensions,
                extra: { ...msg },
              });

              return { model: initModel, tools, mcpServers, permissionMode: initPermissionMode, slashCommands };
            });
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

      case "tool_progress": {
        const toolUseId = msg.tool_use_id as string;
        updateBlocks((blocks) =>
          blocks.map((b) =>
            b.type === "tool_call" && b.toolCallId === toolUseId
              ? { ...b, status: "in_progress" as const }
              : b,
          ),
        );
        break;
      }

      case "rate_limit_event": {
        const info = msg.rate_limit_info as Record<string, unknown>;
        if (info?.status === "rejected") {
          setError(`Rate limited. Resets at: ${info.resetsAt}`);
        }
        break;
      }
    }
  }

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
          const toolName = (contentBlock.name as string) ?? "unknown";
          pushBlock({
            type: "tool_call",
            id: blockId,
            toolCallId: (contentBlock.id as string) ?? "",
            title: toolName,
            kind: inferToolKind(toolName),
            status: "pending",
            locations: [],
            content: [],
            rawInput: null,
            rawOutput: null,
            startedAt: Date.now(),
            duration: null,
            extra: { toolName },
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
        }
        break;
      }

      case "content_block_stop": {
        const index = event.index as number;
        const blockId = activeBlockIndexRef.current.get(index);
        if (blockId) {
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
        break;
    }
  }

  function handleControlRequest(msg: Record<string, unknown>): void {
    const requestId = msg.request_id as string;
    const request = msg.request as Record<string, unknown>;
    if (!request || request.subtype !== "can_use_tool") return;

    const toolName = request.tool_name as string;
    const toolUseId = request.tool_use_id as string;
    const input = request.input as Record<string, unknown>;
    const questions = (input?.questions as ControlRequestQuestion[]) ?? [];

    setPendingControlRequest({
      requestId,
      toolName,
      toolUseId,
      questions,
      rawRequest: msg,
    });
  }

  function handleTimelineEvent(tlEvent: ClaudeTimelineEvent): void {
    setTimelineEvents((prev) => [...prev, tlEvent]);
    setAxonEvents((prev) => [...prev, tlEvent.axonEvent]);

    const userMsg = extractClaudeUserMessage(tlEvent.data, tlEvent.axonEvent);
    if (userMsg) {
      setMessages((prev) => [
        ...prev,
        {
          id: `user-${userMsg.sequence}`,
          role: "user" as const,
          content: userMsg.text,
        },
      ]);
      return;
    }

    if (tlEvent.kind === "claude_protocol") {
      handleSDKMessage(tlEvent.data as Record<string, unknown>);
    }
  }

  useEffect(() => {
    resetAllState();

    if (!agentId) {
      wsRef.current?.close();
      wsRef.current = null;
      setConnectionPhase("idle");
      return;
    }

    setConnectionPhase("connecting");

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const socket = new WebSocket(wsUrl);
    wsRef.current = socket;

    socket.onmessage = (ev) => {
      let parsed: WsEvent;
      try {
        parsed = JSON.parse(ev.data);
      } catch {
        return;
      }

      if (parsed.agentId !== agentId) return;

      if (parsed.type === "timeline_event") {
        handleTimelineEvent(parsed.event as ClaudeTimelineEvent);
        return;
      }

      if (parsed.type === "connection_progress") {
        setConnectionStatus(parsed.step);
        return;
      }

      if (parsed.type === "control_request") {
        handleControlRequest(parsed.controlRequest as Record<string, unknown>);
      } else if (parsed.type === "turn_error") {
        finalizeTurn();
        setError(parsed.error);
      }
    };

    socket.onopen = () => {
      setConnectionPhase("ready");
      api("/api/subscribe", { agentId }).catch(() => {});
    };

    socket.onclose = () => {
      wsRef.current = null;
    };

    return () => {
      socket.close();
      wsRef.current = null;
    };
  }, [agentId]);

  const start = useCallback(async (_config: { blueprintName?: string; launchCommands?: string[]; systemPrompt?: string; model?: string; autoApprovePermissions?: boolean }) => {
    // Start is handled by App.tsx directly via /api/start
  }, []);

  const sendMessage = useCallback(async (text: string, content?: Array<{ type: string; [key: string]: unknown }>) => {
    if (!text.trim() && (!content || content.length === 0)) return;

    blocksRef.current = [];
    thinkingStartRef.current = null;
    activeBlockIndexRef.current.clear();
    setCurrentTurnBlocks([]);
    setIsAgentTurn(true);
    setIsStreaming(false);

    setIsSendingPrompt(true);
    try {
      if (content && content.length > 0) {
        await api("/api/prompt", { agentId, content });
      } else {
        await api("/api/prompt", { agentId, text });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSendingPrompt(false);
    }
  }, [agentId]);

  const cancel = useCallback(async () => {
    try { await api("/api/cancel", { agentId }); } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [agentId]);

  const setModelAction = useCallback(async (model: string) => {
    try { await api("/api/set-model", { agentId, model }); } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [agentId]);

  const setPermissionModeAction = useCallback(async (mode: string) => {
    try { await api("/api/set-permission-mode", { agentId, mode }); } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [agentId]);

  const setAutoApprovePermissions = useCallback(async (enabled: boolean) => {
    setAutoApprovePermissionsState(enabled);
    try { await api("/api/set-auto-approve-permissions", { agentId, enabled }); } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [agentId]);

  const sendControlResponse = useCallback(async (requestId: string, response: Record<string, unknown>) => {
    try {
      await api("/api/control-response", { agentId, requestId, response });
      setPendingControlRequest(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [agentId]);

  const shutdown = useCallback(async () => {
    try { await api("/api/shutdown", { agentId }); } catch { /* ignore */ }
    wsRef.current?.close();
    wsRef.current = null;
    setConnectionPhase("idle");
    resetAllState();
  }, [agentId]);

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
    timelineEvents,
    pendingControlRequest,
    start,
    sendMessage,
    cancel,
    setModel: setModelAction,
    setPermissionMode: setPermissionModeAction,
    setAutoApprovePermissions,
    sendControlResponse,
    shutdown,
  };
}
