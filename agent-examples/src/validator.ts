import type { ACPAxonConnection, SessionUpdate } from "@runloop/agent-axon-client/acp";
import { isAgentMessageChunk } from "@runloop/agent-axon-client/acp";
import type { ClaudeAxonConnection } from "@runloop/agent-axon-client/claude";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

/**
 * Wraps a promise with a timeout.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout (${ms}ms): ${label}`));
    }, ms);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/**
 * Subscribe to session updates and collect agent message text chunks.
 * Returns the collected chunks array and an unsubscribe function.
 */
export function collectAgentText(conn: ACPAxonConnection): {
  chunks: string[];
  unsub: () => void;
} {
  const chunks: string[] = [];

  const unsub = conn.onSessionUpdate((_sessionId, update) => {
    if (isAgentMessageChunk(update)) {
      if (update.content.type === "text" && update.content.text) {
        chunks.push(update.content.text);
      }
    }
  });

  return { chunks, unsub };
}

/**
 * Wait for a session update matching a predicate.
 * Rejects after timeoutMs (default 30000).
 */
export function waitForSessionUpdate(
  conn: ACPAxonConnection,
  predicate: (update: SessionUpdate) => boolean,
  timeoutMs = 30000,
): Promise<SessionUpdate> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsub();
      reject(new Error(`Timeout waiting for session update (${timeoutMs}ms)`));
    }, timeoutMs);

    const unsub = conn.onSessionUpdate((_sessionId, update) => {
      if (predicate(update)) {
        clearTimeout(timer);
        unsub();
        resolve(update);
      }
    });
  });
}

/**
 * Assert that at least one non-empty text chunk was received.
 */
export function assertAgentResponded(chunks: string[]): void {
  const nonEmpty = chunks.filter((c) => c.trim().length > 0);
  if (nonEmpty.length === 0) {
    throw new Error("Agent did not respond with any text");
  }
}

/**
 * Assert that a tool call with the given name appeared.
 */
export function assertToolUsed(updates: SessionUpdate[], toolName: string): void {
  const found = updates.some(
    (u) => u.sessionUpdate === "tool_call" && "toolName" in u && u.toolName === toolName,
  );
  if (!found) {
    throw new Error(`Tool "${toolName}" was not used`);
  }
}

/**
 * Collect all messages from receiveAgentResponse() until the result message.
 */
export async function collectMessages(
  conn: ClaudeAxonConnection,
): Promise<SDKMessage[]> {
  const messages: SDKMessage[] = [];
  for await (const msg of conn.receiveAgentResponse()) {
    messages.push(msg);
  }
  return messages;
}

/**
 * Wait for a message matching a predicate.
 */
export async function waitForMessage(
  conn: ClaudeAxonConnection,
  predicate: (msg: SDKMessage) => boolean,
  timeoutMs = 30000,
): Promise<SDKMessage> {
  return withTimeout(
    (async () => {
      for await (const msg of conn.receiveAgentResponse()) {
        if (predicate(msg)) {
          return msg;
        }
      }
      throw new Error("Message matching predicate not found before result");
    })(),
    timeoutMs,
    "waiting for message",
  );
}

/**
 * Assert that the result message indicates success (not an error).
 */
export function assertResultSuccess(messages: SDKMessage[]): void {
  const result = messages.find((m) => m.type === "result");
  if (!result) {
    throw new Error("No result message found");
  }
  if (result.type === "result" && result.is_error) {
    throw new Error(`Result was an error: ${result.subtype}`);
  }
}

/**
 * Assert that at least one assistant message with text content was received.
 */
export function assertAssistantResponded(messages: SDKMessage[]): void {
  const assistantMsgs = messages.filter((m) => m.type === "assistant");
  if (assistantMsgs.length === 0) {
    throw new Error("No assistant messages received");
  }

  const hasText = assistantMsgs.some((m) => {
    if (m.type !== "assistant") return false;
    return m.message.content.some(
      (block) => block.type === "text" && block.text.trim().length > 0,
    );
  });

  if (!hasText) {
    throw new Error("Assistant did not respond with any text");
  }
}
