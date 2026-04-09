import { useState, useRef, useCallback, useEffect } from "react";
import type { AuthMethod, ElicitationAction, SessionUpdate, ACPTimelineEvent, StopReason } from "@runloop/agent-axon-client/acp";
import { isUsageUpdate, isSessionInfoUpdate, extractACPUserMessage, type AxonEventView } from "@runloop/agent-axon-client/acp";
import type { ClientEvent } from "../../server/acp-client.js";
import type {
  AgentInfo,
  AgentCapabilities,
  ClientCapabilities,
  ConnectionDetails,
  ConnectionPhase,
  PendingPermission,
  PendingElicitation,
  SessionListEntry,
  UsageState,
  UseNodeAgentReturn,
} from "./types.js";
import { api } from "./api.js";
import { useTurnBlocks } from "./useTurnBlocks.js";
import { useActivity } from "./useActivity.js";
import { useSessionConfig } from "./useSessionConfig.js";

// Re-export all types so existing component imports continue to work
export type {
  ToolKind,
  ToolCallStatus,
  StopReason,
  PlanEntryPriority,
  PlanEntryStatus,
  ToolCallLocation,
  PlanEntry,
  ModelInfo,
  AvailableCommand,
  SessionMode,
  AuthMethod,
  ElicitationAction,
  ElicitationContentValue,
  DiffContent,
  TerminalContent,
  UsageState,
  SessionListEntry,
  AgentInfo,
  AgentCapabilities,
  ClientCapabilities,
  ConnectionDetails,
  ConnectionPhase,
  ContentItem,
  ThinkingBlock,
  ToolCallBlock,
  TextBlock,
  PlanBlock,
  ResourceLinkBlock,
  ImageBlock,
  AudioBlock,
  EmbeddedResourceBlock,
  TurnBlock,
  ChatMessage,
  ElicitationFieldSchema,
  PendingPermission,
  PendingElicitation,
  ToolActivity,
  FileOp,
  TerminalState,
  SessionConfigOption,
  UseNodeAgentReturn,
  AxonEventView,
} from "./types.js";

