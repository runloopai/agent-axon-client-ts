import { useState } from "react";
import type { SessionUpdate } from "@runloop/agent-axon-client/acp";
import type { AxonEventView } from "../hooks/useNodeAgent.js";

interface AxonEventSummary {
  icon: string;
  label: string;
  summary: string;
  colorClass: string;
}

function summarizeAxonEvent(event: AxonEventView): AxonEventSummary {
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(event.payload);
  } catch {
    /* keep empty */
  }

  const origin = event.origin?.toLowerCase() ?? "";
  const baseColor = origin.includes("user")
    ? "origin-user"
    : origin.includes("agent")
      ? "origin-agent"
      : "origin-system";

  switch (event.event_type) {
    case "initialize": {
      const info = (parsed.serverInfo ??
        parsed.clientInfo ??
        parsed.agentInfo) as { name?: string; version?: string } | undefined;
      if (info?.name)
        return {
          icon: "\u26A1",
          label: "Initialize",
          summary: `${info.name} v${info.version ?? "?"}`,
          colorClass: baseColor,
        };
      return {
        icon: "\u26A1",
        label: "Initialize",
        summary: "Initialized",
        colorClass: baseColor,
      };
    }
    case "session/new": {
      const sid = (parsed.sessionId as string) ?? "";
      const cwd = (parsed.cwd as string) ?? "";
      const modes = parsed.modes as
        | { availableModes?: Array<{ id: string }> }
        | undefined;
      const modeList = modes?.availableModes?.map((m) => m.id).join(", ") ?? "";
      const detail = cwd
        ? `cwd: ${cwd}`
        : sid
          ? `session: ${sid.slice(0, 16)}`
          : "";
      const modeSuffix = modeList ? ` [${modeList}]` : "";
      return {
        icon: "\u{1F195}",
        label: "New Session",
        summary: `${detail}${modeSuffix}`,
        colorClass: baseColor,
      };
    }
    case "session/prompt": {
      if (origin.includes("user")) {
        const prompt = parsed.prompt as
          | Array<{ type: string; text?: string }>
          | undefined;
        const text = prompt?.find((p) => p.type === "text")?.text ?? "";
        const preview = text.length > 80 ? text.slice(0, 80) + "\u2026" : text;
        return {
          icon: "\u{1F4AC}",
          label: "Prompt",
          summary: preview,
          colorClass: "origin-user",
        };
      }
      const stopReason = (parsed.stopReason as string) ?? "complete";
      return {
        icon: "\u2705",
        label: "Turn Complete",
        summary: stopReason,
        colorClass: "origin-agent",
      };
    }
    case "turn.started":
      return {
        icon: "\u25B6\uFE0F",
        label: "Turn Started",
        summary: `turn_id: ${parsed.turn_id ?? ""}`,
        colorClass: "origin-system",
      };
    case "turn.completed": {
      const reason = (parsed.stop_reason as string) ?? "";
      return {
        icon: "\u23F9\uFE0F",
        label: "Turn Completed",
        summary: reason,
        colorClass: "origin-system",
      };
    }
    case "session/update": {
      const update = (parsed.update ?? parsed) as SessionUpdate;
      switch (update.sessionUpdate) {
        case "agent_message_chunk": {
          const text =
            update.content.type === "text" ? update.content.text : "";
          const preview =
            text.length > 60 ? text.slice(0, 60) + "\u2026" : text;
          return {
            icon: "\u{1F4DD}",
            label: "Agent Message",
            summary: preview,
            colorClass: "origin-agent",
          };
        }
        case "agent_thought_chunk": {
          const text =
            update.content.type === "text" ? update.content.text : "";
          const preview =
            text.length > 60 ? text.slice(0, 60) + "\u2026" : text;
          return {
            icon: "\u{1F4AD}",
            label: "Thinking",
            summary: preview,
            colorClass: "origin-thinking",
          };
        }
        case "tool_call": {
          const kind = update.kind ?? "";
          return {
            icon: "\u{1F527}",
            label: "Tool Call",
            summary: `${update.title}${kind ? ` (${kind})` : ""}`,
            colorClass: "origin-agent",
          };
        }
        case "tool_call_update": {
          const title = update.title ?? "";
          const status = update.status ?? "";
          const failed = status === "failed";
          const rawInput = update.rawInput as
            | Record<string, unknown>
            | undefined;
          const cmd = (rawInput?.command as string) ?? "";
          const detail = cmd ? `${cmd}` : title;
          return {
            icon: failed ? "\u274C" : "\u{1F527}",
            label: "Tool Update",
            summary: `${detail} \u2014 ${status}`,
            colorClass: failed ? "origin-error" : "origin-agent",
          };
        }
        case "current_mode_update":
          return {
            icon: "\u{1F500}",
            label: "Mode",
            summary: update.currentModeId,
            colorClass: "origin-system",
          };
        case "plan":
          return {
            icon: "\u{1F4CB}",
            label: "Plan",
            summary: `${update.entries.length} steps`,
            colorClass: "origin-agent",
          };
        case "usage_update":
          return {
            icon: "\u{1F4CA}",
            label: "Usage",
            summary: `${update.used}/${update.size} tokens`,
            colorClass: "origin-system",
          };
        case "available_commands_update": {
          const cmds =
            (
              update as unknown as {
                availableCommands: Array<{ name: string }>;
              }
            ).availableCommands ?? [];
          return {
            icon: "\u{1F4CB}",
            label: "Commands",
            summary: cmds.map((c) => c.name).join(", "),
            colorClass: "origin-system",
          };
        }
        case "session_info_update":
          return {
            icon: "\u{2139}\uFE0F",
            label: "Session Info",
            summary: (update as unknown as { title?: string }).title ?? "",
            colorClass: "origin-system",
          };
        default: {
          const su =
            ((update as Record<string, unknown>).sessionUpdate as string) ?? "";
          if (su === "turn_start")
            return {
              icon: "\u25B6",
              label: "Turn Start",
              summary: "",
              colorClass: "origin-system",
            };
          if (su === "turn_end")
            return {
              icon: "\u23F9",
              label: "Turn End",
              summary: "",
              colorClass: "origin-system",
            };
          return {
            icon: "\u{1F4E6}",
            label: su || "Update",
            summary: "",
            colorClass: baseColor,
          };
        }
      }
    }
    default:
      return {
        icon: "\u{1F4E6}",
        label: event.event_type,
        summary: "",
        colorClass: baseColor,
      };
  }
}

