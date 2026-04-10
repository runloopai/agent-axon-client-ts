import { useState } from "react";
import type { TimelineEvent } from "../types.js";
import { PayloadTree, formatTime, originLabel, originBadgeClass } from "./shared.js";

interface TimelineSummary {
  icon: string;
  label: string;
  summary: string;
  kindClass: string;
}

function parsePayload(payload: string): Record<string, unknown> | null {
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

function summarizeACPProtocol(eventType: string, data: unknown, origin: string): TimelineSummary {
  const d = (data ?? {}) as Record<string, unknown>;
  const isUser = origin === "USER_EVENT";

  switch (eventType) {
    case "session/update": {
      const update = (d.update ?? d) as Record<string, unknown>;
      const su = (update.sessionUpdate as string) ?? "";
      return { icon: "\u{1F4E6}", label: `session/update`, summary: su, kindClass: "kind-protocol" };
    }
    case "session/prompt": {
      if (isUser) {
        const prompt = d.prompt as Array<{ type: string; text?: string }> | undefined;
        const text = prompt?.find((p) => p.type === "text")?.text ?? "";
        const preview = text.length > 60 ? text.slice(0, 60) + "\u2026" : text;
        return { icon: "\u{1F4AC}", label: "session/prompt", summary: preview, kindClass: "kind-protocol" };
      }
      const stopReason = (d.stopReason as string) ?? "";
      return { icon: "\u2705", label: "session/prompt", summary: stopReason || "response", kindClass: "kind-protocol" };
    }
    case "initialize": {
      const info = (d.agentInfo ?? d.clientInfo) as { name?: string } | undefined;
      return { icon: "\u26A1", label: "initialize", summary: info?.name ?? (isUser ? "client" : "agent"), kindClass: "kind-protocol" };
    }
    case "session/new": {
      const cwd = (d.cwd as string) ?? "";
      const sid = (d.sessionId as string) ?? "";
      return { icon: "\u{1F195}", label: "session/new", summary: cwd || (sid ? sid.slice(0, 16) : ""), kindClass: "kind-protocol" };
    }
    case "session/request_permission": {
      const toolCall = d.toolCall as Record<string, unknown> | undefined;
      const title = (toolCall?.title as string) ?? "";
      if (isUser) {
        return { icon: "\u{1F512}", label: "Permission Request", summary: title, kindClass: "kind-permission" };
      }
      const outcome = (d.outcome as Record<string, unknown>)?.outcome as string ?? "";
      return { icon: outcome === "cancelled" ? "\u274C" : "\u2705", label: "Permission Response", summary: outcome || title, kindClass: "kind-permission" };
    }
    case "session/elicitation": {
      const message = (d.message as string) ?? "";
      const preview = message.length > 60 ? message.slice(0, 60) + "\u2026" : message;
      return { icon: "\u2753", label: "Elicitation", summary: preview, kindClass: "kind-permission" };
    }
    default:
      return { icon: "\u{1F4E6}", label: eventType, summary: "", kindClass: "kind-protocol" };
  }
}

function summarizeClaudeProtocol(data: unknown): TimelineSummary {
  const d = (data ?? {}) as Record<string, unknown>;
  const msgType = (d.type as string) ?? "";

  switch (msgType) {
    case "stream_event": {
      const event = d.event as Record<string, unknown> | undefined;
      const evType = (event?.type as string) ?? "";
      return { icon: "\u{1F4E1}", label: "stream_event", summary: evType, kindClass: "kind-protocol" };
    }
    case "assistant":
      return { icon: "\u{1F916}", label: "assistant", summary: "", kindClass: "kind-protocol" };
    case "user":
      return { icon: "\u{1F4AC}", label: "user", summary: "", kindClass: "kind-protocol" };
    case "result": {
      const stopReason = (d.stop_reason as string) ?? "";
      return { icon: "\u2705", label: "result", summary: stopReason, kindClass: "kind-protocol" };
    }
    case "system": {
      const subtype = (d.subtype as string) ?? "";
      return { icon: "\u2699", label: "system", summary: subtype, kindClass: "kind-protocol" };
    }
    case "control_request": {
      const request = d.request as Record<string, unknown> | undefined;
      const toolName = (request?.tool_name as string) ?? "";
      return { icon: "\u{1F512}", label: "control_request", summary: toolName, kindClass: "kind-permission" };
    }
    case "control_response":
      return { icon: "\u2705", label: "control_response", summary: "", kindClass: "kind-permission" };
    case "tool_progress":
      return { icon: "\u{1F527}", label: "tool_progress", summary: "", kindClass: "kind-protocol" };
    default:
      return { icon: "\u{1F4E6}", label: msgType || "claude", summary: "", kindClass: "kind-protocol" };
  }
}

function summarizeTimelineEvent(event: TimelineEvent): TimelineSummary {
  switch (event.kind) {
    case "system": {
      const d = event.data as { type: string; stopReason?: string; stop_reason?: string };
      const reason = d.stopReason ?? d.stop_reason ?? "";
      const suffix = reason ? ` (${reason})` : "";
      return { icon: d.type === "turn.started" ? "\u25B6\uFE0F" : d.type === "turn.completed" ? "\u23F9\uFE0F" : "\u26A0\uFE0F", label: d.type, summary: suffix, kindClass: "kind-system" };
    }
    case "acp_protocol":
      return summarizeACPProtocol(event.eventType, event.data, event.axonEvent.origin);
    case "claude_protocol":
      return summarizeClaudeProtocol(event.data);
    case "unknown": {
      const eventType = event.axonEvent.event_type;
      if (eventType === "agent_started") {
        const cfg = parsePayload(event.axonEvent.payload);
        const agentType = (cfg?.agentType as string) ?? "";
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

function kindBadgeLabel(kind: string, custom: boolean): string {
  if (custom) return "CFG";
  switch (kind) {
    case "system": return "SYS";
    case "acp_protocol": return "ACP";
    case "claude_protocol": return "CLAUDE";
    case "unknown": return "?";
    default: return kind;
  }
}

function kindBadgeClass(kind: string, custom: boolean): string {
  if (custom) return "tl-kind-custom";
  switch (kind) {
    case "system": return "tl-kind-system";
    case "acp_protocol": return "tl-kind-acp";
    case "claude_protocol": return "tl-kind-claude";
    default: return "tl-kind-unknown";
  }
}

function AgentConfigDetail({ payload }: { payload: string }) {
  const cfg = parsePayload(payload);
  if (!cfg) return <PayloadTree data={null} />;

  const entries: Array<[string, string]> = [];
  if (cfg.agentType) entries.push(["Agent Type", String(cfg.agentType)]);
  if (cfg.agentId) entries.push(["Agent ID", String(cfg.agentId)]);
  if (cfg.model) entries.push(["Model", String(cfg.model)]);
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
                <AgentConfigDetail payload={ax.payload} />
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
            {"eventType" in event && (
              <div className="axon-detail-meta-item">
                <span className="axon-detail-meta-key">eventType</span>
                <span className="axon-detail-meta-val">{(event as { eventType: string }).eventType}</span>
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
