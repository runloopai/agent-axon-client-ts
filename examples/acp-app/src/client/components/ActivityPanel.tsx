import type { ToolActivity, FileOp, TerminalState } from "../hooks/useNodeAgent.js";

function sidebarKindIcon(kind: string): { className: string; label: string } {
  if (kind === "read") return { className: "read", label: "R" };
  if (kind === "write" || kind === "edit") return { className: "write", label: "W" };
  if (kind === "command" || kind === "bash" || kind === "execute") return { className: "command", label: "$" };
  return { className: "default", label: "T" };
}

export function ToolActivityItem({ activity, expanded, onToggle }: { activity: ToolActivity; expanded: boolean; onToggle: () => void }) {
  const isTerminalLike = activity.kind === "execute" || activity.kind === "command" || activity.kind === "bash";
  const icon = sidebarKindIcon(activity.kind);
  const hasExpandableContent = isTerminalLike && (activity.command || activity.output);

  return (
    <div className={`tool-activity-item ${activity.status} ${isTerminalLike ? "terminal-like" : ""}`}>
      <div className="tool-activity-header" onClick={hasExpandableContent ? onToggle : undefined} style={hasExpandableContent ? { cursor: "pointer" } : undefined}>
        <div className={`tool-call-icon ${icon.className}`}>{icon.label}</div>
        <div className="tool-activity-info">
          <div className="tool-activity-title">{activity.command ?? activity.title}</div>
          <div className="tool-activity-meta">
            <span className={`tool-activity-status ${activity.status}`}>{activity.status}</span>
            <span className="tool-activity-time">{new Date(activity.timestamp).toLocaleTimeString()}</span>
          </div>
        </div>
        {hasExpandableContent && (
          <span className={`chevron ${expanded ? "expanded" : ""}`}>{"\u25B6"}</span>
        )}
      </div>
      {expanded && activity.output && (
        <div className="tool-activity-output">
          <pre>{activity.output}</pre>
        </div>
      )}
    </div>
  );
}

export function FileOpItem({ op }: { op: FileOp }) {
  const basename = op.path.split("/").pop() ?? op.path;
  return (
    <div className={`file-op-item ${op.type}`}>
      <div className={`file-op-icon ${op.type}`}>{op.type === "read" ? "R" : "W"}</div>
      <div className="file-op-info">
        <div className="file-op-path" title={op.path}>{basename}</div>
        <div className="file-op-detail">{op.detail}</div>
      </div>
      <div className="file-op-time">{new Date(op.timestamp).toLocaleTimeString()}</div>
    </div>
  );
}

export function TerminalCard({
  terminal, expanded, onToggle,
}: {
  terminal: TerminalState;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={`terminal-card ${terminal.exited ? "exited" : "running"}`}>
      <div className="terminal-card-header" onClick={onToggle}>
        <span className={`terminal-status-dot ${terminal.exited ? "exited" : "running"}`} />
        <span className="terminal-command">{terminal.command}</span>
        <span className="terminal-id">{terminal.terminalId}</span>
        <span className={`chevron ${expanded ? "expanded" : ""}`}>{"\u25B6"}</span>
      </div>
      {expanded && (
        <div className="terminal-output">
          <pre>{terminal.output || "(no output)"}</pre>
        </div>
      )}
    </div>
  );
}
