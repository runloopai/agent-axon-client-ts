import {
  type Client,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type ElicitationRequest,
  type ElicitationResponse,
  CLIENT_METHODS,
} from "@runloop/agent-axon-client/acp";
import type { SDKControlResponse } from "@runloop/agent-axon-client/claude";
import type { UseCase } from "../types.js";
import { extractAgentText } from "../acp-helpers.js";

const PROMPT = "Ask me a question before proceeding with any task.";

/**
 * Elicitation use case: demonstrates handling agent-initiated user input requests.
 *
 * - ACP: Uses createClient to provide a custom Client that handles elicitation RPC,
 *   while message validation uses typed ACPTimelineEvent consumption.
 * - Claude: Uses onControlRequest to intercept can_use_tool (e.g., AskUserQuestion).
 *
 * This example shows how to wire up interactive agent flows in both protocols.
 */
export default {
  name: "elicitation",
  description: "Handle agent-initiated user input requests",
  protocols: ["acp", "claude"],
  timeoutMs: 10_000,

  // ACP: Advertise elicitation capability so the agent may use it
  clientCapabilities: {
    elicitation: { form: {} },
  },

  // ACP: Custom Client factory that handles elicitation RPC requests.
  // Note: session updates are consumed via onTimelineEvent in run() instead of
  // wiring chunk collection through the Client's sessionUpdate callback.
  createClient(_agent) {
    const state = {
      elicitationCount: 0,
    };

    const client: Client = {
      async requestPermission(
        params: RequestPermissionRequest,
      ): Promise<RequestPermissionResponse> {
        const option =
          params.options.find((o) => o.kind === "allow_always") ??
          params.options.find((o) => o.kind === "allow_once") ??
          params.options[0];
        return {
          outcome: option
            ? { outcome: "selected", optionId: option.optionId }
            : { outcome: "cancelled" },
        };
      },

      async extMethod(
        method: string,
        params: Record<string, unknown>,
      ): Promise<Record<string, unknown>> {
        if (method === CLIENT_METHODS.session_elicitation) {
          state.elicitationCount++;

          if (typeof params !== "object" || params === null || !("mode" in params)) {
            throw new Error(`Invalid elicitation request: missing 'mode' field`);
          }
          const request = params as ElicitationRequest;

          const response: ElicitationResponse = {
            action: {
              action: "accept",
              content: request.mode === "form" ? { answer: "test-response" } : null,
            },
          };
          return response as Record<string, unknown>;
        }
        throw new Error(`Unhandled extMethod: ${method}`);
      },

      async extNotification(
        method: string,
        _params: Record<string, unknown>,
      ): Promise<void> {
        if (method === CLIENT_METHODS.session_elicitation_complete) {
          return;
        }
      },

      // Required by the Client interface; message consumption happens via
      // onTimelineEvent in run() so this is a no-op.
      async sessionUpdate(): Promise<void> {},
    };

    (client as unknown as { __state: typeof state }).__state = state;
    return client;
  },

  async run(ctx) {
    if (ctx.acp) {
      ctx.log("Running ACP path with custom Client + timeline events...");

      // Elicitation count is still tracked via the custom Client's extMethod handler
      const clientState = ctx.clientState as { elicitationCount: number } | null;

      if (!clientState) {
        throw new Error("Client state not available - createClient may not have been wired correctly");
      }

      // Collect text chunks via typed ACPTimelineEvent stream
      const chunks: string[] = [];
      const unsub = ctx.acp.onTimelineEvent((event) => {
        const text = extractAgentText(event);
        if (text) chunks.push(text);
      });

      ctx.log(`Sending prompt: "${PROMPT}"`);
      await ctx.acp.prompt({
        sessionId: ctx.sessionId!,
        prompt: [{ type: "text", text: PROMPT }],
      });

      // Wait briefly to allow any additional updates after prompt resolves
      await new Promise((resolve) => setTimeout(resolve, 500));
      unsub();

      ctx.log(`Timeline chunks: ${chunks.length}, elicitations: ${clientState.elicitationCount}`);

      const hasText = chunks.filter((c) => c.trim().length > 0).length > 0;
      const hasElicitation = clientState.elicitationCount > 0;

      if (!hasText && !hasElicitation) {
        throw new Error("Agent did not respond with text and did not trigger elicitation");
      }

      ctx.log("Pass: ACP elicitation flow completed");
    } else if (ctx.claude) {
      ctx.log("Running Claude path with onControlRequest...");

      // Track whether we received a control request
      let controlRequestCount = 0;

      // Register handler for can_use_tool (includes AskUserQuestion)
      ctx.claude.onControlRequest("can_use_tool", async (message) => {
        controlRequestCount++;
        ctx.log(`Received control request: ${message.request.tool_name}`);

        // Auto-approve with success response
        const response: SDKControlResponse = {
          type: "control_response",
          response: {
            subtype: "success",
            request_id: message.request_id,
            response: { behavior: "allow" },
          },
        };
        return response;
      });

      ctx.log(`Sending prompt: "${PROMPT}"`);
      await ctx.claude.send(PROMPT);

      // Collect messages until result
      let resultReceived = false;
      let hasAssistantText = false;

      for await (const msg of ctx.claude.receiveAgentResponse()) {
        if (msg.type === "result") {
          if (msg.is_error) {
            throw new Error(`Result was an error: ${msg.subtype}`);
          }
          resultReceived = true;
        }
        if (msg.type === "assistant") {
          const hasText = msg.message.content.some(
            (block) => block.type === "text" && block.text.trim().length > 0,
          );
          if (hasText) hasAssistantText = true;
        }
      }

      if (!resultReceived) {
        throw new Error("No result message received");
      }

      ctx.log(`Control requests handled: ${controlRequestCount}`);
      ctx.log(`Assistant responded with text: ${hasAssistantText}`);

      // Validation: flow completed successfully
      // Control requests may or may not have triggered depending on agent behavior
      ctx.log("Pass: Claude elicitation flow completed without error");
    } else {
      ctx.skip("No connection available");
    }
  },
} satisfies UseCase;
