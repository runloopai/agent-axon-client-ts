import type { AnyMessage, Stream } from "@agentclientprotocol/sdk";
import { CLIENT_METHODS } from "@agentclientprotocol/sdk";
import type { AxonEventView } from "@runloop/api-client/resources/axons";
import type { Axon } from "@runloop/api-client/sdk";
import type { AxonStreamOptions } from "./types.js";

/**
 * Fallback error handler used when no `onError` option is provided.
 *
 * @param error - The value that was thrown or failed to parse.
 */
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
 * @param options - Axon channel, abort signal, and event/error callbacks.
 * @returns A `Stream` (readable + writable pair) consumable by `ClientSideConnection`.
 *
 * @category Connection
 */
export function axonStream(options: AxonStreamOptions): Stream {
  const { axon, signal, onAxonEvent, log } = options;
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
    log,
  );

  const writable = createWritable(axon, pendingRequests, pendingClientRequests, onError, log);

  return { readable, writable };
}

// ---------------------------------------------------------------------------
// Readable: Axon SSE -> JSON-RPC AnyMessage
// ---------------------------------------------------------------------------

/**
 * Builds the readable half of the stream: subscribes to the Axon SSE feed
 * and converts each inbound event into a JSON-RPC `AnyMessage`.
 *
 * Events with `origin !== "AGENT_EVENT"` are skipped (they are our own
 * publishes echoed back). The stream closes when the SSE feed ends or
 * when the abort signal fires.
 *
 * @param axon                 - Axon channel to subscribe to.
 * @param signal               - Optional abort signal to cancel the subscription.
 * @param pendingRequests      - Shared map tracking outbound request method → JSON-RPC ID.
 * @param pendingClientRequests - Shared map tracking agent-to-client request ID → method.
 * @param onAxonEvent          - Optional callback fired for every raw Axon event.
 * @param nextId               - Factory that produces the next synthetic JSON-RPC ID for
 *   agent-to-client requests.
 * @param onError              - Error sink for unparseable payloads.
 * @returns A `ReadableStream` of JSON-RPC messages.
 */