export function useNodeAgent(): UseNodeAgentReturn {
  const [connectionPhase, setConnectionPhase] = useState<ConnectionPhase>("idle");
  const [connectionStatus, setConnectionStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSendingPrompt, setIsSendingPrompt] = useState(false);
  const [devboxId, setDevboxId] = useState<string | null>(null);
  const [axonId, setAxonId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [runloopUrl, setRunloopUrl] = useState<string | null>(null);
  const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(null);
  const [connectionDetails, setConnectionDetails] = useState<ConnectionDetails>({
    protocolVersion: null,
    agentCapabilities: null,
    clientCapabilities: null,
    sessionMeta: null,
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

  const turnBlocks = useTurnBlocks();
  const activity = useActivity();
  const sessionConfig = useSessionConfig((err) => setError(err));

  useEffect(() => {
    if (turnBlocks.error) setError(turnBlocks.error);
  }, [turnBlocks.error]);

  const wsRef = useRef<WebSocket | null>(null);

  function handleTimelineEvent(tlEvent: ACPTimelineEvent) {
    setAxonEvents((prev) => [...prev, tlEvent.axonEvent]);

    const userMsg = extractACPUserMessage(tlEvent.data, tlEvent.axonEvent);
    if (userMsg) {
      turnBlocks.addUserMessage(userMsg.text, `user-${userMsg.sequence}`);
      return;
    }

    if (tlEvent.kind === "system") {
      const data = tlEvent.data as { type: string; turnId?: string; stopReason?: string };
      if (data.type === "turn.started") {
        turnBlocks.setIsAgentTurn(true);
        turnBlocks.setIsStreaming(false);
      } else if (data.type === "turn.completed") {
        turnBlocks.setIsAgentTurn(false);
        turnBlocks.setIsStreaming(false);
        turnBlocks.lastStopReasonRef.current = data.stopReason as StopReason;
      }
      return;
    }

    if (tlEvent.kind === "acp_protocol") {
      if (tlEvent.axonEvent.event_type === "session/update") {
        const payload = tlEvent.data as Record<string, unknown>;
        const inner = (payload as { update?: unknown }).update;
        if (!inner || typeof inner !== "object") return;
        const update = inner as SessionUpdate;
        turnBlocks.onSessionUpdate(update);
        activity.onSessionUpdate(update);
        sessionConfig.onSessionUpdate(update);

        if (isUsageUpdate(update)) {
          const { size, used, cost = null } = update;
          setUsage({ size, used, cost });
        }

        if (isSessionInfoUpdate(update)) {
          if (update.title) {
            setSessions((prev) =>
              prev.map((s) =>
                s.sessionId === sessionId
                  ? { ...s, title: update.title, updatedAt: update.updatedAt }
                  : s,
              ),
            );
          }
        }
      }
    }
  }

  const connectWs = useCallback(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const socket = new WebSocket(wsUrl);
    wsRef.current = socket;

    socket.onmessage = (ev) => {
      let data: ClientEvent;
      try { data = JSON.parse(ev.data); } catch { return; }

      if (data.type === "timeline_event") {
        handleTimelineEvent(data.event);
        return;
      }

      if (data.type === "connection_progress") {
        setConnectionStatus(data.step);
        return;
      }

      if (data.type === "turn_error") {
        turnBlocks.flushBlocksToMessages();
        turnBlocks.setIsAgentTurn(false);
        turnBlocks.setIsStreaming(false);
        setError(data.error ?? "Turn failed");
        return;
      }

      if (data.type === "permission_request") {
        const { requestId, request } = data;
        const toolCall = (request as Record<string, unknown>).toolCall as Record<string, unknown> | undefined;
        setPendingPermission({
          requestId,
          toolTitle: (toolCall?.title as string) ?? "unknown",
          toolKind: (toolCall?.kind as string) ?? "other",
          toolCallId: (toolCall?.toolCallId as string) ?? "",
          rawInput: toolCall?.rawInput,
          options: (request as Record<string, unknown>).options as PendingPermission["options"],
        });
        return;
      }

      if (data.type === "permission_dismissed") {
        setPendingPermission(null);
        return;
      }

      if (data.type === "elicitation_request") {
        const { request, requestId } = data;
        const req = request as Record<string, unknown>;
        setPendingElicitation({
          requestId,
          message: req.message as string,
          mode: req.mode as "form" | "url",
          schema: req.mode === "form"
            ? req.requestedSchema as PendingElicitation["schema"]
            : undefined,
          url: req.mode === "url" ? req.url as string : undefined,
        });
        return;
      }

      if (data.type === "elicitation_dismissed") {
        setPendingElicitation(null);
        return;
      }
    };

    socket.onclose = () => {
      wsRef.current = null;
    };
  }, [turnBlocks.onSessionUpdate, turnBlocks.addUserMessage, turnBlocks.flushBlocksToMessages, activity.onSessionUpdate, sessionConfig.onSessionUpdate]);

  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  const resetChatState = useCallback(() => {
    turnBlocks.resetChat();
    activity.resetActivity();
    setUsage(null);
  }, [turnBlocks.resetChat, activity.resetActivity]);

  const start = useCallback(async (
    config: { agentBinary: string; launchArgs?: string[]; launchCommands?: string[]; systemPrompt?: string },
  ) => {
    try {
      setError(null);
      setConnectionPhase("connecting");

      connectWs();

      const resp = await api<{
        sessionId: string;
        devboxId: string;
        axonId: string;
        runloopUrl?: string;
        modes?: unknown;
        configOptions?: unknown;
        authMethods?: AuthMethod[];
        agentInfo?: AgentInfo;
        protocolVersion?: number;
        agentCapabilities?: AgentCapabilities;
        clientCapabilities?: ClientCapabilities;
        sessionMeta?: Record<string, unknown>;
      }>("/api/start", {
        agentBinary: config.agentBinary,
        launchArgs: config.launchArgs,
        launchCommands: config.launchCommands,
        systemPrompt: config.systemPrompt,
      });

      setDevboxId(resp.devboxId);
      setAxonId(resp.axonId);
      setSessionId(resp.sessionId);
      if (resp.runloopUrl) setRunloopUrl(resp.runloopUrl);
      if (resp.authMethods) setAuthMethods(resp.authMethods);
      if (resp.agentInfo) setAgentInfo(resp.agentInfo);
      setConnectionDetails({
        protocolVersion: resp.protocolVersion ?? null,
        agentCapabilities: resp.agentCapabilities ?? null,
        clientCapabilities: resp.clientCapabilities ?? null,
        sessionMeta: resp.sessionMeta ?? null,
      });
      sessionConfig.applySessionResponse(resp as Record<string, unknown>);

      setSessions([{
        sessionId: resp.sessionId,
        cwd: ".",
      }]);

      resetChatState();
      setConnectionStatus(null);
      setConnectionPhase("ready");
    } catch (err) {
      setConnectionPhase("error");
      setConnectionStatus(null);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [connectWs, resetChatState, sessionConfig.applySessionResponse]);

  const sendMessage = useCallback(async (text: string, content?: Array<{ type: string; [key: string]: unknown }>) => {
    if (!text.trim() && (!content || content.length === 0)) return;

    turnBlocks.startTurn();

    setIsSendingPrompt(true);
    try {
      if (content && content.length > 0) {
        await api("/api/prompt", { content });
      } else {
        await api("/api/prompt", { text });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      turnBlocks.flushBlocksToMessages();
      turnBlocks.setIsAgentTurn(false);
      turnBlocks.setIsStreaming(false);
      turnBlocks.setError(message);
    } finally {
      setIsSendingPrompt(false);
    }
  }, [turnBlocks.startTurn, turnBlocks.flushBlocksToMessages]);

  const cancel = useCallback(async () => {
    try { await api("/api/cancel", {}); } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const authenticate = useCallback(async (methodId: string) => {
    try {
      await api("/api/authenticate", { methodId });
      setIsAuthenticated(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const dismissAuth = useCallback(() => {
    setAuthDismissed(true);
  }, []);

  const respondToPermission = useCallback(async (
    requestId: string,
    optionId: string,
  ) => {
    setPendingPermission(null);
    try {
      await api("/api/permission-response", {
        requestId,
        outcome: { outcome: "selected", optionId },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const cancelPermission = useCallback(async (requestId: string) => {
    setPendingPermission(null);
    try {
      await api("/api/permission-response", {
        requestId,
        outcome: { outcome: "cancelled" },
      });
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

  const respondToElicitation = useCallback(async (
    requestId: string,
    action: ElicitationAction,
  ) => {
    setPendingElicitation(null);
    try {
      await api("/api/elicitation-response", { requestId, action });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const refreshSessions = useCallback(async () => {
    setIsLoadingSessions(true);
    try {
      const resp = await api<{ sessions?: Array<{ sessionId: string; title?: string; updatedAt?: string; cwd: string }> }>("/api/sessions");
      if (resp.sessions) {
        setSessions(resp.sessions.map((s) => ({
          sessionId: s.sessionId,
          title: s.title,
          updatedAt: s.updatedAt,
          cwd: s.cwd,
        })));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoadingSessions(false);
    }
  }, []);

  const createNewSession = useCallback(async () => {
    try {
      const resp = await api<{ sessionId: string; modes?: unknown; configOptions?: unknown }>("/api/new-session", {});
      setSessionId(resp.sessionId);
      sessionConfig.applySessionResponse(resp as Record<string, unknown>);
      setSessions((prev) => {
        if (prev.some((s) => s.sessionId === resp.sessionId)) return prev;
        return [...prev, { sessionId: resp.sessionId, cwd: "." }];
      });
      resetChatState();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [resetChatState, sessionConfig.applySessionResponse]);

  const switchSession = useCallback(async (targetSessionId: string) => {
    try {
      const resp = await api<Record<string, unknown>>("/api/switch-session", { sessionId: targetSessionId });
      setSessionId(targetSessionId);
      sessionConfig.applySessionResponse(resp);
      resetChatState();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [resetChatState, sessionConfig.applySessionResponse]);

  const shutdown = useCallback(async () => {
    try {
      await api("/api/shutdown", {});
    } catch { /* ignore */ }
    wsRef.current?.close();
    wsRef.current = null;
    setConnectionPhase("idle");
    setConnectionStatus(null);
    setIsSendingPrompt(false);
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
    setUsage(null);
    turnBlocks.resetChat();
    activity.resetActivity();
  }, [turnBlocks.resetChat, activity.resetActivity]);

  return {
    connectionPhase,
    connectionStatus,
    error,
    messages: turnBlocks.messages,
    currentTurnBlocks: turnBlocks.currentTurnBlocks,
    isAgentTurn: turnBlocks.isAgentTurn,
    isStreaming: turnBlocks.isStreaming,
    isSendingPrompt,
    usage,
    plan: turnBlocks.plan,
    toolActivity: activity.toolActivity,
    fileOps: [],
    terminals: new Map(),
    currentMode: sessionConfig.currentMode,
    availableModes: sessionConfig.availableModes,
    configOptions: sessionConfig.configOptions,
    availableModels: sessionConfig.availableModels,
    currentModelId: sessionConfig.currentModelId,
    pendingPermission,
    autoApprovePermissions,
    pendingElicitation,
    devboxId,
    axonId,
    sessionId,
    runloopUrl,
    agentInfo,
    connectionDetails,
    authMethods,
    isAuthenticated,
    authDismissed,
    availableCommands: sessionConfig.availableCommands,
    axonEvents,
    sessions,
    isLoadingSessions,
    start,
    sendMessage,
    cancel,
    setMode: sessionConfig.setMode,
    setModel: sessionConfig.setModel,
    setConfigOption: sessionConfig.setConfigOption,
    authenticate,
    dismissAuth,
    respondToPermission,
    cancelPermission,
    setAutoApprovePermissions,
    respondToElicitation,
    shutdown,
    createNewSession,
    switchSession,
    refreshSessions,
  };
}
