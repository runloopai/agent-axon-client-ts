import type { ConnectionPhase } from "../hooks/useNodeAgent.js";

function phaseLabel(phase: ConnectionPhase): string {
  if (phase === "connecting") return "Connecting to agent\u2026";
  return "";
}

export function SetupCard({
  agentBinary, setAgentBinary,
  launchArgs, setLaunchArgs,
  launchCommands, setLaunchCommands,
  onStart,
  connectionPhase,
  error,
}: {
  agentBinary: string; setAgentBinary: (v: string) => void;
  launchArgs: string; setLaunchArgs: (v: string) => void;
  launchCommands: string; setLaunchCommands: (v: string) => void;
  onStart: () => void;
  connectionPhase: ConnectionPhase;
  error: string | null;
}) {
  const connecting = connectionPhase === "connecting";

  return (
    <div className="setup-card">
      <h2>Node ACP Demo</h2>
      <p className="setup-subtitle">Full ACP client with local file system and terminal support</p>
      <div className="form-group">
        <label>Agent Binary</label>
        <input value={agentBinary} onChange={(e) => setAgentBinary(e.target.value)} placeholder="opencode" disabled={connecting} />
      </div>
      <div className="form-group">
        <label>Launch Args (space-separated)</label>
        <input value={launchArgs} onChange={(e) => setLaunchArgs(e.target.value)} placeholder="acp" disabled={connecting} />
      </div>
      <div className="form-group">
        <label>Launch Commands (one per line)</label>
        <input value={launchCommands} onChange={(e) => setLaunchCommands(e.target.value)} placeholder="" disabled={connecting} />
      </div>
      <button className="btn btn-primary" onClick={onStart} disabled={connecting}>
        {connecting ? "Connecting\u2026" : "Create Sandbox"}
      </button>
      {connecting && (
        <div className="phase-indicator">
          <div className="phase-spinner" />
          {phaseLabel(connectionPhase)}
        </div>
      )}
      {error && <div className="error-banner">{error}</div>}
    </div>
  );
}
