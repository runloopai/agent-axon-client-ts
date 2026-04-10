import { useCallback } from "react";
import { useClaudeAgent } from "./useClaudeAgent.js";
import { useACPAgent } from "./useACPAgent.js";
import type { AgentType, UseAgentReturn } from "../types.js";

const NOOP_ASYNC = async () => {};

export function useAgent(agentId: string | null, agentType: AgentType | null): UseAgentReturn {
  // React's rules of hooks require that hooks are called unconditionally in the
  // same order every render. We pass null as agentId to the inactive hook so it
  // stays idle (no WebSocket, no state updates) while satisfying the constraint.
  const claude = useClaudeAgent(agentType === "claude" ? agentId : null);
  const acp = useACPAgent(agentType === "acp" ? agentId : null);

  const shutdown = useCallback(async () => {
    if (agentType === "claude") {
      await claude.shutdown();
    } else if (agentType === "acp") {
      await acp.shutdown();
    }
  }, [agentType, claude.shutdown, acp.shutdown]);

  if (agentType === "claude") {
    return {
      agentType: "claude",
      connectionPhase: claude.connectionPhase,
      connectionStatus: claude.connectionStatus,
      error: claude.error,
      messages: claude.messages,
      currentTurnBlocks: claude.currentTurnBlocks,
      isAgentTurn: claude.isAgentTurn,
      isStreaming: claude.isStreaming,
      isSendingPrompt: claude.isSendingPrompt,
      usage: claude.usage,
      autoApprovePermissions: claude.autoApprovePermissions,
      devboxId: claude.devboxId,
      axonId: claude.axonId,
      runloopUrl: claude.runloopUrl,
      axonEvents: claude.axonEvents,
      timelineEvents: claude.timelineEvents,
      availableCommands: (claude.initInfo?.slashCommands ?? []).map((name) => ({ name, description: "" })),
      initInfo: claude.initInfo,
      permissionMode: claude.permissionMode,
      currentModel: claude.currentModel,
      pendingControlRequest: claude.pendingControlRequest,
      sendMessage: claude.sendMessage,
      cancel: claude.cancel,
      shutdown,
      setAutoApprovePermissions: claude.setAutoApprovePermissions,
      setModel: claude.setModel,
      setPermissionMode: claude.setPermissionMode,
      sendControlResponse: claude.sendControlResponse,
    };
  }

  if (agentType === "acp") {
    return {
      agentType: "acp",
      connectionPhase: acp.connectionPhase,
      connectionStatus: acp.connectionStatus,
      error: acp.error,
      messages: acp.messages,
      currentTurnBlocks: acp.currentTurnBlocks,
      isAgentTurn: acp.isAgentTurn,
      isStreaming: acp.isStreaming,
      isSendingPrompt: acp.isSendingPrompt,
      usage: acp.usage,
      autoApprovePermissions: acp.autoApprovePermissions,
      devboxId: acp.devboxId,
      axonId: acp.axonId,
      runloopUrl: acp.runloopUrl,
      axonEvents: acp.axonEvents,
      timelineEvents: acp.timelineEvents,
      availableCommands: acp.availableCommands,
      plan: acp.plan,
      toolActivity: acp.toolActivity,
      fileOps: [], // Not yet plumbed from the SDK timeline events
      terminals: new Map(), // Not yet plumbed from the SDK timeline events
      currentMode: acp.currentMode,
      availableModes: acp.availableModes,
      configOptions: acp.configOptions,
      availableModels: acp.availableModels,
      currentModelId: acp.currentModelId,
      pendingPermission: acp.pendingPermission,
      pendingElicitation: acp.pendingElicitation,
      agentInfo: acp.agentInfo,
      connectionDetails: acp.connectionDetails,
      authMethods: acp.authMethods,
      isAuthenticated: acp.isAuthenticated,
      authDismissed: acp.authDismissed,
      sessions: acp.sessions,
      isLoadingSessions: acp.isLoadingSessions,
      sessionId: acp.sessionId,
      sendMessage: acp.sendMessage,
      cancel: acp.cancel,
      shutdown,
      setAutoApprovePermissions: acp.setAutoApprovePermissions,
      setMode: acp.setMode,
      setACPModel: acp.setModel,
      setConfigOption: acp.setConfigOption,
      authenticate: acp.authenticate,
      dismissAuth: acp.dismissAuth,
      respondToPermission: acp.respondToPermission,
      cancelPermission: acp.cancelPermission,
      respondToElicitation: acp.respondToElicitation as (requestId: string, action: unknown) => Promise<void>,
      createNewSession: acp.createNewSession,
      switchSession: acp.switchSession,
      refreshSessions: acp.refreshSessions,
    };
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
    autoApprovePermissions: true,
    devboxId: null,
    axonId: null,
    runloopUrl: null,
    axonEvents: [],
    timelineEvents: [],
    availableCommands: [],
    sendMessage: NOOP_ASYNC,
    cancel: NOOP_ASYNC,
    shutdown,
    setAutoApprovePermissions: NOOP_ASYNC,
  };
}
