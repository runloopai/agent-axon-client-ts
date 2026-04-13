import { useState, useRef, useCallback } from "react";
import type { TurnBlock, ChatMessage } from "../types.js";

export interface BlockManager {
  currentTurnBlocks: TurnBlock[];
  pushBlock: (block: TurnBlock) => void;
  updateBlocks: (updater: (blocks: TurnBlock[]) => TurnBlock[]) => void;
  lastBlock: () => TurnBlock | undefined;
  finalizeThinking: () => void;
  flushToMessage: (extra?: Partial<Omit<ChatMessage, "id" | "role" | "content" | "blocks">>) => ChatMessage | null;
  reset: () => void;
  blocksRef: React.RefObject<TurnBlock[]>;
  thinkingStartRef: React.MutableRefObject<number | null>;
}

export function useBlockManager(): BlockManager {
  const [currentTurnBlocks, setCurrentTurnBlocks] = useState<TurnBlock[]>([]);
  const blocksRef = useRef<TurnBlock[]>([]);
  const thinkingStartRef = useRef<number | null>(null);

  const pushBlock = useCallback((block: TurnBlock) => {
    blocksRef.current = [...blocksRef.current, block];
    setCurrentTurnBlocks(blocksRef.current);
  }, []);

  const updateBlocks = useCallback((updater: (blocks: TurnBlock[]) => TurnBlock[]) => {
    blocksRef.current = updater(blocksRef.current);
    setCurrentTurnBlocks(blocksRef.current);
  }, []);

  const lastBlock = useCallback((): TurnBlock | undefined => {
    return blocksRef.current[blocksRef.current.length - 1];
  }, []);

  const finalizeThinking = useCallback(() => {
    if (!thinkingStartRef.current) return;
    const duration = Math.round((Date.now() - thinkingStartRef.current) / 1000);
    blocksRef.current = blocksRef.current.map((b) =>
      b.type === "thinking" && b.isActive ? { ...b, isActive: false, duration } : b,
    );
    setCurrentTurnBlocks(blocksRef.current);
    thinkingStartRef.current = null;
  }, []);

  const flushToMessage = useCallback((extra?: Partial<Omit<ChatMessage, "id" | "role" | "content" | "blocks">>): ChatMessage | null => {
    if (thinkingStartRef.current) {
      const duration = Math.round((Date.now() - thinkingStartRef.current) / 1000);
      blocksRef.current = blocksRef.current.map((b) =>
        b.type === "thinking" && b.isActive ? { ...b, isActive: false, duration } : b,
      );
      thinkingStartRef.current = null;
    }

    const turnBlocks = blocksRef.current;
    blocksRef.current = [];
    setCurrentTurnBlocks([]);

    if (turnBlocks.length === 0) return null;

    return {
      id: `assistant-${Date.now()}`,
      role: "assistant",
      content: "",
      blocks: turnBlocks,
      ...extra,
    };
  }, []);

  const reset = useCallback(() => {
    blocksRef.current = [];
    thinkingStartRef.current = null;
    setCurrentTurnBlocks([]);
  }, []);

  return {
    currentTurnBlocks,
    pushBlock,
    updateBlocks,
    lastBlock,
    finalizeThinking,
    flushToMessage,
    reset,
    blocksRef,
    thinkingStartRef,
  };
}
