import { useState } from "react";
import type { AxonEventView } from "../hooks/useClaudeAgent.js";

interface AxonEventSummary {
  icon: string;
  label: string;
  summary: string;
  colorClass: string;
}

function summarizeAxonEvent(event: AxonEventView): AxonEventSummary {
  let parsed: Record<string, unknown> = {};
  try { parsed = JSON.parse(event.payload); } catch { /* keep empty */ }

  const origin = event.origin?.toLowerCase() ?? "";
  const baseColor = origin.includes("user") ? "origin-user"
    : origin.includes("agent") ? "origin-agent"
    : "origin-system";

  const msgType = (parsed.type as string) ?? "";

  switch (event.event_type) {
    case "query": {
      const msg = parsed.message as { content?: string } | undefined;
      const text = typeof msg?.content === "string" ? msg.content : "";
      const preview = text.length > 80 ? text.slice(0, 80) + "\u2026" : text;
      return { icon: "\u{1F4AC}", label: "User Message", summary: preview, colorClass: "origin-user" };
    }
    case "assistant": {
      const msg = parsed.message as { content?: unknown[] } | undefined;
      const content = Array.isArray(msg?.content) ? msg.content : [];
      const textBlock = content.find((b: unknown) => (b as Record<string, unknown>)?.type === "text") as { text?: string } | undefined;
      const preview = textBlock?.text ? (textBlock.text.length > 80 ? textBlock.text.slice(0, 80) + "\u2026" : textBlock.text) : "";
      return { icon: "\u{1F4DD}", label: "Assistant", summary: preview, colorClass: "origin-agent" };
    }
    case "result": {
      const stopReason = (parsed.stop_reason as string) ?? "";
      const cost = parsed.total_cost_usd as number | undefined;
      const costStr = cost != null ? ` ($${cost.toFixed(4)})` : "";
      return { icon: "\u2705", label: "Result", summary: `${stopReason}${costStr}`, colorClass: "origin-agent" };
    }
    case "control_request": {
      const req = parsed.request as Record<string, unknown> | undefined;
      const subtype = (req?.subtype as string) ?? msgType;
      if (subtype === "initialize") return { icon: "\u26A1", label: "Initialize", summary: "Control request", colorClass: baseColor };
      if (subtype === "can_use_tool") {
        const toolName = (req?.tool_name as string) ?? "";
        return { icon: "\u{1F527}", label: "Permission", summary: toolName, colorClass: baseColor };
      }
      if (subtype === "set_model") {
        const model = (req?.model as string) ?? "";
        return { icon: "\u{1F9E0}", label: "Set Model", summary: model, colorClass: baseColor };
      }
      return { icon: "\u2699\uFE0F", label: "Control", summary: subtype, colorClass: baseColor };
    }
    case "control_response": {
      const resp = parsed.response as Record<string, unknown> | undefined;
      const subtype = (resp?.subtype as string) ?? "";
      return { icon: subtype === "error" ? "\u274C" : "\u2705", label: "Control Response", summary: subtype, colorClass: baseColor };
    }
    case "system": {
      const subtype = (parsed.subtype as string) ?? "";
      if (subtype === "init") {
        const model = (parsed.model as string) ?? "";
        return { icon: "\u26A1", label: "Init", summary: model, colorClass: "origin-system" };
      }
      return { icon: "\u{2139}\uFE0F", label: "System", summary: subtype, colorClass: "origin-system" };
    }
    default:
      return { icon: "\u{1F4E6}", label: event.event_type, summary: "", colorClass: baseColor };
  }
}

function formatTime(timestampMs: number): string {
  const d = new Date(timestampMs);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function originLabel(origin: string): string {
  switch (origin) {
    case "USER_EVENT": return "USER";
    case "AGENT_EVENT": return "AGENT";
    case "SYSTEM_EVENT": return "SYSTEM";
    case "EXTERNAL_EVENT": return "EXTERNAL";
    default: return origin;
  }
}

function originBadgeClass(origin: string): string {
  switch (origin) {
    case "USER_EVENT": return "axon-badge-user";
    case "AGENT_EVENT": return "axon-badge-agent";
    case "SYSTEM_EVENT": return "axon-badge-system";
    default: return "axon-badge-default";
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
      return <span className="axon-val axon-val-str" title={data}>"{data.slice(0, 120)}\u2026"</span>;
    }
    return <span className="axon-val axon-val-str">"{data}"</span>;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) return <span className="axon-val axon-val-null">[]</span>;
    if (depth > 3) return <span className="axon-val axon-val-null">[{data.length} items]</span>;
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
    if (entries.length === 0) return <span className="axon-val axon-val-null">{"{}"}</span>;
    if (depth > 3) return <span className="axon-val axon-val-null">{`{${entries.length} keys}`}</span>;

    return (
      <div className="axon-tree-obj">
        {entries.map(([key, val]) => {
          const isComplex = val !== null && typeof val === "object";
          return (
            <div key={key} className={`axon-tree-row ${isComplex ? "axon-tree-row-block" : ""}`}>
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
  event, expanded, onToggle, onCopy,
}: {
  event: AxonEventView;
  expanded: boolean;
  onToggle: () => void;
  onCopy: () => void;
}) {
  const summary = summarizeAxonEvent(event);
  const [showRaw, setShowRaw] = useState(false);

  let parsedPayload: unknown = event.payload;
  try { parsedPayload = JSON.parse(event.payload); } catch { /* keep string */ }

  let prettyPayload: string;
  try {
    prettyPayload = JSON.stringify(JSON.parse(event.payload), null, 2);
  } catch {
    prettyPayload = event.payload;
  }

  return (
    <div className={`event-item ${summary.colorClass} ${expanded ? "event-item-expanded" : ""}`} onClick={onToggle}>
      <div className="axon-event-header">
        <span className="axon-event-seq">#{event.sequence}</span>
        <span className="axon-event-icon">{summary.icon}</span>
        <span className="axon-event-label">{summary.label}</span>
        <span className={`axon-badge ${originBadgeClass(event.origin)}`}>{originLabel(event.origin)}</span>
        <span className="axon-event-source">{event.source}</span>
      </div>

      <div className="axon-event-sub-row">
        <span className="axon-event-summary">{summary.summary}</span>
        <span className="axon-event-time">{formatTime(event.timestamp_ms)}</span>
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
              onClick={(e) => { e.stopPropagation(); onCopy(); }}
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
