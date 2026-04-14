import {
  type Client,
  type ElicitationRequest,
  type ElicitationResponse,
  CLIENT_METHODS,
  isAgentTextChunk,
  isElicitationCompleteEvent,
  isElicitationRequestEvent,
  isSessionUpdateEvent,
} from "@runloop/agent-axon-client/acp";
import { isClaudeAssistantTextEvent, isClaudeResultEvent } from "@runloop/agent-axon-client/claude";
import type { UseCase } from "../types.js";
import { waitFor } from "../validator.js";

const PROMPT = "Ask me a question before proceeding with any task.";

export default {
  name: "elicitation",
  description: "Handle agent-initiated user input requests",
  protocols: ["acp", "claude"],
  timeoutMs: 10_000,

  clientCapabilities: { elicitation: { form: {} } },

  createClient(_agent) {
    const client: Client = {
      async requestPermission(p) {
        const opt = p.options.find((o: { kind: string }) => o.kind === "allow_always") ?? p.options[0];
        return { outcome: opt ? { outcome: "selected", optionId: opt.optionId } : { outcome: "cancelled" } };
      },
      async extMethod(method, params) {
        if (method !== CLIENT_METHODS.session_elicitation) throw new Error(`Unhandled: ${method}`);
        const req = params as ElicitationRequest;
        const res: ElicitationResponse = {
          action: { action: "accept", content: req.mode === "form" ? { answer: "test" } : null },
        };
        return res as Record<string, unknown>;
      },
      async extNotification() {},
      async sessionUpdate() {},
    };
    return client;
  },

  async run(ctx) {
    if (ctx.acp) {
      let elicitationCount = 0;
      let completedCount = 0;

      const chunks: string[] = [];
      const unsub = ctx.acp.onTimelineEvent((event) => {
        if (isElicitationRequestEvent(event)) {
          elicitationCount++;
        }
        if (isElicitationCompleteEvent(event)) {
          completedCount++;
        }
        if (isSessionUpdateEvent(event) && isAgentTextChunk(event.data.update)) {
          chunks.push(event.data.update.content.text);
        }
      });

      await ctx.acp.prompt({ sessionId: ctx.sessionId!, prompt: [{ type: "text", text: PROMPT }] });
      await waitFor(() => (elicitationCount > 0 && completedCount > 0) || chunks.some((c) => c.trim()), 5_000);
      unsub();

      const hasText = chunks.some((c) => c.trim());
      const hasElicitation = elicitationCount > 0 && completedCount > 0;

      if (!hasText && !hasElicitation) {
        throw new Error("Agent did not respond with text and did not trigger elicitation");
      }
      ctx.log(`Pass: ACP elicitation (elicit=${hasElicitation}, text=${hasText})`);
    } else if (ctx.claude) {
      // Claude Code doesn't have ACP-style elicitation. This tests the closest
      // equivalent: tool-use permission flow (can_use_tool control requests).
      ctx.claude.onControlRequest("can_use_tool", async (msg) => ({
        type: "control_response",
        response: { subtype: "success", request_id: msg.request_id, response: { behavior: "allow" } },
      }));

      let gotResult = false;
      let gotText = false;
      let resultError: string | undefined;

      const unsub = ctx.claude.onTimelineEvent((event) => {
        if (isClaudeResultEvent(event)) {
          if (event.data.is_error) resultError = event.data.subtype;
          gotResult = true;
        }
        if (isClaudeAssistantTextEvent(event)) {
          gotText = true;
        }
      });

      await ctx.claude.send(PROMPT);
      await waitFor(() => gotResult, 8_000);
      unsub();

      if (resultError) throw new Error(`Error result: ${resultError}`);
      if (!gotResult) throw new Error("No result received");
      ctx.log(`Pass: Claude elicitation (text=${gotText})`);
    } else {
      ctx.skip("No connection");
    }
  },
} satisfies UseCase;
