import { useState, useCallback } from "react";
import type { ToolCallContent } from "@runloop/agent-axon-client/acp";
import { isToolCall, isToolCallProgress } from "@runloop/agent-axon-client/acp";
import type { ClientEvent } from "../../server/acp-client.js";
import type { ToolActivity, FileOp, TerminalState } from "./types.js";
import { parseToolCallContent, extractOutputText } from "./parsers.js";

export interface UseActivityReturn {
  toolActivity: ToolActivity[];
  fileOps: FileOp[];
  terminals: Map<string, TerminalState>;
  resetActivity: () => void;
  onEvent: (event: ClientEvent) => void;
}

export function useActivity(): UseActivityReturn {
  const [toolActivity, setToolActivity] = useState<ToolActivity[]>([]);
  const [fileOps, setFileOps] = useState<FileOp[]>([]);
  const [terminals, setTerminals] = useState<Map<string, TerminalState>>(new Map());

  const resetActivity = useCallback(() => {
    setToolActivity([]);
    setFileOps([]);
    setTerminals(new Map());
  }, []);

  const onEvent = useCallback((data: ClientEvent) => {
    if (data.type === "session_update") {
      const { update } = data;

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

      return;
    }

    if (data.type === "file_read") {
      setFileOps((prev) => [...prev, {
        id: `fr-${Date.now()}`,
        type: "read",
        path: data.path,
        detail: `${data.lines} lines`,
        timestamp: Date.now(),
      }]);
      return;
    }

    if (data.type === "file_write") {
      setFileOps((prev) => [...prev, {
        id: `fw-${Date.now()}`,
        type: "write",
        path: data.path,
        detail: `${data.bytes} bytes`,
        timestamp: Date.now(),
      }]);
      return;
    }

    if (data.type === "terminal_create") {
      setTerminals((prev) => {
        const next = new Map(prev);
        next.set(data.terminalId, {
          terminalId: data.terminalId,
          command: data.command,
          output: "",
          exited: false,
          timestamp: Date.now(),
        });
        return next;
      });
      return;
    }

    if (data.type === "terminal_output") {
      setTerminals((prev) => {
        const next = new Map(prev);
        const existing = next.get(data.terminalId);
        if (existing) {
          next.set(existing.terminalId, {
            ...existing,
            output: data.output,
            exited: data.exited,
          });
        }
        return next;
      });
      return;
    }

    if (data.type === "terminal_kill" || data.type === "terminal_release") {
      setTerminals((prev) => {
        const next = new Map(prev);
        const existing = next.get(data.terminalId);
        if (existing) {
          next.set(existing.terminalId, { ...existing, exited: true });
        }
        return next;
      });
    }
  }, []);

  return {
    toolActivity,
    fileOps,
    terminals,
    resetActivity,
    onEvent,
  };
}
