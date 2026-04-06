import type { AnyMessage, Stream } from "@agentclientprotocol/sdk";
import { CLIENT_METHODS } from "@agentclientprotocol/sdk";
import type { AxonEventView } from "@runloop/api-client/resources/axons";
import type { Axon } from "@runloop/api-client/sdk";
import type { AxonStreamOptions } from "./types.js";

function defaultOnError(error: unknown): void {
  console.error("[axonStream]", error);
}

/**
 * Set of event_types that are notifications (no request ID correlation).
 * `session/update` is the main one -- the broker sends streaming chunks,
 * tool calls, plan updates, etc. as session/update notifications.
 */
const NOTIFICATION_TYPES = new Set<string>([CLIENT_METHODS.session_update]);

/**
 * Creates an ACP-compatible `Stream` backed by an Axon channel from
 * `@runloop/api-client`.
 *
 * The Axon wire format uses `event_type` as the method name and `payload`
 * as the params-level JSON. The ACP SDK's `ClientSideConnection` speaks
 * JSON-RPC 2.0. This function bridges the two by:
 *
 * - **Outbound**: Unwrapping JSON-RPC requests/notifications into axon
 *   publish envelopes (`event_type` + `payload`).
 * - **Inbound**: Wrapping axon events back into JSON-RPC messages using
 *   a method -> request-ID correlation map.
 *
 * @category Connection
 */
export function axonStream(options: AxonStreamOptions): Stream {
  const { axon, signal, onAxonEvent, onStreamInterrupted, log } = options;
  const onError = options.onError ?? defaultOnError;

  // Maps outbound JSON-RPC request method -> id so we can correlate
  // the broker's response (which only carries event_type, not an id).
  const pendingRequests = new Map<string, string | number | null>();

  // Maps outbound JSON-RPC response id -> the method of the agent-to-client
  // request we're responding to, so we can set the right event_type.
  const pendingClientRequests = new Map<string | number, string>();

  let nextAgentRequestId = 900_000;

  const readable = createReadable(
    axon,
    signal,
    pendingRequests,
    pendingClientRequests,
    onAxonEvent,
    () => nextAgentRequestId++,
    onError,
    onStreamInterrupted,
    log,
  );

  const writable = createWritable(axon, pendingRequests, pendingClientRequests, log);

  return { readable, writable };
}

// ---------------------------------------------------------------------------
// Readable: Axon SSE -> JSON-RPC AnyMessage
// ---------------------------------------------------------------------------

function createReadable(
  axon: Axon,
  signal: AbortSignal | undefined,
  pendingRequests: Map<string, string | number | null>,
  pendingClientRequests: Map<string | number, string>,
  onAxonEvent: ((event: AxonEventView) => void) | undefined,
  nextId: () => number,
  onError: (error: unknown) => void,
  onStreamInterrupted: (() => void) | undefined,
  log: ((tag: string, ...args: unknown[]) => void) | undefined,
): ReadableStream<AnyMessage> {
  return new ReadableStream<AnyMessage>({
    async start(controller) {
      let eventCount = 0;
      try {
        log?.("read", "opening SSE stream");
        const sseStream = await axon.subscribeSse();
        log?.("read", "SSE connected");
        for await (const axonEvent of sseStream) {
          if (signal?.aborted) break;
          eventCount++;

          onAxonEvent?.(axonEvent);

          if (axonEvent.origin !== "AGENT_EVENT") {
            log?.("read", `#${eventCount} SKIP ${axonEvent.origin} ${axonEvent.event_type}`);
            continue;
          }

          log?.("read", `#${eventCount} ${axonEvent.event_type}`);
          const msg = axonEventToJsonRpc(
            axonEvent,
            pendingRequests,
            pendingClientRequests,
            nextId,
            onError,
          );
          if (msg) controller.enqueue(msg);
        }
      } catch (err) {
        if (!signal?.aborted) {
          log?.("read", `error after ${eventCount} events: ${err}`);
          onStreamInterrupted?.();
          controller.error(err);
          return;
        }
      }
      log?.("read", `SSE ended after ${eventCount} events`);
      if (!signal?.aborted) {
        onStreamInterrupted?.();
      }
      controller.close();
    },
  });
}

