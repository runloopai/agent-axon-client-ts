import type { ACPTimelineEvent, ElicitationRequest, RequestPermissionRequest } from "@runloop/agent-axon-client/acp";
import type { ClaudeTimelineEvent, SDKControlRequest } from "@runloop/agent-axon-client/claude";

export type BaseWsEvent =
  | { type: "timeline_event"; event: ACPTimelineEvent | ClaudeTimelineEvent }
  | { type: "connection_progress"; step: string }
  | { type: "turn_error"; error: string }
  | { type: "control_request"; controlRequest: SDKControlRequest }
  | { type: "permission_request"; requestId: string; request: RequestPermissionRequest }
  | { type: "permission_dismissed" }
  | { type: "elicitation_request"; requestId: string; request: ElicitationRequest }
  | { type: "elicitation_dismissed" };

export type WsEvent = BaseWsEvent & { agentId: string };
