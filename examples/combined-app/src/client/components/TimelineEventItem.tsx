import { useState } from "react";
import { SYSTEM_EVENT_TYPES } from "@runloop/agent-axon-client/shared";
import { tryParseTimelinePayload } from "@runloop/agent-axon-client/acp";
import type {
  ACPProtocolTimelineEvent,
  InitializeRequest,
  InitializeResponse,
  NewSessionRequest,
  NewSessionResponse,
  PromptRequest,
  PromptResponse,
  RequestPermissionRequest,
  RequestPermissionResponse,
  SessionNotification,
} from "@runloop/agent-axon-client/acp";
import type {
  ClaudeProtocolTimelineEvent,
  SDKControlRequest,
  SDKPartialAssistantMessage,
  SDKResultMessage,
  SDKSystemMessage,
} from "@runloop/agent-axon-client/claude";
import type { AgentStartedPayload, TimelineEvent } from "../types.js";
import { PayloadTree, formatTime, originLabel, originBadgeClass } from "./shared.js";

type TimelineKind = "system" | "acp_protocol" | "claude_protocol" | "unknown";

interface TimelineSummary {
  icon: string;
  label: string;
  summary: string;
  kindClass: string;
}

function hasEventType(event: TimelineEvent): event is TimelineEvent & { eventType: string } {
  return "eventType" in event;
}

function summarizeACPProtocol(event: ACPProtocolTimelineEvent): TimelineSummary {
  const isUser = event.axonEvent.origin === "USER_EVENT";

  switch (event.eventType) {
    case "session/update": {
      const d = event.data as SessionNotification;
      const su = d.update?.sessionUpdate ?? d.sessionId ?? "";
      return { icon: "\u{1F4E6}", label: "session/update", summary: su, kindClass: "kind-protocol" };
    }
    case "session/prompt": {
      if (isUser) {
        const d = event.data as PromptRequest;
        const textBlock = d.prompt?.find((p) => p.type === "text");
        const text = textBlock && "text" in textBlock ? (textBlock as { text: string }).text : "";
        const preview = text.length > 60 ? `${text.slice(0, 60)}\u2026` : text;
        return { icon: "\u{1F4AC}", label: "session/prompt", summary: preview, kindClass: "kind-protocol" };
      }
      const d = event.data as PromptResponse;
      return { icon: "\u2705", label: "session/prompt", summary: d.stopReason || "response", kindClass: "kind-protocol" };
    }
    case "initialize": {
      const d = event.data as InitializeRequest | InitializeResponse;
      const name = ("agentInfo" in d ? d.agentInfo?.name : undefined)
        ?? ("clientInfo" in d ? d.clientInfo?.name : undefined);
      return { icon: "\u26A1", label: "initialize", summary: name ?? (isUser ? "client" : "agent"), kindClass: "kind-protocol" };
    }
    case "session/new": {
      if (isUser) {
        const d = event.data as NewSessionRequest;
        return { icon: "\u{1F195}", label: "session/new", summary: d.cwd ?? "", kindClass: "kind-protocol" };
      }
      const d = event.data as NewSessionResponse;
      return { icon: "\u{1F195}", label: "session/new", summary: d.sessionId ? d.sessionId.slice(0, 16) : "", kindClass: "kind-protocol" };
    }
    default: {
      const { eventType } = event;
      if (eventType === "session/request_permission") {
        if (isUser) {
          const d = event.data as RequestPermissionRequest;
          return { icon: "\u{1F512}", label: "Permission Request", summary: d.toolCall?.title ?? "", kindClass: "kind-permission" };
        }
        const d = event.data as RequestPermissionResponse;
        const outcome = d.outcome && "outcome" in d.outcome ? (d.outcome as { outcome?: string }).outcome ?? "" : "";
        return { icon: outcome === "cancelled" ? "\u274C" : "\u2705", label: "Permission Response", summary: outcome, kindClass: "kind-permission" };
      }
      if (eventType === "session/elicitation") {
        const d = event.data as { message?: string };
        const message = d.message ?? "";
        const preview = message.length > 60 ? `${message.slice(0, 60)}\u2026` : message;
        return { icon: "\u2753", label: "Elicitation", summary: preview, kindClass: "kind-permission" };
      }
      return { icon: "\u{1F4E6}", label: eventType, summary: "", kindClass: "kind-protocol" };
    }
  }
}

