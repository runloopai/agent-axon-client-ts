import { useState } from "react";
import type { AxonEventView } from "../types.js";

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

  switch (event.event_type) {
    case "initialize": {
      const info = (parsed.serverInfo ?? parsed.clientInfo ?? parsed.agentInfo) as { name?: string; version?: string } | undefined;
      if (info?.name) return { icon: "\u26A1", label: "Initialize", summary: `${info.name} v${info.version ?? "?"}`, colorClass: baseColor };
      return { icon: "\u26A1", label: "Initialize", summary: "Initialized", colorClass: baseColor };
    }
    default: {
      const preview = event.payload.length > 60 ? event.payload.slice(0, 60) + "\u2026" : event.payload;
      return { icon: "\u{1F4E6}", label: event.event_type, summary: preview, colorClass: baseColor };
    }
  }
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

  let prettyPayload: string;
  try {
    prettyPayload = JSON.stringify(JSON.parse(event.payload), null, 2);
  } catch {
    prettyPayload = event.payload;
  }

  return (
    <div className={`event-item ${summary.colorClass} ${expanded ? "event-item-expanded" : ""}`} onClick={onToggle}>
      <div className="axon-event-header">
        <span className="axon-event-icon">{summary.icon}</span>
        <span className="axon-event-label">{summary.label}</span>
        <button
          className="btn btn-ghost axon-copy-btn"
          onClick={(e) => { e.stopPropagation(); onCopy(); }}
        >
          copy
        </button>
      </div>

      {summary.summary && (
        <div className="axon-event-summary">{summary.summary}</div>
      )}

      {expanded && (
        <div className="axon-event-detail" onClick={(e) => e.stopPropagation()}>
          <button
            className="btn btn-ghost axon-raw-toggle"
            onClick={() => setShowRaw(!showRaw)}
          >
            {showRaw ? "Hide" : "Show"} Raw JSON
          </button>
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