function axonEventToJsonRpc(
  event: AxonEventView,
  pendingRequests: Map<string, string | number | null>,
  pendingClientRequests: Map<string | number, string>,
  nextId: () => number,
  onError: (error: unknown) => void,
): AnyMessage | null {
  const { event_type, payload } = event;

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch (err) {
    onError(err);
    return null;
  }

  // If the payload is already a full JSON-RPC message, pass it through.
  if (isJsonRpcMessage(parsed)) {
    return parsed as AnyMessage;
  }

  // Notification: session/update -> JSON-RPC notification
  if (NOTIFICATION_TYPES.has(event_type)) {
    return {
      jsonrpc: "2.0",
      method: event_type,
      params: parsed,
    };
  }

  // Response to a pending client -> agent request
  const requestId = pendingRequests.get(event_type);
  if (requestId !== undefined) {
    pendingRequests.delete(event_type);
    return {
      jsonrpc: "2.0",
      id: requestId,
      result: parsed,
    };
  }

  // Agent-to-client request (e.g. session/request_permission, fs/read_text_file).
  if (isClientMethod(event_type)) {
    const id = nextId();
    pendingClientRequests.set(id, event_type);
    return {
      jsonrpc: "2.0",
      id,
      method: event_type,
      params: parsed,
    };
  }

  // Unknown event_type with no pending request -- treat as notification.
  return {
    jsonrpc: "2.0",
    method: event_type,
    params: parsed,
  };
}

// ---------------------------------------------------------------------------
// Writable: JSON-RPC AnyMessage -> Axon Publish
// ---------------------------------------------------------------------------

function createWritable(
  axon: Axon,
  pendingRequests: Map<string, string | number | null>,
  pendingClientRequests: Map<string | number, string>,
  log: ((tag: string, ...args: unknown[]) => void) | undefined,
): WritableStream<AnyMessage> {
  return new WritableStream<AnyMessage>({
    async write(message) {
      const { eventType, payload } = jsonRpcToAxon(message, pendingRequests, pendingClientRequests);
      log?.("write", `event_type=${eventType}`);
      await axon.publish({
        event_type: eventType,
        origin: "USER_EVENT",
        payload,
        source: "broker-transport",
      });
    },
  });
}

function jsonRpcToAxon(
  message: AnyMessage,
  pendingRequests: Map<string, string | number | null>,
  pendingClientRequests: Map<string | number, string>,
): { eventType: string; payload: string } {
  // Request: { jsonrpc, id, method, params }
  if ("method" in message && "id" in message && message.id != null) {
    pendingRequests.set(message.method, message.id);
    return {
      eventType: message.method,
      payload: JSON.stringify(message.params ?? {}),
    };
  }

  // Notification: { jsonrpc, method, params } (no id)
  if ("method" in message) {
    return {
      eventType: message.method,
      payload: JSON.stringify(message.params ?? {}),
    };
  }

  // Response to an agent-to-client request: { jsonrpc, id, result/error }
  if ("id" in message && message.id != null) {
    const method = pendingClientRequests.get(message.id);
    if (method) {
      pendingClientRequests.delete(message.id);
    }
    const resultPayload =
      "result" in message ? message.result : "error" in message ? message.error : {};
    return {
      eventType: method ?? "response",
      payload: JSON.stringify(resultPayload),
    };
  }

  return { eventType: "unknown", payload: JSON.stringify(message) };
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

const CLIENT_METHOD_SET: Set<string> = new Set(Object.values(CLIENT_METHODS));

function isClientMethod(eventType: string): boolean {
  return CLIENT_METHOD_SET.has(eventType);
}

function isJsonRpcMessage(obj: unknown): boolean {
  return (
    typeof obj === "object" && obj !== null && (obj as Record<string, unknown>).jsonrpc === "2.0"
  );
}
