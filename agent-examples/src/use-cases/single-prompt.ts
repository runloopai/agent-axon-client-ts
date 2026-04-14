import type { UseCase } from "../types.js";
import { extractAgentText } from "../acp-helpers.js";

const PROMPT = "Say hello world";

/** Single-prompt: send one prompt, receive a text response. */
export default {
  name: "single-prompt",
  description: "Send one prompt, receive text response",
  protocols: ["acp", "claude"],
  timeoutMs: 10_000,

  async run(ctx) {
    if (ctx.acp) {
      ctx.log("Running ACP path...");

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

      unsub();

      ctx.log(`Received ${chunks.length} text chunks`);
      if (chunks.filter((c) => c.trim().length > 0).length === 0) {
        throw new Error("Agent did not respond with any text");
      }

      ctx.log("Pass: Agent responded with text");
    } else if (ctx.claude) {
      ctx.log("Running Claude path...");

      ctx.log(`Sending prompt: "${PROMPT}"`);
      await ctx.claude.send(PROMPT);

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
      if (!hasAssistantText) {
        throw new Error("Assistant did not respond with any text");
      }

      ctx.log("Pass: Agent responded with text");
    } else {
      ctx.skip("No connection available");
    }
  },
} satisfies UseCase;
