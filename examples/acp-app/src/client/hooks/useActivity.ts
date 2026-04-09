import { useState, useCallback } from "react";
import type { ToolCallContent, SessionUpdate } from "@runloop/agent-axon-client/acp";
import { isToolCall, isToolCallProgress } from "@runloop/agent-axon-client/acp";
import type { ToolActivity } from "./types.js";
import { parseToolCallContent, extractOutputText } from "./parsers.js";

export interface UseActivityReturn {
  toolActivity: ToolActivity[];
  resetActivity: () => void;
  onSessionUpdate: (update: SessionUpdate) => void;
}

export function useActivity(): UseActivityReturn {
  const [toolActivity, setToolActivity] = useState<ToolActivity[]>([]);

  const resetActivity = useCallback(() => {
    setToolActivity([]);
  }, []);

  const onSessionUpdate = useCallback((update: SessionUpdate) => {
    if (isToolCall(update)) {
      const { toolCallId, title, rawInput } = update;
      const kind = update.kind ?? "other";
      const status = update.status ?? "pending";
      const command = rawInput && typeof rawInput === "object"
        ? ((rawInput as Record<string, unknown>).command as string | undefined) ?? undefined
        : undefined;
      setToolActivity((prev) => {
        if (prev.some((a) => a.toolCallId === toolCallId)) return prev;
        return [...prev, { toolCallId, kind, title, status, command, timestamp: Date.now() }];
      });
      return;
    }

    if (isToolCallProgress(update)) {
      const { toolCallId, rawInput, rawOutput } = update;
      const newStatus = update.status ?? undefined;
      const newContentItems = update.content
        ? parseToolCallContent(update.content as ToolCallContent[])
        : undefined;
      const command = rawInput && typeof rawInput === "object"
        ? ((rawInput as Record<string, unknown>).command as string | undefined) ?? undefined
        : undefined;
      const outputText = newContentItems
        ? extractOutputText(newContentItems, rawOutput)
        : undefined;

      setToolActivity((prev) =>
        prev.map((a) =>
          a.toolCallId === toolCallId
            ? {
                ...a,
                status: newStatus ?? a.status,
                command: command ?? a.command,
                output: outputText ?? a.output,
              }
            : a,
        ),
      );
      return;
    }
  }, []);

  return {
    toolActivity,
    resetActivity,
    onSessionUpdate,
  };
}
