import { useState, useRef, useCallback, useEffect } from "react";
import {
  isAgentMessageChunk,
  isAgentThoughtChunk,
  isToolCall,
  isToolCallProgress,
  isPlan,
  isUsageUpdate,
  isSessionInfoUpdate,
  isCurrentModeUpdate,
  isConfigOptionUpdate,
  isAvailableCommandsUpdate,
} from "@runloop/agent-axon-client/acp";
import type { ToolCallContent, AuthMethod, ElicitationAction, SessionUpdate, ACPTimelineEvent } from "@runloop/agent-axon-client/acp";
import { extractACPUserMessage } from "@runloop/agent-axon-client/acp";
import type { WsEvent } from "../../server/ws.js";
import type {
  TurnBlock,
  ChatMessage,
  PlanEntry,
  UsageState,
  PendingPermission,
  PendingElicitation,
  ToolActivity,
  FileOp,
  TerminalState,
  SessionMode,
  ModelInfo,
  AvailableCommand,
  SessionConfigOption,
  AgentInfo,
  AgentCapabilities,
  ConnectionDetails,
  ACPInitExtensions,
  SessionInfo,
  AxonEventView,
  ToolCallBlock,
} from "../types.js";
import { parseToolCallContent, extractOutputText, nextBlockId } from "./parsers.js";
import { api } from "./api.js";

const NORMAL_END_REASONS = new Set(["end_turn", "endturn", "end turn"]);
function isNormalEndTurn(reason: string): boolean {
  return NORMAL_END_REASONS.has(reason.toLowerCase());
}

export interface UseACPAgentReturn {
  connectionPhase: "idle" | "connecting" | "ready" | "error";
  connectionStatus: string | null;
  error: string | null;
  messages: ChatMessage[];
  currentTurnBlocks: TurnBlock[];
  isAgentTurn: boolean;
  isStreaming: boolean;
  isSendingPrompt: boolean;
  usage: UsageState | null;
  plan: PlanEntry[] | null;
  toolActivity: ToolActivity[];
  fileOps: FileOp[];
  terminals: Map<string, TerminalState>;
  currentMode: string | null;
  availableModes: SessionMode[];
  configOptions: SessionConfigOption[];
  availableModels: ModelInfo[];
  currentModelId: string | null;
  pendingPermission: PendingPermission | null;
  autoApprovePermissions: boolean;
  pendingElicitation: PendingElicitation | null;
  devboxId: string | null;
  axonId: string | null;
  sessionId: string | null;
  runloopUrl: string | null;
  agentInfo: AgentInfo | null;
  connectionDetails: ConnectionDetails;
  authMethods: AuthMethod[];
  isAuthenticated: boolean;
  authDismissed: boolean;
  availableCommands: AvailableCommand[];
  axonEvents: AxonEventView[];
  sessions: SessionInfo[];
  isLoadingSessions: boolean;
  start: (config: { agentBinary: string; launchArgs?: string[]; launchCommands?: string[]; systemPrompt?: string }) => Promise<void>;
  sendMessage: (text: string, content?: Array<{ type: string; [key: string]: unknown }>) => Promise<void>;
  cancel: () => Promise<void>;
  setMode: (modeId: string) => Promise<void>;
  setModel: (modelId: string) => Promise<void>;
  setConfigOption: (optionId: string, valueId: string) => Promise<void>;
  authenticate: (methodId: string) => Promise<void>;
  dismissAuth: () => void;
  respondToPermission: (requestId: string, optionId: string) => Promise<void>;
  cancelPermission: (requestId: string) => Promise<void>;
  setAutoApprovePermissions: (enabled: boolean) => Promise<void>;
  respondToElicitation: (requestId: string, action: ElicitationAction) => Promise<void>;
  shutdown: () => Promise<void>;
  createNewSession: () => Promise<void>;
  switchSession: (sessionId: string) => Promise<void>;
  refreshSessions: () => Promise<void>;
}

const EMPTY_CONNECTION_DETAILS: ConnectionDetails = {
  protocolVersion: null, agentCapabilities: null, clientCapabilities: null, sessionMeta: null,
};

