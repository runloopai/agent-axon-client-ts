import { describe, expect, it } from "vitest";
import {
  isAgentMessageChunk,
  isAgentTextChunk,
  isAgentThoughtChunk,
  isAvailableCommandsUpdate,
  isConfigOptionUpdate,
  isCurrentModeUpdate,
  isPlan,
  isSessionInfoUpdate,
  isThoughtTextChunk,
  isToolCall,
  isToolCallProgress,
  isUsageUpdate,
  isUserMessageChunk,
} from "./session-update-guards.js";

const guards = [
  { fn: isUserMessageChunk, key: "user_message_chunk" },
  { fn: isAgentMessageChunk, key: "agent_message_chunk" },
  { fn: isAgentThoughtChunk, key: "agent_thought_chunk" },
  { fn: isToolCall, key: "tool_call" },
  { fn: isToolCallProgress, key: "tool_call_update" },
  { fn: isPlan, key: "plan" },
  { fn: isAvailableCommandsUpdate, key: "available_commands_update" },
  { fn: isCurrentModeUpdate, key: "current_mode_update" },
  { fn: isConfigOptionUpdate, key: "config_option_update" },
  { fn: isSessionInfoUpdate, key: "session_info_update" },
  { fn: isUsageUpdate, key: "usage_update" },
] as const;

describe("session-update-guards", () => {
  for (const { fn, key } of guards) {
    describe(fn.name, () => {
      it(`returns true for sessionUpdate="${key}"`, () => {
        // biome-ignore lint/suspicious/noExplicitAny: test stub
        expect(fn({ sessionUpdate: key } as any)).toBe(true);
      });

      it("returns false for non-matching update types", () => {
        for (const other of guards) {
          if (other.key === key) continue;
          // biome-ignore lint/suspicious/noExplicitAny: test stub
          expect(fn({ sessionUpdate: other.key } as any)).toBe(false);
        }
      });
    });
  }

  describe("isAgentTextChunk (compound guard)", () => {
    it("returns true for agent_message_chunk with text content", () => {
      const update = {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "hello" },
      };
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      expect(isAgentTextChunk(update as any)).toBe(true);
    });

    it("returns false for agent_message_chunk with non-text content", () => {
      const update = {
        sessionUpdate: "agent_message_chunk",
        content: { type: "image", data: "abc" },
      };
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      expect(isAgentTextChunk(update as any)).toBe(false);
    });

    it("returns false for other session update types", () => {
      const update = {
        sessionUpdate: "agent_thought_chunk",
        content: { type: "text", text: "thinking" },
      };
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      expect(isAgentTextChunk(update as any)).toBe(false);
    });
  });

  describe("isThoughtTextChunk (compound guard)", () => {
    it("returns true for agent_thought_chunk with text content", () => {
      const update = {
        sessionUpdate: "agent_thought_chunk",
        content: { type: "text", text: "thinking..." },
      };
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      expect(isThoughtTextChunk(update as any)).toBe(true);
    });

    it("returns false for agent_thought_chunk with non-text content", () => {
      const update = {
        sessionUpdate: "agent_thought_chunk",
        content: { type: "image", data: "abc" },
      };
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      expect(isThoughtTextChunk(update as any)).toBe(false);
    });

    it("returns false for other session update types", () => {
      const update = {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "hello" },
      };
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      expect(isThoughtTextChunk(update as any)).toBe(false);
    });
  });
});
