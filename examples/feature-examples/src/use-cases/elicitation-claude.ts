import { isClaudeAssistantTextEvent, isClaudeResultEvent } from "@runloop/agent-axon-client/claude";
import type { UseCase } from "../types.js";
import { waitFor } from "../validator.js";

const PROMPT = "Ask me a question before proceeding with any task.";

export default {
  name: "elicitation-claude",
  description: "Handle agent-initiated user input via Claude conversational flow",
  protocols: ["claude"],
  timeoutMs: 10_000,

  async run(ctx) {
    if (!ctx.claude) {
      ctx.skip("Claude connection required");
      return;
    }

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
  },
} satisfies UseCase;
