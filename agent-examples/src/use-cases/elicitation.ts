import {
  type Client,
  type ElicitationRequest,
  type ElicitationResponse,
  CLIENT_METHODS,
  isAgentTextChunk,
} from "@runloop/agent-axon-client/acp";
import type { SDKControlResponse } from "@runloop/agent-axon-client/claude";
import type { UseCase } from "../types.js";

const PROMPT = "Ask me a question before proceeding with any task.";

/** Waits up to `ms` for `predicate` to return true, polling every 100ms. */
const waitFor = async (predicate: () => boolean, ms: number) => {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline && !predicate()) {
    await new Promise((r) => setTimeout(r, 100));
  }
};

export default {
  name: "elicitation",
  description: "Handle agent-initiated user input requests",
  protocols: ["acp", "claude"],
  timeoutMs: 10_000,

  // Advertise elicitation capability during ACP initialize
  clientCapabilities: { elicitation: { form: {} } },

  // ACP Client implementation for elicitation RPC
  createClient(_agent) {
    const state = { elicitationCount: 0, completedCount: 0 };

    const client: Client = {
      async requestPermission(p) {
        const opt = p.options.find((o: { kind: string }) => o.kind === "allow_always") ?? p.options[0];
        return { outcome: opt ? { outcome: "selected", optionId: opt.optionId } : { outcome: "cancelled" } };
      },
      async extMethod(method, params) {
        if (method !== CLIENT_METHODS.session_elicitation) throw new Error(`Unhandled: ${method}`);
        state.elicitationCount++;
        const req = params as ElicitationRequest;
        const res: ElicitationResponse = {
          action: { action: "accept", content: req.mode === "form" ? { answer: "test" } : null },
        };
        return res as Record<string, unknown>;
      },
      async extNotification(method) {
        if (method === CLIENT_METHODS.session_elicitation_complete) state.completedCount++;
      },
      async sessionUpdate() {},
    };
    (client as unknown as { __state: typeof state }).__state = state;
    return client;
  },

  async run(ctx) {
    if (ctx.acp) {
      const st = ctx.clientState as { elicitationCount: number; completedCount: number };
      if (!st) throw new Error("Client state unavailable");

      const chunks: string[] = [];
      const unsub = ctx.acp.onSessionUpdate((_sessionId, update) => {
        if (isAgentTextChunk(update)) {
          chunks.push(update.content.text);
        }
      });

      await ctx.acp.prompt({ sessionId: ctx.sessionId!, prompt: [{ type: "text", text: PROMPT }] });
      await waitFor(() => st.elicitationCount > 0 && st.completedCount > 0, 3_000);
      unsub();

      if (!st.elicitationCount) throw new Error("Agent did not trigger elicitation");
      if (!st.completedCount) throw new Error("Elicitation started but did not complete");
      if (!chunks.some((c) => c.trim())) throw new Error("No text after elicitation");
      ctx.log("Pass: ACP elicitation");
    } else if (ctx.claude) {
      ctx.claude.onControlRequest("can_use_tool", async (msg) => {
        const res: SDKControlResponse = {
          type: "control_response",
          response: { subtype: "success", request_id: msg.request_id, response: { behavior: "allow" } },
        };
        return res;
      });

      await ctx.claude.send(PROMPT);
      let gotResult = false, gotText = false;
      for await (const m of ctx.claude.receiveAgentResponse()) {
        if (m.type === "result") {
          if (m.is_error) throw new Error(`Error result: ${m.subtype}`);
          gotResult = true;
        }
        if (m.type === "assistant" && m.message.content.some((b) => b.type === "text" && b.text.trim())) {
          gotText = true;
        }
      }
      if (!gotResult) throw new Error("No result received");
      ctx.log(`Pass: Claude elicitation (text=${gotText})`);
    } else {
      ctx.skip("No connection");
    }
  },
} satisfies UseCase;
