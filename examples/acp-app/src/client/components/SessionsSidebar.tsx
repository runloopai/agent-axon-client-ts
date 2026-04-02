import type { SessionListEntry } from "../hooks/useNodeAgent.js";

export function SessionsSidebar({
  sessions, activeSessionId, isLoading, onNewSession, onSwitchSession, onRefresh,
}: {
  sessions: SessionListEntry[];
  activeSessionId: string | null;
  isLoading: boolean;
  onNewSession: () => void;
  onSwitchSession: (sessionId: string) => void;
  onRefresh: () => void;
}) {
  return (
    <div className="sessions-sidebar">
      <div className="sessions-header">
        <h3>Sessions</h3>
        <div className="sessions-actions">
          <button className="btn btn-ghost" onClick={onRefresh} disabled={isLoading} title="Refresh sessions">
            {isLoading ? "..." : "Refresh"}
          </button>
          <button className="btn btn-ghost sessions-new-btn" onClick={onNewSession}>+ New</button>
        </div>
      </div>
      <div className="sessions-list">
        {sessions.length === 0 && <div className="empty-state sessions-empty">No sessions</div>}
        {sessions.map((s) => (
          <div
            key={s.sessionId}
            className={`session-item ${s.sessionId === activeSessionId ? "active" : ""}`}
            onClick={() => onSwitchSession(s.sessionId)}
          >
            <div className="session-item-title">{s.title || `Session ${s.sessionId.slice(0, 8)}`}</div>
            <div className="session-item-meta">
              <span className="session-item-id">{s.sessionId.slice(0, 12)}</span>
              {s.updatedAt && (
                <span className="session-item-time">{new Date(s.updatedAt).toLocaleTimeString()}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
