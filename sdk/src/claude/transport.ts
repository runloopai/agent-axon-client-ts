/**
 * Transport layer — abstracts the communication channel to a remote Claude Code instance.
 *
 * The `AxonTransport` implementation uses Runloop Axon for bidirectional
 * communication: outbound messages are published via `axon.publish()`, and
 * inbound messages arrive via `axon.subscribeSse()`.
 *
 * This mirrors the Python SDK's `Transport` ABC but is tailored for Axon.
 */

import type { AxonEventView } from "@runloop/api-client/resources/axons";
import type { Axon } from "@runloop/api-client/sdk";
import type { Stream } from "@runloop/api-client/streaming";
import type { WireData } from "./types.js";

/**
 * Maps SDK message types to Axon event_type values for publishing.
 * @category Transport
 */
export const MESSAGE_TYPE_TO_EVENT_TYPE: Record<string, string> = {
  user: "query",
  assistant: "assistant",
  result: "result",
  system: "system",
  control_request: "control_request",
  control_response: "control_response",
};

/**
 * Abstract transport interface matching the Python SDK's Transport ABC.
 * @category Transport
 */
export interface Transport {
  /** Opens the underlying connection (e.g. subscribes to the SSE stream). */
  connect(): Promise<void>;

  /**
   * Publishes a serialized JSON message to the remote agent.
   * @param data - The JSON string to send.
   */
  write(data: string): Promise<void>;

  /**
   * Returns an async iterable of parsed wire messages from the agent.
   * Only agent-origin messages are yielded; echoed user events are filtered.
   *
   * @throws If called before {@link connect}.
   */
  readMessages(): AsyncIterable<WireData>;

  /**
   * Permanently closes the transport. After calling, {@link isReady}
   * returns `false` and no further reads or writes are possible.
   */
  close(): Promise<void>;

  /**
   * Aborts the SSE stream without marking the transport as permanently
   * closed. The read loop will exit, but {@link write} may still work.
   */
  abortStream(): void;

  /**
   * Returns whether the transport is connected and not closed.
   * @returns `true` if the transport can send and receive messages.
   */
  isReady(): boolean;
}

/**
 * Options for creating an AxonTransport.
 * @category Transport
 */
export interface AxonTransportOptions {
  /** If true, emit verbose logs to stderr. */
  verbose?: boolean;
  /** Called for every Axon event (before origin filtering). */
  onAxonEvent?: (event: AxonEventView) => void;
}

/**
 * Transport implementation that communicates with a remote Claude Code
 * instance running on a Runloop Devbox via an Axon event channel.
 *
 * @category Transport
 */
export class AxonTransport implements Transport {
  /** The Axon channel used for publishing and subscribing. */
  private axon: Axon;

  /** Whether verbose diagnostic logging is enabled. */
  private verbose: boolean;

  /** Optional callback fired for every raw Axon event (before origin filtering). */
  private onAxonEvent?: (event: AxonEventView) => void;

  /** The active SSE subscription, or `null` before connect / after abort. */
  private sseStream: Stream<AxonEventView> | null = null;

  /** Whether {@link connect} has been called successfully. */
  private connected = false;

  /** Whether {@link close} has been called. */
  private closed = false;

  /**
   * Creates a new Axon-backed transport.
   *
   * @param axon    - The Axon channel to communicate over.
   * @param options - Optional verbose flag and raw event callback.
   */
  constructor(axon: Axon, options?: AxonTransportOptions) {
    this.axon = axon;
    this.verbose = options?.verbose ?? false;
    this.onAxonEvent = options?.onAxonEvent;
  }

  /**
   * Writes a timestamped diagnostic line to stderr when verbose mode is on.
   *
   * @param tag  - Short label identifying the subsystem (e.g. "connect", "read").
   * @param args - Values to log after the tag.
   */
  private log(tag: string, ...args: unknown[]): void {
    if (!this.verbose) return;
    const ts = new Date().toISOString().slice(11, 23);
    console.error(`[${ts}] [axon-transport:${tag}]`, ...args);
  }

  /**
   * Subscribes to the Axon SSE stream, making the transport ready for
   * reading and writing.
   */
  async connect(): Promise<void> {
    this.log("connect", `axon=${this.axon.id}`);
    this.sseStream = await this.axon.subscribeSse();
    this.connected = true;
    this.log("connect", "SSE connected");
  }

  /**
   * Determines the Axon `event_type` for an outbound message by parsing
   * its JSON `type` field and mapping it via {@link MESSAGE_TYPE_TO_EVENT_TYPE}.
   * Falls back to `"query"` on parse failure or unknown types.
   *
   * @param data - The raw JSON string to inspect.
   * @returns The resolved `event_type` string.
   */
  private resolveEventType(data: string): string {
    try {
      const parsed: { type?: string } = JSON.parse(data);
      const msgType = parsed.type;
      return MESSAGE_TYPE_TO_EVENT_TYPE[msgType ?? ""] ?? msgType ?? "query";
    } catch {
      return "query";
    }
  }

  /**
   * Publishes a serialized JSON message to the Axon channel.
   *
   * @param data - The JSON string to send. Its `type` field is used to
   *   derive the Axon `event_type`.
   */
  async write(data: string): Promise<void> {
    if (!this.isReady()) {
      throw new Error("Transport is not ready. Call connect() first or check isReady().");
    }
    const eventType = this.resolveEventType(data);
    this.log("write", `event_type=${eventType}`);
    await this.axon.publish({
      event_type: eventType,
      origin: "USER_EVENT",
      payload: data,
      source: "claude-sdk-client",
    });
  }

  /**
   * Async generator that yields parsed JSON messages from the SSE stream.
   * Only `AGENT_EVENT` messages are yielded — `USER_EVENT`s (our own
   * publishes echoed back) are skipped.
   *
   * @yields Parsed {@link WireData} objects from the agent.
   * @throws If called before {@link connect}.
   */
  async *readMessages(): AsyncGenerator<WireData> {
    if (!this.sseStream) {
      throw new Error("Transport not connected. Call connect() first.");
    }

    let eventCount = 0;
    for await (const event of this.sseStream) {
      if (this.closed) break;
      eventCount++;

      this.onAxonEvent?.(event);

      if (event.origin === "AGENT_EVENT") {
        this.log("read", `#${eventCount} ${event.event_type}`);
        try {
          const parsed = JSON.parse(event.payload);
          yield parsed;
        } catch {
          this.log("read", `#${eventCount} failed to parse payload`);
        }
      } else {
        this.log("read", `#${eventCount} SKIP ${event.origin} ${event.event_type}`);
      }
    }
    this.log("read", `SSE ended after ${eventCount} events`);
  }

  /**
   * Aborts the SSE stream without marking the transport as permanently
   * closed. The read loop will exit, but {@link write} may still work.
   * Useful for reconnect scenarios.
   */
  abortStream(): void {
    if (this.sseStream) {
      this.log("abortStream", "aborting SSE stream");
      this.sseStream.controller.abort();
      this.sseStream = null;
    }
  }

  /**
   * Permanently closes the transport by aborting the SSE stream and
   * marking the connection as closed. Idempotent.
   */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.connected = false;
    this.log("close", "closing transport");
    this.abortStream();
  }

  /**
   * Returns whether the transport is connected and not closed.
   *
   * @returns `true` if the transport can send and receive messages.
   */
  isReady(): boolean {
    return this.connected && !this.closed;
  }
}
