import { useState, useCallback } from "react";
import { useClaudeAgent, type UseClaudeAgentReturn } from "./useClaudeAgent.js";
import { useACPAgent, type UseACPAgentReturn } from "./useACPAgent.js";
import type { AgentType, StartConfig, UseAgentReturn } from "../types.js";

const NOOP_ASYNC = async () => {};
const NOOP = () => {};

export function useAgent(): UseAgentReturn {
  const [activeAgentType, setActiveAgentType] = useState<AgentType | null>(null);
  const claude = useClaudeAgent();
  const acp = useACPAgent();

  const start = useCallback(async (params: StartConfig) => {
    setActiveAgentType(params.agentType);
    if (params.agentType === "claude") {
      await claude.start(params.config);
    } else {
      await acp.start(params.config);
    }
  }, [claude.start, acp.start]);

  const shutdown = useCallback(async () => {
    if (activeAgentType === "claude") {
      await claude.shutdown();
    } else if (activeAgentType === "acp") {
      await acp.shutdown();
    }
    setActiveAgentType(null);
  }, [activeAgentType, claude.shutdown, acp.shutdown]);

  if (activeAgentType === "claude") {
    return { ...mapClaude(claude), start, shutdown };
  }
  if (activeAgentType === "acp") {
    return { ...mapACP(acp), start, shutdown };
  }

  return {
    agentType: null,
    connectionPhase: "idle",
    connectionStatus: null,
    error: null,
    messages: [],
    currentTurnBlocks: [],
    isAgentTurn: false,
    isStreaming: false,
    isSendingPrompt: false,
    usage: null,
    initInfo: null,
    permissionMode: null,
    currentModel: null,
    pendingControlRequest: null,
    plan: null,
    toolActivity: [],
    fileOps: [],
    terminals: new Map(),
    currentMode: null,
    availableModes: [],
    configOptions: [],
    availableModels: [],
    currentModelId: null,
    pendingPermission: null,
    pendingElicitation: null,
    agentInfo: null,
    connectionDetails: { protocolVersion: null, agentCapabilities: null, clientCapabilities: null, sessionMeta: null },
    authMethods: [],
    isAuthenticated: false,
    authDismissed: false,
    availableCommands: [],
    sessions: [],
    isLoadingSessions: false,
    autoApprovePermissions: true,
    devboxId: null,
    axonId: null,
    sessionId: null,
    runloopUrl: null,
    axonEvents: [],
    start,
    sendMessage: NOOP_ASYNC,
    cancel: NOOP_ASYNC,
    shutdown,
    setAutoApprovePermissions: NOOP_ASYNC,
    setModel: NOOP_ASYNC,
    setPermissionMode: NOOP_ASYNC,
    sendControlResponse: NOOP_ASYNC,
    setMode: NOOP_ASYNC,
    setACPModel: NOOP_ASYNC,
    setConfigOption: NOOP_ASYNC,
    authenticate: NOOP_ASYNC,
    dismissAuth: NOOP,
    respondToPermission: NOOP_ASYNC,
    cancelPermission: NOOP_ASYNC,
    respondToElicitation: NOOP_ASYNC,
    createNewSession: NOOP_ASYNC,
    switchSession: NOOP_ASYNC,
    refreshSessions: NOOP_ASYNC,
  };
}

