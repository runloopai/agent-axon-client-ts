import {
  type Client,
  type ElicitationRequest,
  type ElicitationResponse,
  CLIENT_METHODS,
  isElicitationCompleteEvent,
  isElicitationRequestEvent,
} from "@runloop/agent-axon-client/acp";
import type { UseCase } from "../types.js";
import { waitFor } from "../validator.js";

const PROMPT = "Ask me a question before proceeding with any task.";

export default {
  name: "elicitation-acp",
  description: "Handle agent-initiated user input via ACP session_elicitation",
  protocols: ["acp"],
  timeoutMs: 10_000,

  expectedFailuresByAgent: {
    opencode: "ACP protocol has not added full elicitation support yet",
    "codex-acp":
      "codex-acp does not advertise or send session/elicitation (uses permission requests instead)",
  },

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
    if (!ctx.acp) {
      ctx.skip("ACP connection required");
      return;
    }

    let elicitationCount = 0;
    let completedCount = 0;

    const unsub = ctx.acp.onTimelineEvent((event) => {
      if (isElicitationRequestEvent(event)) {
        elicitationCount++;
      }
      if (isElicitationCompleteEvent(event)) {
        completedCount++;
      }
    });

    await ctx.acp.prompt({ sessionId: ctx.sessionId!, prompt: [{ type: "text", text: PROMPT }] });
    await waitFor(() => elicitationCount > 0 && completedCount > 0, 5_000);
    unsub();

    const hasElicitation = elicitationCount > 0 && completedCount > 0;
    if (!hasElicitation) {
      throw new Error("Agent did not trigger session_elicitation");
    }
    ctx.log(`Pass: ACP elicitation (request=${elicitationCount}, complete=${completedCount})`);
  },
} satisfies UseCase;
