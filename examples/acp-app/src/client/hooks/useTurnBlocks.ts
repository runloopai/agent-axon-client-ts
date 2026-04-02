import { useState, useRef, useCallback } from "react";
import type { ToolCallContent } from "@runloop/agent-axon-client/acp";
import {
  isAgentMessageChunk,
  isAgentThoughtChunk,
  isToolCall,
  isToolCallProgress,
  isPlan,
  isUserMessageChunk,
} from "@runloop/agent-axon-client/acp";
import type { ClientEvent } from "../../server/acp-client.js";
import type {
  TurnBlock,
  ChatMessage,
  PlanEntry,
  StopReason,
  PendingElicitation,
} from "./types.js";
import { parseToolCallContent, nextBlockId } from "./parsers.js";

export interface UseTurnBlocksReturn {
  messages: ChatMessage[];
  currentTurnBlocks: TurnBlock[];
  isAgentTurn: boolean;
  isStreaming: boolean;
  plan: PlanEntry[] | null;
  error: string | null;
  blocksRef: React.RefObject<TurnBlock[]>;
  startTurn: (userText: string) => void;
  resetChat: () => void;
  onEvent: (event: ClientEvent) => void;
}

export function useTurnBlocks(): UseTurnBlocksReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentTurnBlocks, setCurrentTurnBlocks] = useState<TurnBlock[]>([]);
  const [isAgentTurn, setIsAgentTurn] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [plan, setPlan] = useState<PlanEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const blocksRef = useRef<TurnBlock[]>([]);
  const thinkingStartRef = useRef<number | null>(null);

  function pushBlock(block: TurnBlock) {
    blocksRef.current = [...blocksRef.current, block];
    setCurrentTurnBlocks(blocksRef.current);
  }

  function updateBlocks(updater: (blocks: TurnBlock[]) => TurnBlock[]) {
    blocksRef.current = updater(blocksRef.current);
    setCurrentTurnBlocks(blocksRef.current);
  }

  function lastBlock(): TurnBlock | undefined {
    return blocksRef.current[blocksRef.current.length - 1];
  }

  function finalizeThinking() {
    if (!thinkingStartRef.current) return;
    const duration = Math.round((Date.now() - thinkingStartRef.current) / 1000);
    updateBlocks((blocks) =>
      blocks.map((b) =>
        b.type === "thinking" && b.isActive
          ? { ...b, isActive: false, duration }
          : b,
      ),
    );
    thinkingStartRef.current = null;
  }

  function finalizeTurn(stopReason?: StopReason) {
    finalizeThinking();
    const turnBlocks = blocksRef.current;
    if (turnBlocks.length > 0) {
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: "",
          blocks: turnBlocks,
          ...(stopReason && stopReason !== "end_turn" ? { stopReason } : {}),
        },
      ]);
    }
    blocksRef.current = [];
    thinkingStartRef.current = null;
    setCurrentTurnBlocks([]);
    setIsAgentTurn(false);
    setIsStreaming(false);
  }

  const startTurn = useCallback((userText: string) => {
    setMessages((prev) => [
      ...prev,
      { id: `user-${Date.now()}`, role: "user", content: userText },
    ]);
    blocksRef.current = [];
    thinkingStartRef.current = null;
    setCurrentTurnBlocks([]);
    setIsAgentTurn(true);
    setIsStreaming(false);
  }, []);

  const resetChat = useCallback(() => {
    blocksRef.current = [];
    thinkingStartRef.current = null;
    setCurrentTurnBlocks([]);
    setIsAgentTurn(false);
    setIsStreaming(false);
    setMessages([]);
    setPlan(null);
    setError(null);
  }, []);

  const onEvent = useCallback((data: ClientEvent) => {
    if (data.type === "turn_complete") {
      finalizeTurn(data.stopReason);
      return;
    }

    if (data.type === "turn_error") {
      finalizeTurn();
      setError(data.error ?? "Turn failed");
      return;
    }

    if (data.type !== "session_update") return;

    const { update } = data;

    if (isAgentMessageChunk(update)) {
      finalizeThinking();
      const { content, messageId = null } = update;
      if (content.type === "resource_link") {
        pushBlock({
          type: "resource_link",
          id: nextBlockId("rl"),
          uri: content.uri,
          name: content.name ?? null,
          title: content.title ?? null,
        });
        setIsAgentTurn(true);
        return;
      }
      const text = content.type === "text" ? content.text : "";
      const last = lastBlock();
      if (last?.type === "text") {
        updateBlocks((blocks) => {
          const copy = [...blocks];
          copy[copy.length - 1] = { ...last, text: last.text + text };
          return copy;
        });
      } else {
        pushBlock({ type: "text", id: nextBlockId("txt"), text, messageId });
      }
      setIsStreaming(true);
      setIsAgentTurn(true);
      return;
    }

    if (isAgentThoughtChunk(update)) {
      const { content } = update;
      const text = content.type === "text" ? content.text : "";
      const last = lastBlock();
      if (last?.type === "thinking" && last.isActive) {
        updateBlocks((blocks) => {
          const copy = [...blocks];
          copy[copy.length - 1] = { ...last, text: last.text + text };
          return copy;
        });
      } else {
        if (!thinkingStartRef.current) {
          thinkingStartRef.current = Date.now();
        }
        pushBlock({
          type: "thinking",
          id: nextBlockId("think"),
          text,
          duration: null,
          isActive: true,
        });
      }
      setIsAgentTurn(true);
      return;
    }

    if (isToolCall(update)) {
      finalizeThinking();
      const { toolCallId, title, rawInput, rawOutput } = update;
      const kind = update.kind ?? "other";
      const status = update.status ?? "pending";
      const locations = update.locations ?? [];
      const contentItems = update.content ? parseToolCallContent(update.content as ToolCallContent[]) : [];

      pushBlock({
        type: "tool_call",
        id: nextBlockId("tc"),
        toolCallId,
        title,
        kind,
        status,
        locations,
        content: contentItems,
        rawInput,
        rawOutput,
        startedAt: Date.now(),
        duration: null,
      });
      setIsAgentTurn(true);
      return;
    }

    if (isToolCallProgress(update)) {
      const { toolCallId, rawInput, rawOutput } = update;
      const newStatus = update.status ?? undefined;
      const newTitle = update.title ?? undefined;
      const newKind = update.kind ?? undefined;
      const newLocations = update.locations ?? undefined;
      const newContentItems = update.content
        ? parseToolCallContent(update.content as ToolCallContent[])
        : undefined;

      updateBlocks((blocks) =>
        blocks.map((b) => {
          if (b.type !== "tool_call" || b.toolCallId !== toolCallId) return b;
          const isFinishing =
            (newStatus === "completed" || newStatus === "failed") &&
            b.status !== "completed" && b.status !== "failed";
          return {
            ...b,
            status: newStatus ?? b.status,
            title: newTitle ?? b.title,
            kind: newKind ?? b.kind,
            locations: newLocations ?? b.locations,
            content: newContentItems ?? b.content,
            rawInput: rawInput ?? b.rawInput,
            rawOutput: rawOutput ?? b.rawOutput,
            duration: isFinishing
              ? Math.round((Date.now() - b.startedAt) / 1000 * 10) / 10
              : b.duration,
          };
        }),
      );
      return;
    }

    if (isPlan(update)) {
      const { entries } = update;
      setPlan(entries);
      const existingPlan = blocksRef.current.find((b) => b.type === "plan");
      if (existingPlan) {
        updateBlocks((blocks) =>
          blocks.map((b) =>
            b.type === "plan" ? { ...b, entries } : b,
          ),
        );
      } else {
        pushBlock({ type: "plan", id: nextBlockId("plan"), entries });
      }
      setIsAgentTurn(true);
      return;
    }

    if (isUserMessageChunk(update)) {
      const { content } = update;
      const text = content.type === "text" ? content.text : "";
      if (text) {
        setMessages((prev) => [
          ...prev,
          { id: `user-replay-${Date.now()}`, role: "user", content: text },
        ]);
      }
    }
  }, []);

  return {
    messages,
    currentTurnBlocks,
    isAgentTurn,
    isStreaming,
    plan,
    error,
    blocksRef,
    startTurn,
    resetChat,
    onEvent,
  };
}
