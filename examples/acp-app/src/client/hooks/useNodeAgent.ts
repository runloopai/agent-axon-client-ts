import { useState, useRef, useCallback, useEffect } from "react";
import type { AuthMethod, ElicitationAction } from "@runloop/agent-axon-client/acp";
import { isUsageUpdate, isSessionInfoUpdate, type AxonEventView } from "@runloop/agent-axon-client/acp";
import type { ClientEvent } from "../../server/acp-client.js";
import type {
  AgentInfo,
  AgentCapabilities,
  ClientCapabilities,
  ConnectionDetails,
  ConnectionPhase,
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
  PendingElicitation,
  ToolActivity,
  FileOp,
  TerminalState,
  SessionConfigOption,
  UseNodeAgentReturn,
  AxonEventView,
} from "./types.js";

export function useNodeAgent(): UseNodeAgentReturn {
  // --- Connection lifecycle state ---
  const [connectionPhase, setConnectionPhase] = useState<ConnectionPhase>("idle");
  const [error, setError] = useState<string | null>(null);
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

  // --- Auth state ---
  const [authMethods, setAuthMethods] = useState<AuthMethod[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authDismissed, setAuthDismissed] = useState(false);

  // --- Elicitation state ---
  const [pendingElicitation, setPendingElicitation] = useState<PendingElicitation | null>(null);

  // --- Session list state ---
  const [sessions, setSessions] = useState<SessionListEntry[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);

  // --- Simple state ---
  const [usage, setUsage] = useState<UsageState | null>(null);
  const [axonEvents, setAxonEvents] = useState<AxonEventView[]>([]);

  // --- Sub-hooks ---
  const turnBlocks = useTurnBlocks();
  const activity = useActivity();
  const sessionConfig = useSessionConfig((err) => setError(err));

  // Merge sub-hook errors into our error state
  useEffect(() => {
    if (turnBlocks.error) setError(turnBlocks.error);
  }, [turnBlocks.error]);

  // --- WebSocket ---
  const wsRef = useRef<WebSocket | null>(null);

  const connectWs = useCallback(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const socket = new WebSocket(wsUrl);
    wsRef.current = socket;

    socket.onmessage = (ev) => {
      let data: ClientEvent;
      try { data = JSON.parse(ev.data); } catch { return; }

      if (data.type === "axon_event") {
        setAxonEvents((prev) => [...prev, (data as { type: "axon_event"; event: AxonEventView }).event]);
        return;
      }

      // Fan out to sub-hooks (turn_started / turn_completed are handled here)
      turnBlocks.onEvent(data);
      activity.onEvent(data);
      sessionConfig.onEvent(data);

      // Elicitation
      if (data.type === "elicitation_request") {
        const { request, requestId } = data;
        setPendingElicitation({
          requestId,
          message: request.message,
          mode: request.mode,
          schema: request.mode === "form"
            ? request.requestedSchema as PendingElicitation["schema"]
            : undefined,
          url: request.mode === "url" ? request.url : undefined,
        });
        return;
      }

      if (data.type === "elicitation_dismissed") {
        setPendingElicitation(null);
        return;
      }

      // Remaining session_update cases
      if (data.type === "session_update") {
        const { update } = data;

        if (isUsageUpdate(update)) {
          const { size, used, cost = null } = update;
          setUsage({ size, used, cost });
          return;
        }

        if (isSessionInfoUpdate(update)) {
          if (update.title) {
            const sid = (data as { sessionId: string | null }).sessionId;
            setSessions((prev) =>
              prev.map((s) =>
                s.sessionId === sid
                  ? { ...s, title: update.title, updatedAt: update.updatedAt }
                  : s,
              ),
            );
          }
        }
      }
    };

    socket.onclose = () => {
      wsRef.current = null;
    };
  }, [turnBlocks.onEvent, activity.onEvent, sessionConfig.onEvent]);

  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  // --- Reset helpers ---

  const resetChatState = useCallback(() => {
    turnBlocks.resetChat();
    activity.resetActivity();
    setUsage(null);
  }, [turnBlocks.resetChat, activity.resetActivity]);

  // --- Actions ---

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
      setConnectionPhase("ready");
    } catch (err) {
      setConnectionPhase("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [connectWs, resetChatState, sessionConfig.applySessionResponse]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim()) return;

    turnBlocks.startTurn(text);

    try {
      await api("/api/prompt", { text });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      turnBlocks.onEvent({ type: "turn_error", error: message } as ClientEvent);
    }
  }, [turnBlocks.startTurn, turnBlocks.onEvent]);

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
    setDevboxId(null);
    setAxonId(null);
    setSessionId(null);
    setSessions([]);
    setAgentInfo(null);
    setAuthMethods([]);
    setIsAuthenticated(false);
    setAuthDismissed(false);
    setAxonEvents([]);
    setUsage(null);
    turnBlocks.resetChat();
    activity.resetActivity();
  }, [turnBlocks.resetChat, activity.resetActivity]);

  // --- Compose return ---

  return {
    connectionPhase,
    error,
    messages: turnBlocks.messages,
    currentTurnBlocks: turnBlocks.currentTurnBlocks,
    isAgentTurn: turnBlocks.isAgentTurn,
    isStreaming: turnBlocks.isStreaming,
    usage,
    plan: turnBlocks.plan,
    toolActivity: activity.toolActivity,
    fileOps: activity.fileOps,
    terminals: activity.terminals,
    currentMode: sessionConfig.currentMode,
    availableModes: sessionConfig.availableModes,
    configOptions: sessionConfig.configOptions,
    availableModels: sessionConfig.availableModels,
    currentModelId: sessionConfig.currentModelId,
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
    respondToElicitation,
    shutdown,
    createNewSession,
    switchSession,
    refreshSessions,
  };
}