export function useACPAgent(agentId: string | null): UseACPAgentReturn {
  const [connectionPhase, setConnectionPhase] = useState<"idle" | "connecting" | "ready" | "error">("idle");
  const [connectionStatus, setConnectionStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSendingPrompt, setIsSendingPrompt] = useState(false);
  const [devboxId, setDevboxId] = useState<string | null>(null);
  const [axonId, setAxonId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [runloopUrl, setRunloopUrl] = useState<string | null>(null);
  const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(null);
  const [connectionDetails, setConnectionDetails] = useState<ConnectionDetails>(EMPTY_CONNECTION_DETAILS);
  const [authMethods, setAuthMethods] = useState<AuthMethod[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authDismissed, setAuthDismissed] = useState(false);
  const [pendingPermission, setPendingPermission] = useState<PendingPermission | null>(null);
  const [autoApprovePermissions, setAutoApprovePermissionsState] = useState(true);
  const [pendingElicitation, setPendingElicitation] = useState<PendingElicitation | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [usage, setUsage] = useState<UsageState | null>(null);
  const [axonEvents, setAxonEvents] = useState<AxonEventView[]>([]);

  // Turn blocks state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentTurnBlocks, setCurrentTurnBlocks] = useState<TurnBlock[]>([]);
  const [isAgentTurn, setIsAgentTurn] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [plan, setPlan] = useState<PlanEntry[] | null>(null);

  const blocksRef = useRef<TurnBlock[]>([]);
  const thinkingStartRef = useRef<number | null>(null);
  const lastStopReasonRef = useRef<string | undefined>(undefined);

  // Activity state
  const [toolActivity, setToolActivity] = useState<ToolActivity[]>([]);
  const [fileOps, setFileOps] = useState<FileOp[]>([]);
  const [terminals, setTerminals] = useState<Map<string, TerminalState>>(new Map());

  // Session config state
  const [currentMode, setCurrentMode] = useState<string | null>(null);
  const [availableModes, setAvailableModes] = useState<SessionMode[]>([]);
  const [configOptions, setConfigOptions] = useState<SessionConfigOption[]>([]);
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [currentModelId, setCurrentModelId] = useState<string | null>(null);
  const [availableCommands, setAvailableCommands] = useState<AvailableCommand[]>([]);

  const wsRef = useRef<WebSocket | null>(null);

  function resetAllState() {
    blocksRef.current = [];
    thinkingStartRef.current = null;
    lastStopReasonRef.current = undefined;
    setConnectionStatus(null);
    setError(null);
    setIsSendingPrompt(false);
    setMessages([]);
    setCurrentTurnBlocks([]);
    setIsAgentTurn(false);
    setIsStreaming(false);
    setPlan(null);
    setToolActivity([]);
    setFileOps([]);
    setTerminals(new Map());
    setUsage(null);
    setAxonEvents([]);
    setDevboxId(null);
    setAxonId(null);
    setSessionId(null);
    setRunloopUrl(null);
    setAgentInfo(null);
    setConnectionDetails(EMPTY_CONNECTION_DETAILS);
    setAuthMethods([]);
    setIsAuthenticated(false);
    setAuthDismissed(false);
    setPendingPermission(null);
    setAutoApprovePermissionsState(true);
    setPendingElicitation(null);
    setSessions([]);
    setCurrentMode(null);
    setAvailableModes([]);
    setConfigOptions([]);
    setAvailableModels([]);
    setCurrentModelId(null);
    setAvailableCommands([]);
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
        b.type === "thinking" && b.isActive ? { ...b, isActive: false, duration } : b,
      ),
    );
    thinkingStartRef.current = null;
  }

  function flushBlocksToMessages(stopReason?: string) {
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
          ...(stopReason && !isNormalEndTurn(stopReason) ? { stopReason } : {}),
        },
      ]);
    }
    blocksRef.current = [];
    thinkingStartRef.current = null;
    setCurrentTurnBlocks([]);
  }

  function applySessionResponse(resp: Record<string, unknown>) {
    const modes = resp.modes as { availableModes?: SessionMode[]; currentModeId?: string } | undefined;
    if (modes?.availableModes) setAvailableModes(modes.availableModes);
    if (modes?.currentModeId) setCurrentMode(modes.currentModeId);
    const opts = resp.configOptions as SessionConfigOption[] | undefined;
    if (opts) setConfigOptions(opts);
    const models = resp.models as { availableModels?: ModelInfo[]; currentModelId?: string } | undefined;
    if (models?.availableModels) setAvailableModels(models.availableModels);
    if (models?.currentModelId) setCurrentModelId(models.currentModelId);
  }

  function handleTurnBlockEvent(data: WsEvent) {
    if (data.type === "turn_started") {
      setIsAgentTurn(true);
      setIsStreaming(false);
      return;
    }

    if (data.type === "turn_completed") {
      setIsAgentTurn(false);
      setIsStreaming(false);
      lastStopReasonRef.current = data.stopReason;
      return;
    }

    if (data.type === "turn_complete") return;

    if (data.type === "turn_error") {
      flushBlocksToMessages();
      setIsAgentTurn(false);
      setIsStreaming(false);
      setError(data.error ?? "Turn failed");
      return;
    }

    if (data.type !== "session_update") return;

    const update = data.update as SessionUpdate;

    if (isAgentMessageChunk(update)) {
      finalizeThinking();
      const { content, messageId = null } = update as { content: Record<string, unknown>; messageId?: string | null };
      if (content.type === "resource_link") {
        pushBlock({
          type: "resource_link",
          id: nextBlockId("rl"),
          uri: content.uri as string,
          name: (content.name as string) ?? null,
          title: (content.title as string) ?? null,
        });
        return;
      }
      if (content.type === "image") {
        pushBlock({
          type: "image",
          id: nextBlockId("img"),
          data: content.data as string,
          mimeType: content.mimeType as string,
          uri: (content.uri as string) ?? null,
        });
        return;
      }
      if (content.type === "audio") {
        pushBlock({
          type: "audio",
          id: nextBlockId("aud"),
          data: content.data as string,
          mimeType: content.mimeType as string,
        });
        return;
      }
      if (content.type === "resource") {
        const res = content.resource as Record<string, unknown>;
        pushBlock({
          type: "resource",
          id: nextBlockId("res"),
          uri: res.uri as string,
          mimeType: (res.mimeType as string) ?? null,
          text: "text" in res ? res.text as string : undefined,
          blob: "blob" in res ? res.blob as string : undefined,
        });
        return;
      }
      const text = content.type === "text" ? (content.text as string) : "";
      const last = lastBlock();
      if (last?.type === "text") {
        updateBlocks((blocks) => {
          const copy = [...blocks];
          copy[copy.length - 1] = { ...last, text: last.text + text };
          return copy;
        });
      } else {
        pushBlock({ type: "text", id: nextBlockId("txt"), text, messageId });
      }
      setIsStreaming(true);
      return;
    }

    if (isAgentThoughtChunk(update)) {
      const { content } = update as { content: Record<string, unknown> };
      const text = content.type === "text" ? (content.text as string) : "";
      const last = lastBlock();
      if (last?.type === "thinking" && last.isActive) {
        updateBlocks((blocks) => {
          const copy = [...blocks];
          copy[copy.length - 1] = { ...last, text: last.text + text };
          return copy;
        });
      } else {
        if (!thinkingStartRef.current) thinkingStartRef.current = Date.now();
        pushBlock({ type: "thinking", id: nextBlockId("think"), text, duration: null, isActive: true });
      }
      return;
    }

    if (isToolCall(update)) {
      finalizeThinking();
      const { toolCallId, title, rawInput, rawOutput } = update as Record<string, unknown>;
      const kind = (update as Record<string, unknown>).kind as string ?? "other";
      const status = (update as Record<string, unknown>).status as string ?? "pending";
      const locations = (update as Record<string, unknown>).locations as ToolCallBlock["locations"] ?? [];
      const contentItems = (update as Record<string, unknown>).content
        ? parseToolCallContent((update as Record<string, unknown>).content as ToolCallContent[])
        : [];

      pushBlock({
        type: "tool_call",
        id: nextBlockId("tc"),
        toolCallId: toolCallId as string,
        title: title as string,
        kind: kind as TurnBlock extends { kind: infer K } ? K : never,
        status: status as ToolCallBlock["status"],
        locations,
        content: contentItems,
        rawInput,
        rawOutput,
        startedAt: Date.now(),
        duration: null,
      } as ToolCallBlock);

      // Activity tracking
      const command = rawInput && typeof rawInput === "object"
        ? ((rawInput as Record<string, unknown>).command as string | undefined)
        : undefined;
      setToolActivity((prev) => {
        if (prev.some((a) => a.toolCallId === toolCallId)) return prev;
        return [...prev, { toolCallId: toolCallId as string, kind: kind as string, title: title as string, status: status as string, command, timestamp: Date.now() }];
      });
      return;
    }

    if (isToolCallProgress(update)) {
      const { toolCallId, rawInput, rawOutput } = update as Record<string, unknown>;
      const newStatus = (update as Record<string, unknown>).status as string | undefined;
      const newTitle = (update as Record<string, unknown>).title as string | undefined;
      const newKind = (update as Record<string, unknown>).kind as string | undefined;
      const newLocations = (update as Record<string, unknown>).locations as ToolCallBlock["locations"] | undefined;
      const newContentItems = (update as Record<string, unknown>).content
        ? parseToolCallContent((update as Record<string, unknown>).content as ToolCallContent[])
        : undefined;

      updateBlocks((blocks) =>
        blocks.map((b) => {
          if (b.type !== "tool_call" || b.toolCallId !== toolCallId) return b;
          const tc = b as ToolCallBlock;
          const isFinishing =
            (newStatus === "completed" || newStatus === "failed") &&
            tc.status !== "completed" && tc.status !== "failed";
          return {
            ...tc,
            status: (newStatus ?? tc.status) as ToolCallBlock["status"],
            title: newTitle ?? tc.title,
            kind: (newKind ?? tc.kind) as ToolCallBlock["kind"],
            locations: newLocations ?? tc.locations,
            content: newContentItems ?? tc.content,
            rawInput: rawInput ?? tc.rawInput,
            rawOutput: rawOutput ?? tc.rawOutput,
            duration: isFinishing
              ? Math.round((Date.now() - tc.startedAt) / 1000 * 10) / 10
              : tc.duration,
          };
        }),
      );

      // Activity tracking
      const command = rawInput && typeof rawInput === "object"
        ? ((rawInput as Record<string, unknown>).command as string | undefined)
        : undefined;
      const outputText = newContentItems ? extractOutputText(newContentItems, rawOutput) : undefined;
      setToolActivity((prev) =>
        prev.map((a) =>
          a.toolCallId === toolCallId
            ? { ...a, status: newStatus ?? a.status, command: command ?? a.command, output: outputText ?? a.output }
            : a,
        ),
      );
      return;
    }

    if (isPlan(update)) {
      const { entries } = update as { entries: PlanEntry[] };
      setPlan(entries);
      const existingPlan = blocksRef.current.find((b) => b.type === "plan");
      if (existingPlan) {
        updateBlocks((blocks) =>
          blocks.map((b) => b.type === "plan" ? { ...b, entries } : b),
        );
      } else {
        pushBlock({ type: "plan", id: nextBlockId("plan"), entries });
      }
      return;
    }

    // Session config updates
    if (isCurrentModeUpdate(update)) {
      setCurrentMode((update as { currentModeId: string }).currentModeId);
    } else if (isConfigOptionUpdate(update)) {
      setConfigOptions((update as { configOptions: unknown }).configOptions as SessionConfigOption[]);
    } else if (isAvailableCommandsUpdate(update)) {
      setAvailableCommands((update as { availableCommands: AvailableCommand[] }).availableCommands);
    }

    if (isUsageUpdate(update)) {
      const { size, used, cost = null } = update as { size: number; used: number; cost?: number | null };
      setUsage({ size, used, cost });
    }

    if (isSessionInfoUpdate(update)) {
      const u = update as { title?: string; updatedAt?: string };
      if (u.title) {
        const sid = (data as { sessionId: string | null }).sessionId;
        setSessions((prev) =>
          prev.map((s) =>
            s.sessionId === sid ? { ...s, title: u.title, updatedAt: u.updatedAt } : s,
          ),
        );
      }
    }
  }

  function handleActivityEvent(data: WsEvent) {
    if (data.type === "file_read") {
      setFileOps((prev) => [...prev, { id: `fr-${Date.now()}`, type: "read", path: data.path, detail: `${data.lines} lines`, timestamp: Date.now() }]);
    } else if (data.type === "file_write") {
      setFileOps((prev) => [...prev, { id: `fw-${Date.now()}`, type: "write", path: data.path, detail: `${data.bytes} bytes`, timestamp: Date.now() }]);
    } else if (data.type === "terminal_create") {
      setTerminals((prev) => {
        const next = new Map(prev);
        next.set(data.terminalId, { terminalId: data.terminalId, command: data.command, output: "", exited: false, timestamp: Date.now() });
        return next;
      });
    } else if (data.type === "terminal_output") {
      setTerminals((prev) => {
        const next = new Map(prev);
        const existing = next.get(data.terminalId);
        if (existing) next.set(existing.terminalId, { ...existing, output: data.output, exited: data.exited });
        return next;
      });
    } else if (data.type === "terminal_kill" || data.type === "terminal_release") {
      setTerminals((prev) => {
        const next = new Map(prev);
        const existing = next.get(data.terminalId);
        if (existing) next.set(existing.terminalId, { ...existing, exited: true });
        return next;
      });
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
      let data: WsEvent;
      try { data = JSON.parse(ev.data); } catch { return; }

      if (data.agentId !== agentId) return;

      if (data.type === "axon_event") {
        setAxonEvents((prev) => [...prev, data.event as AxonEventView]);
        return;
      }

      if (data.type === "timeline_event") {
        const tlEvent = data.event as ACPTimelineEvent;

        const userMsg = extractACPUserMessage(tlEvent.data, tlEvent.axonEvent);
        if (userMsg) {
          flushBlocksToMessages(lastStopReasonRef.current);
          lastStopReasonRef.current = undefined;
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

        if (tlEvent.axonEvent.event_type === "initialize" && tlEvent.axonEvent.origin === "AGENT_EVENT") {
          const payload = tlEvent.data as Record<string, unknown>;
          const info = (payload.agentInfo as Record<string, unknown>) ?? null;
          const caps = (payload.agentCapabilities as AgentCapabilities) ?? null;
          const protoVer = (payload.protocolVersion as number) ?? null;
          const authMeta = (payload.authMethods as unknown[]) ?? [];

          setAgentInfo(info as AgentInfo | null);
          setConnectionDetails({ protocolVersion: protoVer, agentCapabilities: caps, clientCapabilities: null, sessionMeta: null });
          setAuthMethods(authMeta as AuthMethod[]);

          pushBlock({
            type: "system_init",
            id: nextBlockId("init"),
            agentName: (info?.name as string) ?? null,
            agentVersion: (info?.version as string) ?? null,
            model: null,
            commands: [],
            extensions: {
              protocol: "acp",
              protocolVersion: protoVer,
              modes: [],
              models: [],
              configOptions: [],
              agentCapabilities: caps,
              clientCapabilities: null,
              authMethods: authMeta,
            } satisfies ACPInitExtensions,
            extra: payload,
          });
          return;
        }

        return;
      }

      if (data.type === "connection_progress") {
        setConnectionStatus(data.step);
        return;
      }

      handleTurnBlockEvent(data);
      handleActivityEvent(data);

      if (data.type === "permission_request") {
        const { requestId, request } = data as { requestId: string; request: Record<string, unknown> };
        const toolCall = request.toolCall as Record<string, unknown> | undefined;
        setPendingPermission({
          requestId,
          toolTitle: (toolCall?.title as string) ?? "unknown",
          toolKind: (toolCall?.kind as string) ?? "other",
          toolCallId: (toolCall?.toolCallId as string) ?? "",
          rawInput: toolCall?.rawInput,
          options: request.options as PendingPermission["options"],
        });
        return;
      }

      if (data.type === "permission_dismissed") {
        setPendingPermission(null);
        return;
      }

      if (data.type === "elicitation_request") {
        const { request, requestId } = data as { request: Record<string, unknown>; requestId: string };
        setPendingElicitation({
          requestId,
          message: request.message as string,
          mode: request.mode as "form" | "url",
          schema: request.mode === "form"
            ? request.requestedSchema as PendingElicitation["schema"]
            : undefined,
          url: request.mode === "url" ? request.url as string : undefined,
        });
        return;
      }

      if (data.type === "elicitation_dismissed") {
        setPendingElicitation(null);
        return;
      }
    };

    socket.onopen = () => {
      setConnectionPhase("ready");
      api("/api/subscribe", { agentId }).catch(() => {});
    };

    socket.onclose = () => { wsRef.current = null; };

    return () => {
      socket.close();
      wsRef.current = null;
    };
  }, [agentId]);

  const start = useCallback(async (_config: { agentBinary: string; launchArgs?: string[]; launchCommands?: string[]; systemPrompt?: string; autoApprovePermissions?: boolean }) => {
    // Start is handled by App.tsx directly via /api/start
    // This hook auto-connects WS when agentId is set
  }, []);

  const sendMessage = useCallback(async (text: string, content?: Array<{ type: string; [key: string]: unknown }>) => {
    if (!text.trim() && (!content || content.length === 0)) return;

    flushBlocksToMessages(lastStopReasonRef.current);
    lastStopReasonRef.current = undefined;
    blocksRef.current = [];
    thinkingStartRef.current = null;
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

  const setMode = useCallback(async (modeId: string) => {
    setCurrentMode(modeId);
    try { await api("/api/set-mode", { agentId, modeId }); } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [agentId]);

  const setModel = useCallback(async (modelId: string) => {
    setCurrentModelId(modelId);
    try { await api("/api/set-model", { agentId, modelId }); } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [agentId]);

  const setConfigOption = useCallback(async (optionId: string, valueId: string) => {
    try {
      const resp = await api<{ configOptions?: SessionConfigOption[] }>("/api/set-config-option", { agentId, configId: optionId, value: valueId });
      if (resp.configOptions) setConfigOptions(resp.configOptions);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [agentId]);

  const authenticate = useCallback(async (methodId: string) => {
    try { await api("/api/authenticate", { agentId, methodId }); setIsAuthenticated(true); } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [agentId]);

  const dismissAuth = useCallback(() => { setAuthDismissed(true); }, []);

  const respondToPermission = useCallback(async (requestId: string, optionId: string) => {
    setPendingPermission(null);
    try {
      await api("/api/permission-response", { agentId, requestId, outcome: { outcome: "selected", optionId } });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [agentId]);

  const cancelPermission = useCallback(async (requestId: string) => {
    setPendingPermission(null);
    try {
      await api("/api/permission-response", { agentId, requestId, outcome: { outcome: "cancelled" } });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [agentId]);

  const setAutoApprovePermissions = useCallback(async (enabled: boolean) => {
    setAutoApprovePermissionsState(enabled);
    try { await api("/api/set-auto-approve-permissions", { agentId, enabled }); } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [agentId]);

  const respondToElicitation = useCallback(async (requestId: string, action: ElicitationAction) => {
    setPendingElicitation(null);
    try { await api("/api/elicitation-response", { agentId, requestId, action }); } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [agentId]);

  const createNewSession = useCallback(async () => {
    try {
      const resp = await api<{ sessionId: string; modes?: unknown; configOptions?: unknown }>("/api/new-session", { agentId });
      setSessionId(resp.sessionId);
      applySessionResponse(resp as Record<string, unknown>);
      setSessions((prev) => {
        if (prev.some((s) => s.sessionId === resp.sessionId)) return prev;
        return [...prev, { sessionId: resp.sessionId, cwd: "." }];
      });
      resetAllState();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [agentId]);

  const switchSession = useCallback(async (targetSessionId: string) => {
    try {
      const resp = await api<Record<string, unknown>>("/api/switch-session", { agentId, sessionId: targetSessionId });
      setSessionId(targetSessionId);
      applySessionResponse(resp);
      resetAllState();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [agentId]);

  const refreshSessions = useCallback(async () => {
    setIsLoadingSessions(true);
    try {
      const resp = await api<{ sessions?: SessionInfo[] }>(`/api/sessions?agentId=${agentId}`);
      if (resp.sessions) setSessions(resp.sessions);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoadingSessions(false);
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
    connectionPhase, connectionStatus, error,
    messages, currentTurnBlocks, isAgentTurn, isStreaming, isSendingPrompt,
    usage, plan, toolActivity, fileOps, terminals,
    currentMode, availableModes, configOptions, availableModels, currentModelId,
    pendingPermission, autoApprovePermissions, pendingElicitation,
    devboxId, axonId, sessionId, runloopUrl,
    agentInfo, connectionDetails, authMethods, isAuthenticated, authDismissed,
    availableCommands, axonEvents, sessions, isLoadingSessions,
    start, sendMessage, cancel,
    setMode, setModel, setConfigOption,
    authenticate, dismissAuth,
    respondToPermission, cancelPermission, setAutoApprovePermissions,
    respondToElicitation, shutdown,
    createNewSession, switchSession, refreshSessions,
  };
}