function summarizeClaudeProtocol(event: ClaudeProtocolTimelineEvent): TimelineSummary {
  const { data } = event;

  switch (event.eventType) {
    case "query":
      return { icon: "\u{1F4AC}", label: "user", summary: "", kindClass: "kind-protocol" };
    case "assistant":
      return { icon: "\u{1F916}", label: "assistant", summary: "", kindClass: "kind-protocol" };
    case "result": {
      const d = data as SDKResultMessage;
      const stopReason = "subtype" in d ? d.subtype : "";
      return { icon: "\u2705", label: "result", summary: stopReason, kindClass: "kind-protocol" };
    }
    case "system": {
      const d = data as SDKSystemMessage;
      return { icon: "\u2699", label: "system", summary: d.subtype ?? "", kindClass: "kind-protocol" };
    }
    case "control_request": {
      const d = data as SDKControlRequest;
      const toolName = d.request && "tool_name" in d.request ? (d.request as { tool_name?: string }).tool_name ?? "" : "";
      return { icon: "\u{1F512}", label: "control_request", summary: toolName, kindClass: "kind-permission" };
    }
    case "control_response":
      return { icon: "\u2705", label: "control_response", summary: "", kindClass: "kind-permission" };
    default: {
      const d = data as { type?: string };
      const msgType = d.type ?? "";
      if (msgType === "stream_event") {
        const streamData = data as SDKPartialAssistantMessage;
        return { icon: "\u{1F4E1}", label: "stream_event", summary: streamData.event?.type ?? "", kindClass: "kind-protocol" };
      }
      if (msgType === "tool_progress") {
        return { icon: "\u{1F527}", label: "tool_progress", summary: "", kindClass: "kind-protocol" };
      }
      return { icon: "\u{1F4E6}", label: msgType || "claude", summary: "", kindClass: "kind-protocol" };
    }
  }
}

function summarizeTimelineEvent(event: TimelineEvent): TimelineSummary {
  switch (event.kind) {
    case "system": {
      const d = event.data;
      const reason = ("stopReason" in d ? d.stopReason : undefined) ?? "";
      const suffix = reason ? ` (${reason})` : "";
      const icon = d.type === SYSTEM_EVENT_TYPES.TURN_STARTED ? "\u25B6\uFE0F"
        : d.type === SYSTEM_EVENT_TYPES.TURN_COMPLETED ? "\u23F9\uFE0F"
        : "\u26A0\uFE0F";
      return { icon, label: d.type, summary: suffix, kindClass: "kind-system" };
    }
    case "acp_protocol":
      return summarizeACPProtocol(event);
    case "claude_protocol":
      return summarizeClaudeProtocol(event);
    case "unknown": {
      const eventType = event.axonEvent.event_type;
      if (eventType === "agent_started") {
        const cfg = tryParseTimelinePayload<AgentStartedPayload>({ axonEvent: event.axonEvent });
        const agentType = cfg?.agentType ?? "";
        return { icon: "\u2699\uFE0F", label: "Agent Started", summary: agentType, kindClass: "kind-custom" };
      }
      return { icon: "\u2753", label: eventType, summary: "unclassified", kindClass: "kind-unknown" };
    }
    default:
      return { icon: "\u{1F4E6}", label: "event", summary: "", kindClass: "kind-unknown" };
  }
}

function isCustomEvent(event: TimelineEvent): boolean {
  return event.kind === "unknown" && event.axonEvent.event_type === "agent_started";
}

function kindBadgeLabel(kind: TimelineKind, custom: boolean): string {
  if (custom) return "CFG";
  switch (kind) {
    case "system": return "SYS";
    case "acp_protocol": return "ACP";
    case "claude_protocol": return "CLAUDE";
    case "unknown": return "?";
  }
}

function kindBadgeClass(kind: TimelineKind, custom: boolean): string {
  if (custom) return "tl-kind-custom";
  switch (kind) {
    case "system": return "tl-kind-system";
    case "acp_protocol": return "tl-kind-acp";
    case "claude_protocol": return "tl-kind-claude";
    case "unknown": return "tl-kind-unknown";
  }
}

