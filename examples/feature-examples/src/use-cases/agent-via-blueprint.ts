import { isAgentTextChunk } from "@runloop/agent-axon-client/acp";
import { isClaudeAssistantTextEvent, isClaudeResultEvent } from "@runloop/agent-axon-client/claude";
import type { UseCase } from "../types.js";
import { waitFor } from "../validator.js";

const PROMPT = "Say hello world";
const ACP_CHUNK_WAIT_MS = 5_000;

/**
 * Demonstrates using a pre-built blueprint with agents baked in.
 *
 * This use case shows the `provisionOverridesByAgent` pattern for configuring
 * blueprint + binary paths per agent. The axon-agents blueprint has agents
 * pre-installed, giving the fastest cold-start and reproducible environment.
 *
 * Prerequisites: The `axon-agents` blueprint must exist on your Runloop account.
 * Run `bun run build-blueprint` from the repo root to create it.
 */
export default {
  name: "agent-via-blueprint",
  description: "Use pre-built blueprint with agents baked in",
  protocols: ["acp", "claude"],
  timeoutMs: 30_000,

  provisionOverridesByAgent: {
    opencode: {
      blueprint: "axon-agents",
      agentMount: undefined,
      mount: {
        protocol: "acp",
        agent_binary: "/home/user/.opencode/bin/opencode",
        launch_args: ["acp"],
      },
    },
    "codex-acp": {
      blueprint: "axon-agents",
      agentMount: undefined,
      mount: {
        protocol: "acp",
        agent_binary: "/usr/local/bin/codex-acp",
        working_directory: "/home/user",
      },
    },
    "claude-code": {
      blueprint: "axon-agents",
      agentMount: undefined,
      mount: {
        protocol: "claude_json",
        agent_binary: "/home/user/.local/bin/claude",
        launch_args: ["--dangerously-skip-permissions"],
      },
    },
  },

  async run(ctx) {
    if (ctx.acp) {
      ctx.log("Running ACP path (via blueprint)...");

      const chunks: string[] = [];
      const unsub = ctx.acp.onSessionUpdate((_sessionId, update) => {
        if (isAgentTextChunk(update)) {
          chunks.push(update.content.text);
        }
      });

      ctx.log(`Sending prompt: "${PROMPT}"`);
      await ctx.acp.prompt({
        sessionId: ctx.sessionId!,
        prompt: [{ type: "text", text: PROMPT }],
      });

      const hasText = () => chunks.some((c) => c.trim().length > 0);
      await waitFor(hasText, ACP_CHUNK_WAIT_MS);
      unsub();

      ctx.log(`Received ${chunks.length} text chunks`);
      if (!hasText()) {
        throw new Error("Agent did not respond with any text");
      }

      ctx.log("Pass: Agent responded with text (via blueprint)");
    } else if (ctx.claude) {
      ctx.log("Running Claude path (via blueprint)...");

      let hasAssistantText = false;
      let resultError: string | undefined;
      let onResult: () => void;
      const resultReceived = new Promise<void>((resolve) => {
        onResult = resolve;
      });

      const unsub = ctx.claude.onTimelineEvent((event) => {
        if (isClaudeAssistantTextEvent(event)) {
          hasAssistantText = true;
        }
        if (isClaudeResultEvent(event)) {
          if (event.data.is_error) resultError = `Result was an error: ${event.data.subtype}`;
          onResult();
        }
      });

      ctx.log(`Sending prompt: "${PROMPT}"`);
      await ctx.claude.send(PROMPT);
      await resultReceived;
      unsub();

      if (resultError) throw new Error(resultError);
      if (!hasAssistantText) throw new Error("Assistant did not respond with any text");

      ctx.log("Pass: Agent responded with text (via blueprint)");
    } else {
      ctx.skip("No connection available");
    }
  },
} satisfies UseCase;
