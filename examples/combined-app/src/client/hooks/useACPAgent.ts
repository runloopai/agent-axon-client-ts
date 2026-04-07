import { useState, useRef, useCallback, useEffect } from "react";
import {
  isAgentMessageChunk,
  isAgentThoughtChunk,
  isToolCall,
  isToolCallProgress,
  isPlan,
  isUserMessageChunk,
  isUsageUpdate,
  isSessionInfoUpdate,
  isCurrentModeUpdate,
  isConfigOptionUpdate,
  isAvailableCommandsUpdate,
} from "@runloop/agent-axon-client/acp";
import type { ToolCallContent, AuthMethod, ElicitationAction, SessionUpdate } from "@runloop/agent-axon-client/acp";
import type { WsEvent } from "../../server/ws.js";
import type {
  TurnBlock,
  ChatMessage,
  UserAttachment,
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
  ClientCapabilities,
  ConnectionDetails,
  SessionListEntry,
  AxonEventView,
  ToolCallBlock,
  ACPInitExtensions,
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
  sessions: SessionListEntry[];
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

export function useACPAgent(): UseACPAgentReturn {
  const [connectionPhase, setConnectionPhase] = useState<"idle" | "connecting" | "ready" | "error">("idle");
  const [connectionStatus, setConnectionStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSendingPrompt, setIsSendingPrompt] = useState(false);
  const [devboxId, setDevboxId] = useState<string | null>(null);
  const [axonId, setAxonId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [runloopUrl, setRunloopUrl] = useState<string | null>(null);
  const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(null);
  const [connectionDetails, setConnectionDetails] = useState<ConnectionDetails>({
    protocolVersion: null, agentCapabilities: null, clientCapabilities: null, sessionMeta: null,
  });
  const [authMethods, setAuthMethods] = useState<AuthMethod[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authDismissed, setAuthDismissed] = useState(false);
  const [pendingPermission, setPendingPermission] = useState<PendingPermission | null>(null);
  const [autoApprovePermissions, setAutoApprovePermissionsState] = useState(true);
  const [pendingElicitation, setPendingElicitation] = useState<PendingElicitation | null>(null);
  const [sessions, setSessions] = useState<SessionListEntry[]>([]);
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

    if (isUserMessageChunk(update)) {
      const { content } = update as { content: Record<string, unknown> };
      const text = content.type === "text" ? (content.text as string) : "";
      if (text) {
        setMessages((prev) => [
          ...prev,
          { id: `user-replay-${Date.now()}`, role: "user", content: text },
        ]);
      }
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

  const connectWs = useCallback(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const socket = new WebSocket(wsUrl);
    wsRef.current = socket;

    socket.onmessage = (ev) => {
      let data: WsEvent;
      try { data = JSON.parse(ev.data); } catch { return; }

      if (data.type === "axon_event") {
        setAxonEvents((prev) => [...prev, data.event as AxonEventView]);
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

    socket.onclose = () => { wsRef.current = null; };
  }, []);

  useEffect(() => {
    return () => { wsRef.current?.close(); };
  }, []);

  const resetAll = useCallback(() => {
    blocksRef.current = [];
    thinkingStartRef.current = null;
    lastStopReasonRef.current = undefined;
    setCurrentTurnBlocks([]);
    setMessages([]);
    setIsAgentTurn(false);
    setIsStreaming(false);
    setPlan(null);
    setError(null);
    setToolActivity([]);
    setFileOps([]);
    setTerminals(new Map());
    setUsage(null);
  }, []);

  const start = useCallback(async (config: { agentBinary: string; launchArgs?: string[]; launchCommands?: string[]; systemPrompt?: string }) => {
    try {
      setError(null);
      setConnectionPhase("connecting");
      connectWs();

      const resp = await api<Record<string, unknown>>("/api/start", { agentType: "acp", ...config });

      setDevboxId(resp.devboxId as string);
      setAxonId(resp.axonId as string);
      setSessionId(resp.sessionId as string);
      if (resp.runloopUrl) setRunloopUrl(resp.runloopUrl as string);
      if (resp.authMethods) setAuthMethods(resp.authMethods as AuthMethod[]);
      if (resp.agentInfo) setAgentInfo(resp.agentInfo as AgentInfo);
      setConnectionDetails({
        protocolVersion: (resp.protocolVersion as number) ?? null,
        agentCapabilities: (resp.agentCapabilities as AgentCapabilities) ?? null,
        clientCapabilities: (resp.clientCapabilities as ClientCapabilities) ?? null,
        sessionMeta: (resp.sessionMeta as Record<string, unknown>) ?? null,
      });
      applySessionResponse(resp);
      setSessions([{ sessionId: resp.sessionId as string, cwd: "." }]);
      resetAll();

      const info = resp.agentInfo as AgentInfo | undefined;
      const modes = resp.modes as { availableModes?: SessionMode[] } | undefined;
      const models = resp.models as { availableModels?: ModelInfo[]; currentModelId?: string } | undefined;
      const opts = resp.configOptions as SessionConfigOption[] | undefined;
      const cmds = resp.availableCommands as AvailableCommand[] | undefined;
      const extensions: ACPInitExtensions = {
        protocol: "acp",
        protocolVersion: (resp.protocolVersion as number) ?? null,
        modes: modes?.availableModes ?? [],
        models: models?.availableModels ?? [],
        configOptions: opts ?? [],
        agentCapabilities: (resp.agentCapabilities as AgentCapabilities) ?? null,
        clientCapabilities: (resp.clientCapabilities as ClientCapabilities) ?? null,
        authMethods: (resp.authMethods as unknown[]) ?? [],
      };
      const modelName = models?.availableModels?.find((m) => m.modelId === models.currentModelId)?.name
        ?? models?.currentModelId ?? null;
      pushBlock({
        type: "system_init",
        id: nextBlockId("init"),
        agentName: info?.name ?? null,
        agentVersion: info?.version ?? null,
        model: modelName,
        commands: cmds?.map((c) => c.name) ?? [],
        extensions,
        extra: { ...resp },
      });

      setConnectionStatus(null);
      setConnectionPhase("ready");
    } catch (err) {
      setConnectionPhase("error");
      setConnectionStatus(null);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [connectWs, resetAll]);

  const sendMessage = useCallback(async (text: string, content?: Array<{ type: string; [key: string]: unknown }>) => {
    if (!text.trim() && (!content || content.length === 0)) return;

    const attachments = content
      ?.filter((c) => c.type === "image" || c.type === "file")
      .map((c) => ({
        type: c.type as "image" | "file",
        name: c.name as string | undefined,
        data: c.data as string | undefined,
        mimeType: c.mimeType as string | undefined,
        text: c.text as string | undefined,
      }));

    flushBlocksToMessages(lastStopReasonRef.current);
    lastStopReasonRef.current = undefined;
    setMessages((prev) => [
      ...prev,
      { id: `user-${Date.now()}`, role: "user", content: text, ...(attachments && attachments.length > 0 ? { attachments } : {}) },
    ]);
    blocksRef.current = [];
    thinkingStartRef.current = null;
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
    } finally {
      setIsSendingPrompt(false);
    }
  }, []);

  const cancel = useCallback(async () => {
    try { await api("/api/cancel", {}); } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const setMode = useCallback(async (modeId: string) => {
    setCurrentMode(modeId);
    try { await api("/api/set-mode", { modeId }); } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const setModel = useCallback(async (modelId: string) => {
    setCurrentModelId(modelId);
    try { await api("/api/set-model", { modelId }); } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const setConfigOption = useCallback(async (optionId: string, valueId: string) => {
    try {
      const resp = await api<{ configOptions?: SessionConfigOption[] }>("/api/set-config-option", { configId: optionId, value: valueId });
      if (resp.configOptions) setConfigOptions(resp.configOptions);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const authenticate = useCallback(async (methodId: string) => {
    try { await api("/api/authenticate", { methodId }); setIsAuthenticated(true); } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const dismissAuth = useCallback(() => { setAuthDismissed(true); }, []);

  const respondToPermission = useCallback(async (requestId: string, optionId: string) => {
    setPendingPermission(null);
    try {
      await api("/api/permission-response", { requestId, outcome: { outcome: "selected", optionId } });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const cancelPermission = useCallback(async (requestId: string) => {
    setPendingPermission(null);
    try {
      await api("/api/permission-response", { requestId, outcome: { outcome: "cancelled" } });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const setAutoApprovePermissions = useCallback(async (enabled: boolean) => {
    setAutoApprovePermissionsState(enabled);
    try { await api("/api/set-auto-approve-permissions", { enabled }); } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const respondToElicitation = useCallback(async (requestId: string, action: ElicitationAction) => {
    setPendingElicitation(null);
    try { await api("/api/elicitation-response", { requestId, action }); } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const createNewSession = useCallback(async () => {
    try {
      const resp = await api<{ sessionId: string; modes?: unknown; configOptions?: unknown }>("/api/new-session", {});
      setSessionId(resp.sessionId);
      applySessionResponse(resp as Record<string, unknown>);
      setSessions((prev) => {
        if (prev.some((s) => s.sessionId === resp.sessionId)) return prev;
        return [...prev, { sessionId: resp.sessionId, cwd: "." }];
      });
      resetAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [resetAll]);

  const switchSession = useCallback(async (targetSessionId: string) => {
    try {
      const resp = await api<Record<string, unknown>>("/api/switch-session", { sessionId: targetSessionId });
      setSessionId(targetSessionId);
      applySessionResponse(resp);
      resetAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [resetAll]);

  const refreshSessions = useCallback(async () => {
    setIsLoadingSessions(true);
    try {
      const resp = await api<{ sessions?: SessionListEntry[] }>("/api/sessions");
      if (resp.sessions) setSessions(resp.sessions);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoadingSessions(false);
    }
  }, []);

  const shutdown = useCallback(async () => {
    try { await api("/api/shutdown", {}); } catch { /* ignore */ }
    wsRef.current?.close();
    wsRef.current = null;
    setConnectionPhase("idle");
    setConnectionStatus(null);
    resetAll();
    setDevboxId(null);
    setAxonId(null);
    setSessionId(null);
    setSessions([]);
    setAgentInfo(null);
    setAuthMethods([]);
    setIsAuthenticated(false);
    setAuthDismissed(false);
    setPendingPermission(null);
    setAutoApprovePermissionsState(true);
    setAxonEvents([]);
  }, [resetAll]);

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