function AgentConfigDetail({ event }: { event: TimelineEvent }) {
  const cfg = tryParseTimelinePayload<AgentStartedPayload>({ axonEvent: event.axonEvent });
  if (!cfg) return <PayloadTree data={null} />;

  const entries: Array<[string, string]> = [];
  if (cfg.agentType) entries.push(["Agent Type", cfg.agentType]);
  if (cfg.agentId) entries.push(["Agent ID", cfg.agentId]);
  if (cfg.model) entries.push(["Model", cfg.model]);
  if (cfg.agentBinary) entries.push(["Agent Binary", String(cfg.agentBinary)]);
  if (cfg.blueprintName) entries.push(["Blueprint", String(cfg.blueprintName)]);
  if (cfg.systemPrompt) entries.push(["System Prompt", String(cfg.systemPrompt)]);
  if (cfg.launchArgs) entries.push(["Launch Args", Array.isArray(cfg.launchArgs) ? cfg.launchArgs.join(" ") : String(cfg.launchArgs)]);
  if (cfg.launchCommands) entries.push(["Launch Commands", Array.isArray(cfg.launchCommands) ? cfg.launchCommands.join("\n") : String(cfg.launchCommands)]);
  const autoApprove = cfg.autoApprovePermissions ?? cfg.dangerouslySkipPermissions;
  if (autoApprove != null) entries.push(["Auto-approve", String(autoApprove)]);

  return (
    <div className="agent-config-detail">
      {entries.map(([key, value]) => (
        <div key={key} className="agent-config-row">
          <span className="agent-config-key">{key}</span>
          <span className="agent-config-val">{value}</span>
        </div>
      ))}
    </div>
  );
}

export function TimelineEventItem({
  event, expanded, onToggle, onCopy,
}: {
  event: TimelineEvent;
  expanded: boolean;
  onToggle: () => void;
  onCopy: () => void;
}) {
  const summary = summarizeTimelineEvent(event);
  const ax = event.axonEvent;
  const [showRaw, setShowRaw] = useState(false);
  const custom = isCustomEvent(event);

  return (
    <div className={`event-item ${summary.kindClass} ${expanded ? "event-item-expanded" : ""}`} onClick={onToggle}>
      <div className="axon-event-header">
        <span className="axon-event-seq">#{ax.sequence}</span>
        <span className="axon-event-icon">{summary.icon}</span>
        <span className="axon-event-label">{summary.label}</span>
        <span className={`axon-badge tl-kind-badge ${kindBadgeClass(event.kind, custom)}`}>{kindBadgeLabel(event.kind, custom)}</span>
        <span className={`axon-badge ${originBadgeClass(ax.origin)}`}>{originLabel(ax.origin)}</span>
      </div>

      <div className="axon-event-sub-row">
        <span className="axon-event-summary">{summary.summary}</span>
        <span className="axon-event-time">{formatTime(ax.timestamp_ms)}</span>
      </div>

      {expanded && (
        <div className="axon-event-detail" onClick={(e) => e.stopPropagation()}>
          <div className="axon-detail-section">
            <div className="axon-payload-tree">
              {custom ? (
                <AgentConfigDetail event={event} />
              ) : (
                <PayloadTree data={event.data} />
              )}
            </div>
          </div>

          <div className="axon-detail-meta">
            <div className="axon-detail-meta-item">
              <span className="axon-detail-meta-key">kind</span>
              <span className="axon-detail-meta-val">{custom ? "agent_started" : event.kind}</span>
            </div>
            {hasEventType(event) && (
              <div className="axon-detail-meta-item">
                <span className="axon-detail-meta-key">eventType</span>
                <span className="axon-detail-meta-val">{event.eventType}</span>
              </div>
            )}
            <div className="axon-detail-meta-item">
              <span className="axon-detail-meta-key">sequence</span>
              <span className="axon-detail-meta-val">{ax.sequence}</span>
            </div>
          </div>

          <div className="axon-detail-actions">
            <button
              className="btn btn-ghost axon-raw-toggle"
              onClick={() => setShowRaw(!showRaw)}
            >
              {showRaw ? "Hide" : "Show"} Raw JSON
            </button>
            <button
              className="btn btn-ghost axon-copy-btn"
              onClick={(e) => { e.stopPropagation(); onCopy(); }}
            >
              Copy
            </button>
          </div>
          {showRaw && (
            <div className="axon-event-raw">
              <pre>{JSON.stringify(event, null, 2)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
