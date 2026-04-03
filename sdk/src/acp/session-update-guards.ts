import type { SessionUpdate } from "@agentclientprotocol/sdk";

/**
 * Named types for each {@link SessionUpdate} variant, extracted from the
 * discriminated union via the `sessionUpdate` field.
 *
 * @category Session Updates
 */
export type UserMessageChunkUpdate = Extract<
  SessionUpdate,
  { sessionUpdate: "user_message_chunk" }
>;
/** @category Session Updates */
export type AgentMessageChunkUpdate = Extract<
  SessionUpdate,
  { sessionUpdate: "agent_message_chunk" }
>;
/** @category Session Updates */
export type AgentThoughtChunkUpdate = Extract<
  SessionUpdate,
  { sessionUpdate: "agent_thought_chunk" }
>;
/** @category Session Updates */
export type ToolCallSessionUpdate = Extract<SessionUpdate, { sessionUpdate: "tool_call" }>;
/** @category Session Updates */
export type ToolCallProgressSessionUpdate = Extract<
  SessionUpdate,
  { sessionUpdate: "tool_call_update" }
>;
/** @category Session Updates */
export type PlanSessionUpdate = Extract<SessionUpdate, { sessionUpdate: "plan" }>;
/** @category Session Updates */
export type AvailableCommandsSessionUpdate = Extract<
  SessionUpdate,
  { sessionUpdate: "available_commands_update" }
>;
/** @category Session Updates */
export type CurrentModeSessionUpdate = Extract<
  SessionUpdate,
  { sessionUpdate: "current_mode_update" }
>;
/** @category Session Updates */
export type ConfigOptionSessionUpdate = Extract<
  SessionUpdate,
  { sessionUpdate: "config_option_update" }
>;
/** @category Session Updates */
export type SessionInfoSessionUpdate = Extract<
  SessionUpdate,
  { sessionUpdate: "session_info_update" }
>;
/** @category Session Updates */
export type UsageSessionUpdate = Extract<SessionUpdate, { sessionUpdate: "usage_update" }>;

/**
 * Type guard for `user_message_chunk` session updates.
 * @category Session Updates
 */
export function isUserMessageChunk(u: SessionUpdate): u is UserMessageChunkUpdate {
  return u.sessionUpdate === "user_message_chunk";
}

/**
 * Type guard for `agent_message_chunk` session updates.
 * @category Session Updates
 */
export function isAgentMessageChunk(u: SessionUpdate): u is AgentMessageChunkUpdate {
  return u.sessionUpdate === "agent_message_chunk";
}

/**
 * Type guard for `agent_thought_chunk` session updates.
 * @category Session Updates
 */
export function isAgentThoughtChunk(u: SessionUpdate): u is AgentThoughtChunkUpdate {
  return u.sessionUpdate === "agent_thought_chunk";
}

/**
 * Type guard for `tool_call` session updates.
 * @category Session Updates
 */
export function isToolCall(u: SessionUpdate): u is ToolCallSessionUpdate {
  return u.sessionUpdate === "tool_call";
}

/**
 * Type guard for `tool_call_update` session updates.
 * @category Session Updates
 */
export function isToolCallProgress(u: SessionUpdate): u is ToolCallProgressSessionUpdate {
  return u.sessionUpdate === "tool_call_update";
}

/**
 * Type guard for `plan` session updates.
 * @category Session Updates
 */
export function isPlan(u: SessionUpdate): u is PlanSessionUpdate {
  return u.sessionUpdate === "plan";
}

/**
 * Type guard for `available_commands_update` session updates.
 * @category Session Updates
 */
export function isAvailableCommandsUpdate(u: SessionUpdate): u is AvailableCommandsSessionUpdate {
  return u.sessionUpdate === "available_commands_update";
}

/**
 * Type guard for `current_mode_update` session updates.
 * @category Session Updates
 */
export function isCurrentModeUpdate(u: SessionUpdate): u is CurrentModeSessionUpdate {
  return u.sessionUpdate === "current_mode_update";
}

/**
 * Type guard for `config_option_update` session updates.
 * @category Session Updates
 */
export function isConfigOptionUpdate(u: SessionUpdate): u is ConfigOptionSessionUpdate {
  return u.sessionUpdate === "config_option_update";
}

/**
 * Type guard for `session_info_update` session updates.
 * @category Session Updates
 */
export function isSessionInfoUpdate(u: SessionUpdate): u is SessionInfoSessionUpdate {
  return u.sessionUpdate === "session_info_update";
}

/**
 * Type guard for `usage_update` session updates.
 * @category Session Updates
 */
export function isUsageUpdate(u: SessionUpdate): u is UsageSessionUpdate {
  return u.sessionUpdate === "usage_update";
}
