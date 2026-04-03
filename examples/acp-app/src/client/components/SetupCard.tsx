import type { ConnectionPhase } from "../hooks/useNodeAgent.js";

export function SetupCard({
  agentBinary, setAgentBinary,
  launchArgs, setLaunchArgs,
  launchCommands, setLaunchCommands,
  systemPrompt, setSystemPrompt,
  onStart,
  connectionPhase,
  error,
}: {
  agentBinary: string; setAgentBinary: (v: string) => void;
  launchArgs: string; setLaunchArgs: (v: string) => void;
  launchCommands: string; setLaunchCommands: (v: string) => void;
  systemPrompt: string; setSystemPrompt: (v: string) => void;
  onStart: () => void;
  connectionPhase: ConnectionPhase;
  error: string | null;
}) {
  const connecting = connectionPhase === "connecting";

  return (
    <div className="setup-card">
      <div className="setup-header">
        <h2>ACP Agent Demo</h2>
        <p className="setup-subtitle">
          Interactive client for <a href="https://agentclientprotocol.com" target="_blank" rel="noopener noreferrer">Agent Client Protocol</a> agents running in a secure cloud sandbox.
        </p>
      </div>

      <div className="setup-architecture">
        <div className="arch-label">How it works</div>
        <div className="arch-diagram">
          <div className="arch-node">
            <div className="arch-node-label">This browser</div>
            <div className="arch-node-desc">React UI</div>
          </div>
          <div className="arch-arrow">
            <span className="arch-arrow-line" />
            <span className="arch-arrow-proto">WebSocket</span>
          </div>
          <div className="arch-node">
            <div className="arch-node-label">Express server</div>
            <div className="arch-node-desc">ACP SDK client</div>
          </div>
          <div className="arch-arrow">
            <span className="arch-arrow-line" />
            <span className="arch-arrow-proto">Axon (SSE)</span>
          </div>
          <div className="arch-node arch-node-cloud">
            <div className="arch-node-label">Runloop Sandbox</div>
            <div className="arch-node-desc">Agent process</div>
          </div>
        </div>
        <p className="arch-explain">
          Clicking start provisions a Runloop <strong>devbox</strong> (cloud sandbox) and an <strong>Axon channel</strong> (real-time event bus). The ACP SDK connects through Axon to control the agent. You chat here, the agent works there.
        </p>
      </div>

      <div className="setup-form-section">
        <div className="form-group">
          <label>Agent Binary</label>
          <div className="form-hint">The coding agent to launch in the sandbox, e.g. <code>opencode</code>, <code>codex</code>, or a custom binary.</div>
          <input value={agentBinary} onChange={(e) => setAgentBinary(e.target.value)} placeholder="opencode" disabled={connecting} />
        </div>
        <div className="form-group">
          <label>Launch Args</label>
          <div className="form-hint">Command-line arguments passed to the agent binary. Space-separated. Typically <code>acp</code> to start in ACP mode.</div>
          <input value={launchArgs} onChange={(e) => setLaunchArgs(e.target.value)} placeholder="acp" disabled={connecting} />
        </div>
        <div className="form-group">
          <label>Launch Commands</label>
          <div className="form-hint">Shell commands to run in the sandbox before starting the agent (one per line). Use for cloning repos, installing dependencies, etc.</div>
          <input value={launchCommands} onChange={(e) => setLaunchCommands(e.target.value)} placeholder="git clone https://..." disabled={connecting} />
        </div>
        <div className="form-group">
          <label>System Prompt</label>
          <div className="form-hint">Custom instructions prepended to every conversation. Sets the agent's behavior, focus area, or constraints.</div>
          <textarea className="setup-textarea" value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} placeholder="You are a senior engineer. Focus on writing tests..." disabled={connecting} rows={3} />
        </div>
      </div>

      <button className="btn btn-primary" onClick={onStart} disabled={connecting}>
        {connecting ? "Connecting" : "Create Sandbox & Start"}
      </button>
      {connecting && (
        <div className="phase-indicator">
          <div className="phase-spinner" />
          <span>Provisioning sandbox and connecting to agent</span>
        </div>
      )}
      {error && <div className="error-banner">{error}</div>}
    </div>
  );
}