function createReadable(
  axon: Axon,
  signal: AbortSignal | undefined,
  pendingRequests: Map<string, string | number | null>,
  pendingClientRequests: Map<string | number, string>,
  onAxonEvent: ((event: AxonEventView) => void) | undefined,
  nextId: () => number,
  onError: (error: unknown) => void,
  log: ((tag: string, ...args: unknown[]) => void) | undefined,
): ReadableStream<AnyMessage> {
  return new ReadableStream<AnyMessage>({
    async start(controller) {
      let totalEvents = 0;
      let attempt = 0;

      while (!signal?.aborted) {
        attempt++;
        let eventCount = 0;
        try {
          log?.("read", `opening SSE stream (attempt ${attempt})`);
          const sseStream = await axon.subscribeSse();
          log?.("read", "SSE connected");
          for await (const axonEvent of sseStream) {
            if (signal?.aborted) break;
            eventCount++;
            totalEvents++;

            onAxonEvent?.(axonEvent);

            if (axonEvent.origin !== "AGENT_EVENT") {
              log?.("read", `#${totalEvents} SKIP ${axonEvent.origin} ${axonEvent.event_type}`);
              continue;
            }

            log?.("read", `#${totalEvents} ${axonEvent.event_type}`);
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
          if (signal?.aborted) break;
          if (attempt === 1) {
            console.warn(
              `[axonStream] SSE stream error after ${eventCount} events, re-subscribing...`,
              err,
            );
            continue;
          }
          log?.("read", `error on reconnect attempt after ${eventCount} events: ${err}`);
          controller.error(err);
          return;
        }

        if (signal?.aborted) break;

        if (attempt === 1) {
          console.warn(
            `[axonStream] SSE stream ended after ${eventCount} events, re-subscribing...`,
          );
          continue;
        }
        break;
      }

      pendingRequests.clear();
      pendingClientRequests.clear();
      log?.("read", `SSE ended after ${totalEvents} total events`);
      controller.close();
    },
  });
}

/**
 * Converts a single inbound Axon event into a JSON-RPC message.
 *
 * Resolution order:
 * 1. If the payload is already a full JSON-RPC envelope, pass through.
 * 2. If `event_type` is a known notification (e.g. `session/update`),
 *    wrap as a JSON-RPC notification.
 * 3. If `event_type` matches a pending outbound request, wrap as a
 *    JSON-RPC response and consume the pending entry.
 * 4. If `event_type` is a known client method, wrap as an agent-to-client
 *    JSON-RPC request with a synthetic ID.
 * 5. Otherwise, treat as an unknown notification.
 *
 * @param event                - The raw Axon event from the SSE feed.
 * @param pendingRequests      - Shared map tracking outbound request method → JSON-RPC ID.
 * @param pendingClientRequests - Shared map tracking agent-to-client request ID → method.
 * @param nextId               - Factory that produces the next synthetic JSON-RPC ID.
 * @param onError              - Error sink for unparseable payloads.
 * @returns The translated JSON-RPC message, or `null` if the payload could not be parsed.
 */
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
    return parsed;
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

/**
 * Builds the writable half of the stream: converts outbound JSON-RPC
 * messages into Axon publish calls.
 *
 * @param axon                 - Axon channel to publish to.
 * @param pendingRequests      - Shared map tracking outbound request method → JSON-RPC ID.
 * @param pendingClientRequests - Shared map tracking agent-to-client request ID → method.
 * @returns A `WritableStream` that accepts JSON-RPC messages.
 */
function createWritable(
  axon: Axon,
  pendingRequests: Map<string, string | number | null>,
  pendingClientRequests: Map<string | number, string>,
  onError: (error: unknown) => void,
  log: ((tag: string, ...args: unknown[]) => void) | undefined,
): WritableStream<AnyMessage> {
  return new WritableStream<AnyMessage>({
    async write(message) {
      const { eventType, payload } = jsonRpcToAxon(message, pendingRequests, pendingClientRequests);
      log?.("write", `event_type=${eventType}`);
      try {
        await axon.publish({
          event_type: eventType,
          origin: "USER_EVENT",
          payload,
          source: "acp-sdk-client",
        });
      } catch (err) {
        onError(err);
        throw err;
      }
    },
  });
}

/**
 * Converts an outbound JSON-RPC message into an Axon publish envelope.
 *
 * - **Requests** (`id` + `method`): records the method → ID mapping in
 *   `pendingRequests` for response correlation, then publishes with
 *   `event_type = method`.
 * - **Notifications** (`method`, no `id`): publishes directly with
 *   `event_type = method`.
 * - **Responses** (`id`, no `method`): looks up the originating method
 *   from `pendingClientRequests` and publishes with that `event_type`.
 *
 * @param message              - The JSON-RPC message to convert.
 * @param pendingRequests      - Shared map tracking outbound request method → JSON-RPC ID.
 * @param pendingClientRequests - Shared map tracking agent-to-client request ID → method.
 * @returns An `eventType` + serialized `payload` ready for `axon.publish()`.
 */
function jsonRpcToAxon(
  message: AnyMessage,
  pendingRequests: Map<string, string | number | null>,
  pendingClientRequests: Map<string | number, string>,
): { eventType: string; payload: string } {
  // Request: { jsonrpc, id, method, params }
  if ("method" in message && "id" in message && message.id != null) {
    if (pendingRequests.has(message.method)) {
      throw new Error(
        `[axonStream] Duplicate in-flight request for method "${message.method}". ` +
          "Only one outstanding request per method is supported; " +
          "await the first call before sending another.",
      );
    }
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

/** Pre-computed set of all ACP client method names for O(1) lookup. */
const CLIENT_METHOD_SET: Set<string> = new Set(Object.values(CLIENT_METHODS));

/**
 * Checks whether `eventType` is a known ACP client-side method
 * (i.e. a method the agent can call on the client).
 *
 * @param eventType - The Axon `event_type` string to test.
 * @returns `true` if the event type matches a known client method.
 */
function isClientMethod(eventType: string): boolean {
  return CLIENT_METHOD_SET.has(eventType);
}

/**
 * Checks whether a parsed JSON value is a complete JSON-RPC 2.0 envelope
 * (has `jsonrpc: "2.0"`). Used to detect pre-wrapped payloads that should
 * be passed through without further translation.
 *
 * @param obj - The parsed payload to inspect.
 * @returns `true` if `obj` looks like a JSON-RPC 2.0 message.
 */
function isJsonRpcMessage(obj: unknown): obj is AnyMessage {
  if (typeof obj !== "object" || obj === null) return false;
  const record = obj as Record<string, unknown>;
  return (
    record.jsonrpc === "2.0" && ("method" in record || "result" in record || "error" in record)
  );
}