function mapClaude(c: UseClaudeAgentReturn): Omit<UseAgentReturn, "start" | "shutdown"> {
  return {
    agentType: "claude",
    connectionPhase: c.connectionPhase,
    connectionStatus: c.connectionStatus,
    error: c.error,
    messages: c.messages,
    currentTurnBlocks: c.currentTurnBlocks,
    isAgentTurn: c.isAgentTurn,
    isStreaming: c.isStreaming,
    isSendingPrompt: c.isSendingPrompt,
    usage: c.usage,
    initInfo: c.initInfo,
    permissionMode: c.permissionMode,
    currentModel: c.currentModel,
    pendingControlRequest: c.pendingControlRequest,
    plan: null,
    toolActivity: [],
    fileOps: [],
    terminals: new Map(),
    currentMode: null,
    availableModes: [],
    configOptions: [],
    availableModels: [],
    currentModelId: null,
    pendingPermission: null,
    pendingElicitation: null,
    agentInfo: null,
    connectionDetails: { protocolVersion: null, agentCapabilities: null, clientCapabilities: null, sessionMeta: null },
    authMethods: [],
    isAuthenticated: false,
    authDismissed: false,
    availableCommands: [],
    sessions: [],
    isLoadingSessions: false,
    autoApprovePermissions: c.autoApprovePermissions,
    devboxId: c.devboxId,
    axonId: c.axonId,
    sessionId: null,
    runloopUrl: c.runloopUrl,
    axonEvents: c.axonEvents,
    sendMessage: c.sendMessage,
    cancel: c.cancel,
    setAutoApprovePermissions: c.setAutoApprovePermissions,
    setModel: c.setModel,
    setPermissionMode: c.setPermissionMode,
    sendControlResponse: c.sendControlResponse,
    setMode: NOOP_ASYNC,
    setACPModel: NOOP_ASYNC,
    setConfigOption: NOOP_ASYNC,
    authenticate: NOOP_ASYNC,
    dismissAuth: NOOP,
    respondToPermission: NOOP_ASYNC,
    cancelPermission: NOOP_ASYNC,
    respondToElicitation: NOOP_ASYNC,
    createNewSession: NOOP_ASYNC,
    switchSession: NOOP_ASYNC,
    refreshSessions: NOOP_ASYNC,
  };
}

function mapACP(a: UseACPAgentReturn): Omit<UseAgentReturn, "start" | "shutdown"> {
  return {
    agentType: "acp",
    connectionPhase: a.connectionPhase,
    connectionStatus: a.connectionStatus,
    error: a.error,
    messages: a.messages,
    currentTurnBlocks: a.currentTurnBlocks,
    isAgentTurn: a.isAgentTurn,
    isStreaming: a.isStreaming,
    isSendingPrompt: a.isSendingPrompt,
    usage: a.usage,
    initInfo: null,
    permissionMode: null,
    currentModel: null,
    pendingControlRequest: null,
    plan: a.plan,
    toolActivity: a.toolActivity,
    fileOps: a.fileOps,
    terminals: a.terminals,
    currentMode: a.currentMode,
    availableModes: a.availableModes,
    configOptions: a.configOptions,
    availableModels: a.availableModels,
    currentModelId: a.currentModelId,
    pendingPermission: a.pendingPermission,
    pendingElicitation: a.pendingElicitation,
    agentInfo: a.agentInfo,
    connectionDetails: a.connectionDetails,
    authMethods: a.authMethods,
    isAuthenticated: a.isAuthenticated,
    authDismissed: a.authDismissed,
    availableCommands: a.availableCommands,
    sessions: a.sessions,
    isLoadingSessions: a.isLoadingSessions,
    autoApprovePermissions: a.autoApprovePermissions,
    devboxId: a.devboxId,
    axonId: a.axonId,
    sessionId: a.sessionId,
    runloopUrl: a.runloopUrl,
    axonEvents: a.axonEvents,
    sendMessage: a.sendMessage,
    cancel: a.cancel,
    setAutoApprovePermissions: a.setAutoApprovePermissions,
    setModel: NOOP_ASYNC,
    setPermissionMode: NOOP_ASYNC,
    sendControlResponse: NOOP_ASYNC,
    setMode: a.setMode,
    setACPModel: a.setModel,
    setConfigOption: a.setConfigOption,
    authenticate: a.authenticate,
    dismissAuth: a.dismissAuth,
    respondToPermission: a.respondToPermission,
    cancelPermission: a.cancelPermission,
    respondToElicitation: a.respondToElicitation as (requestId: string, action: unknown) => Promise<void>,
    createNewSession: a.createNewSession,
    switchSession: a.switchSession,
    refreshSessions: a.refreshSessions,
  };
}
