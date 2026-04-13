import type { UseCase } from "../types.js";
import {
  collectAgentText,
  assertAgentResponded,
  collectMessages,
  assertResultSuccess,
  assertAssistantResponded,
} from "../validator.js";

const PROMPT = "Say hello world";

/**
 * Single-prompt use case: send one prompt, receive a text response.
 * Tests the basic request/response flow for both ACP and Claude protocols.
 */
export default {
  name: "single-prompt",
  description: "Send one prompt, receive text response",
  protocols: ["acp", "claude"],
  timeoutMs: 60_000,

  async run(ctx) {
    if (ctx.acp) {
      ctx.log("Running ACP path...");

      const { chunks, unsub } = collectAgentText(ctx.acp);

      ctx.log(`Sending prompt: "${PROMPT}"`);
      await ctx.acp.prompt({
        sessionId: ctx.sessionId!,
        prompt: [{ type: "text", text: PROMPT }],
      });

      unsub();

      ctx.log(`Received ${chunks.length} text chunks`);
      assertAgentResponded(chunks);

      ctx.log("Pass: Agent responded with text");
    } else if (ctx.claude) {
      ctx.log("Running Claude path...");

      ctx.log(`Sending prompt: "${PROMPT}"`);
      await ctx.claude.send(PROMPT);

      ctx.log("Collecting messages...");
      const messages = await collectMessages(ctx.claude);

      ctx.log(`Received ${messages.length} messages`);
      assertResultSuccess(messages);
      assertAssistantResponded(messages);

      ctx.log("Pass: Agent responded with text");
    } else {
      ctx.skip("No connection available");
    }
  },
} satisfies UseCase;
