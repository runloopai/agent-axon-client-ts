import type { ACPAxonConnection } from "@runloop/agent-axon-client/acp";
import type { ClaudeAxonConnection } from "@runloop/agent-axon-client/claude";
import type { Client, Agent } from "@agentclientprotocol/sdk";

/**
 * Defines how to provision a specific agent.
 */
export interface AgentConfig {
  /** Unique identifier (e.g., "opencode", "claude-code"). */
  name: string;

  /** Which protocol this agent uses. */
  protocol: "acp" | "claude";

  /** Runloop blueprint name (e.g., "runloop/agents"). */
  blueprint: string;

  /** Mount configuration for the broker. */
  mount: {
    protocol: "acp" | "claude_json";
    agent_binary?: string;
    launch_args?: string[];
  };

  /** Non-secret env vars only. Use sdk.secret for API keys (see scaffold.ts). */
  env?: Record<string, string>;

  /** Map of devbox env var name -> local env var to source the value from. */
  secrets?: Record<string, string>;

  /** If false, agent is skipped in compatibility runs. Defaults to true. */
  enabled?: boolean;
}

/**
 * Factory function that creates a Client implementation.
 * Matches the SDK's CreateClientFn signature directly.
 */
export type CreateClientFn = (agent: Agent) => Client;

/**
 * Defines a single compatibility test / use case.
 */
export interface UseCase {
  /** Unique identifier, matches filename without extension. */
  name: string;

  /** Human-readable description for llms.txt and matrix output. */
  description: string;

  /** Which protocols this use case applies to. */
  protocols: Array<"acp" | "claude">;

  /** Per-use-case timeout in ms. Overrides the default. */
  timeoutMs?: number;

  /** Optional provisioning overrides for special cases. */
  provisionOverrides?: Partial<AgentConfig>;

  /**
   * For ACP use cases that need the full Client interface (e.g., elicitation),
   * provide a factory that creates a custom Client implementation.
   */
  createClient?: CreateClientFn;

  /**
   * Client capabilities to advertise during ACP initialize.
   * E.g., `{ elicitation: { form: {} } }` to enable elicitation.
   */
  clientCapabilities?: Record<string, unknown>;

  /**
   * Protocols expected to fail (with reason).
   * E.g., `{ acp: "Protocol has not added full support yet" }`.
   * Results will show as "xfail" instead of "fail" and won't cause exit code 1.
   */
  expectedFailures?: Partial<Record<"acp" | "claude", string>>;

  /**
   * Per-agent expected failures (with reason), keyed by agent name.
   * Takes precedence over `expectedFailures` when both are specified.
   * E.g., `{ opencode: "Elicitation not yet supported" }`.
   */
  expectedFailuresByAgent?: Record<string, string>;

  /**
   * The test body. Receives a fully initialized RunContext.
   * Throw to indicate failure. Return cleanly to indicate pass.
   * Call ctx.skip(reason) to skip.
   */
  run: (ctx: RunContext) => Promise<void>;
}

/**
 * Provided to useCase.run() with an initialized connection.
 */
export interface RunContext {
  /** The agent config used for this run. */
  agent: AgentConfig;

  /** ACP connection, or null if this is a Claude run. */
  acp: ACPAxonConnection | null;

  /** Claude connection, or null if this is an ACP run. */
  claude: ClaudeAxonConnection | null;

  /** ACP session ID, or null for Claude (implicit session). */
  sessionId: string | null;

  /** Log a message (appears in run output). */
  log: (msg: string) => void;

  /** Skip this use case with a reason. Throws a SkipError internally. */
  skip: (reason: string) => never;

  /**
   * Cleanup callback that shuts down the devbox.
   * Separated from connection disconnect so runner can timeout each phase independently.
   */
  cleanup: () => Promise<void>;
}

/**
 * Captures the outcome of a single (agent, use case) run.
 */
export interface RunResult {
  /** Agent name (e.g., "opencode"). */
  agent: string;

  /** Use case name (e.g., "single-prompt"). */
  useCase: string;

  /** Protocol used (e.g., "acp"). */
  protocol: "acp" | "claude";

  /** Outcome. */
  status: "pass" | "fail" | "skip" | "xfail" | "xpass";

  /** Error message if status is "fail" or "xfail". */
  error?: string;

  /** Skip reason if status is "skip", or note if status is "xpass". */
  reason?: string;

  /** Why this failure was expected (only set when status is "xfail"). */
  xfailReason?: string;

  /** Time taken in milliseconds. */
  durationMs: number;
}

/**
 * Error thrown when a use case is skipped.
 */
export class SkipError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(`Skipped: ${reason}`);
    this.name = "SkipError";
    this.reason = reason;
  }
}