function formatTime(timestampMs: number): string {
  const d = new Date(timestampMs);
  return d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function originLabel(origin: string): string {
  switch (origin) {
    case "USER_EVENT":
      return "USER";
    case "AGENT_EVENT":
      return "AGENT";
    case "SYSTEM_EVENT":
      return "SYSTEM";
    case "EXTERNAL_EVENT":
      return "EXTERNAL";
    default:
      return origin;
  }
}

function originBadgeClass(origin: string): string {
  switch (origin) {
    case "USER_EVENT":
      return "axon-badge-user";
    case "AGENT_EVENT":
      return "axon-badge-agent";
    case "SYSTEM_EVENT":
      return "axon-badge-system";
    default:
      return "axon-badge-default";
  }
}

function PayloadTree({ data, depth = 0 }: { data: unknown; depth?: number }) {
  if (data === null || data === undefined) {
    return <span className="axon-val axon-val-null">null</span>;
  }

  if (typeof data === "boolean") {
    return <span className="axon-val axon-val-bool">{String(data)}</span>;
  }

  if (typeof data === "number") {
    return <span className="axon-val axon-val-num">{data}</span>;
  }

  if (typeof data === "string") {
    if (data.length > 120) {
      return (
        <span className="axon-val axon-val-str" title={data}>
          "{data.slice(0, 120)}\u2026"
        </span>
      );
    }
    return <span className="axon-val axon-val-str">"{data}"</span>;
  }

  if (Array.isArray(data)) {
    if (data.length === 0)
      return <span className="axon-val axon-val-null">[]</span>;
    if (depth > 3)
      return (
        <span className="axon-val axon-val-null">[{data.length} items]</span>
      );
    return (
      <div className="axon-tree-array">
        {data.map((item, i) => (
          <div key={i} className="axon-tree-row">
            <span className="axon-tree-idx">[{i}]</span>
            <PayloadTree data={item} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }

  if (typeof data === "object") {
    const entries = Object.entries(data as Record<string, unknown>);
    if (entries.length === 0)
      return <span className="axon-val axon-val-null">{"{}"}</span>;
    if (depth > 3)
      return (
        <span className="axon-val axon-val-null">{`{${entries.length} keys}`}</span>
      );

    return (
      <div className="axon-tree-obj">
        {entries.map(([key, val]) => {
          const isComplex = val !== null && typeof val === "object";
          return (
            <div
              key={key}
              className={`axon-tree-row ${isComplex ? "axon-tree-row-block" : ""}`}
            >
              <span className="axon-tree-key">{key}:</span>
              <PayloadTree data={val} depth={depth + 1} />
            </div>
          );
        })}
      </div>
    );
  }

  return <span className="axon-val">{String(data)}</span>;
}

export function AxonEventItem({
  event,
  expanded,
  onToggle,
  onCopy,
}: {
  event: AxonEventView;
  expanded: boolean;
  onToggle: () => void;
  onCopy: () => void;
}) {
  const summary = summarizeAxonEvent(event);
  const [showRaw, setShowRaw] = useState(false);

  let parsedPayload: unknown = event.payload;
  try {
    parsedPayload = JSON.parse(event.payload);
  } catch {
    /* keep string */
  }

  let prettyPayload: string;
  try {
    prettyPayload = JSON.stringify(JSON.parse(event.payload), null, 2);
  } catch {
    prettyPayload = event.payload;
  }

  return (
    <div
      className={`event-item ${summary.colorClass} ${expanded ? "event-item-expanded" : ""}`}
      onClick={onToggle}
    >
      <div className="axon-event-header">
        <span className="axon-event-seq">#{event.sequence}</span>
        <span className="axon-event-icon">{summary.icon}</span>
        <span className="axon-event-label">{summary.label}</span>
        <span className={`axon-badge ${originBadgeClass(event.origin)}`}>
          {originLabel(event.origin)}
        </span>
        <span className="axon-event-source">{event.source}</span>
      </div>

      <div className="axon-event-sub-row">
        <span className="axon-event-summary">{summary.summary}</span>
        <span className="axon-event-time">
          {formatTime(event.timestamp_ms)}
        </span>
      </div>

      {expanded && (
        <div className="axon-event-detail" onClick={(e) => e.stopPropagation()}>
          <div className="axon-detail-section">
            <div className="axon-detail-header">Payload</div>
            <div className="axon-payload-tree">
              <PayloadTree data={parsedPayload} />
            </div>
          </div>

          <div className="axon-detail-meta">
            <div className="axon-detail-meta-item">
              <span className="axon-detail-meta-key">axon_id</span>
              <span className="axon-detail-meta-val">{event.axon_id}</span>
            </div>
            <div className="axon-detail-meta-item">
              <span className="axon-detail-meta-key">timestamp_ms</span>
              <span className="axon-detail-meta-val">{event.timestamp_ms}</span>
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
              onClick={(e) => {
                e.stopPropagation();
                onCopy();
              }}
            >
              Copy
            </button>
          </div>
          {showRaw && (
            <div className="axon-event-raw">
              <pre>{prettyPayload}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
