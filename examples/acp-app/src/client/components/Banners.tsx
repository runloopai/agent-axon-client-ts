import { useState } from "react";
import type {
  AgentInfo,
  AuthMethod,
  ConnectionDetails,
  AvailableCommand,
  SessionMode,
} from "../hooks/useNodeAgent.js";

function CapBadge({ label, supported }: { label: string; supported: boolean }) {
  return (
    <span className={`cap-badge ${supported ? "cap-yes" : "cap-no"}`}>
      {supported ? "\u2713" : "\u2717"} {label}
    </span>
  );
}

function KVRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="conn-kv">
      <span className="conn-kv-key">{label}</span>
      <span className="conn-kv-val">{value}</span>
    </div>
  );
}

export function ConnectionInfoBanner({
  info,
  connectionDetails,
  sessionId,
  currentMode,
  availableModes,
  availableCommands,
}: {
  info: AgentInfo;
  connectionDetails: ConnectionDetails;
  sessionId: string | null;
  currentMode: string | null;
  availableModes: SessionMode[];
  availableCommands: AvailableCommand[];
}) {
  const [expanded, setExpanded] = useState(false);
  const displayName = info.title ?? info.name ?? "Agent";
  const ac = connectionDetails.agentCapabilities;
  const cc = connectionDetails.clientCapabilities;
  const meta = connectionDetails.sessionMeta;
  const opencodeMeta = meta?.opencode as { availableVariants?: string[]; modelId?: string; variant?: string | null } | undefined;

  return (
    <div className={`conn-banner ${expanded ? "conn-banner-expanded" : ""}`}>
      <div className="conn-banner-header" onClick={() => setExpanded(!expanded)}>
        <span className="conn-banner-dot" />
        <span className="conn-banner-title">
          <strong>{displayName}</strong>
          {info.version && <span className="conn-banner-version">v{info.version}</span>}
          {" connected"}
        </span>
        {connectionDetails.protocolVersion != null && (
          <span className="conn-banner-proto">ACP v{connectionDetails.protocolVersion}</span>
        )}
        <span className={`chevron conn-banner-chevron ${expanded ? "expanded" : ""}`}>{"\u25B6"}</span>
      </div>

      {!expanded && ac && (
        <div className="conn-banner-summary">
          {ac.promptCapabilities?.image && <span className="cap-badge cap-yes cap-inline">image</span>}
          {ac.promptCapabilities?.embeddedContext && <span className="cap-badge cap-yes cap-inline">context</span>}
          {ac.mcpCapabilities?.http && <span className="cap-badge cap-yes cap-inline">mcp</span>}
          {ac.sessionCapabilities?.list && <span className="cap-badge cap-yes cap-inline">sessions</span>}
          {opencodeMeta?.modelId && (
            <span className="conn-model-chip">{opencodeMeta.modelId}</span>
          )}
        </div>
      )}

      {expanded && (
        <div className="conn-banner-body">
          {ac && (
            <div className="conn-section">
              <div className="conn-section-title">Agent Capabilities</div>
              <div className="conn-caps">
                <CapBadge label="Image prompts" supported={!!ac.promptCapabilities?.image} />
                <CapBadge label="Audio prompts" supported={!!ac.promptCapabilities?.audio} />
                <CapBadge label="Embedded context" supported={!!ac.promptCapabilities?.embeddedContext} />
                <CapBadge label="MCP (HTTP)" supported={!!ac.mcpCapabilities?.http} />
                <CapBadge label="MCP (SSE)" supported={!!ac.mcpCapabilities?.sse} />
                <CapBadge label="Load session" supported={!!ac.loadSession} />
                <CapBadge label="List sessions" supported={!!ac.sessionCapabilities?.list} />
              </div>
            </div>
          )}

          {cc && (
            <div className="conn-section">
              <div className="conn-section-title">Client Capabilities</div>
              <div className="conn-caps">
                <CapBadge label="Read files" supported={!!cc.fs?.readTextFile} />
                <CapBadge label="Write files" supported={!!cc.fs?.writeTextFile} />
                <CapBadge label="Terminal" supported={!!cc.terminal} />
                <CapBadge label="Elicitation" supported={!!cc.elicitation} />
              </div>
            </div>
          )}

          <div className="conn-section">
            <div className="conn-section-title">Session</div>
            <div className="conn-details">
              {sessionId && <KVRow label="Session ID" value={<code>{sessionId}</code>} />}
              {currentMode && <KVRow label="Mode" value={currentMode} />}
              {opencodeMeta?.modelId && <KVRow label="Model" value={<code>{opencodeMeta.modelId}</code>} />}
              {opencodeMeta?.availableVariants && opencodeMeta.availableVariants.length > 0 && (
                <KVRow label="Variants" value={opencodeMeta.availableVariants.join(", ")} />
              )}
              {connectionDetails.protocolVersion != null && (
                <KVRow label="Protocol" value={`ACP v${connectionDetails.protocolVersion}`} />
              )}
            </div>
          </div>

          {availableModes.length > 0 && (
            <div className="conn-section">
              <div className="conn-section-title">Available Modes</div>
              <div className="conn-modes-list">
                {availableModes.map((mode) => (
                  <div key={mode.id} className={`conn-mode-item ${mode.id === currentMode ? "conn-mode-active" : ""}`}>
                    <span className="conn-mode-name">{mode.name ?? mode.id}</span>
                    {(mode as { description?: string }).description && (
                      <span className="conn-mode-desc">{(mode as { description?: string }).description}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {availableCommands.length > 0 && (
            <div className="conn-section">
              <div className="conn-section-title">Available Commands</div>
              <div className="conn-commands-list">
                {availableCommands.map((cmd) => (
                  <div key={cmd.name} className="conn-cmd-item">
                    <code className="conn-cmd-name">/{cmd.name}</code>
                    {cmd.description && <span className="conn-cmd-desc">{cmd.description}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function AgentInfoBanner({ info }: { info: AgentInfo }) {
  const displayName = info.title ?? info.name ?? "Agent";
  return (
    <div className="agent-info-banner">
      <span className="agent-info-icon">&#x2699;</span>
      <span className="agent-info-text">
        <strong>{displayName}</strong>
        {info.version && <span className="agent-info-version">v{info.version}</span>}
        {" connected"}
      </span>
    </div>
  );
}

export function AuthBanner({
  methods, onAuthenticate, onDismiss,
}: {
  methods: AuthMethod[];
  onAuthenticate: (methodId: string) => void;
  onDismiss: () => void;
}) {
  return (
    <div className="auth-banner">
      <div className="auth-banner-header">
        <div className="auth-banner-title">Authentication Available</div>
        <button className="auth-banner-dismiss" onClick={onDismiss} title="Dismiss">&#x2715;</button>
      </div>
      <div className="auth-banner-methods">
        {methods.map((method) => {
          const m = method as { id: string; name: string; type?: string; description?: string };
          return (
            <div key={m.id} className="auth-method-card">
              <div className="auth-method-info">
                <span className="auth-method-name">{m.name}</span>
                {m.type && <span className="auth-method-type">{m.type}</span>}
              </div>
              {m.description && (
                <div className="auth-method-desc">{m.description}</div>
              )}
              <button
                className="btn btn-primary auth-method-btn"
                onClick={() => onAuthenticate(m.id)}
              >
                Authenticate
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
