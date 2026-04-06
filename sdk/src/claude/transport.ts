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
  connect(): Promise<void>;
  write(data: string): Promise<void>;
  readMessages(): AsyncIterable<WireData>;
  close(): Promise<void>;
  abortStream(): void;
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
  private axon: Axon;
  private verbose: boolean;
  private onAxonEvent?: (event: AxonEventView) => void;

  private sseStream: Stream<AxonEventView> | null = null;
  private connected = false;
  private closed = false;

  constructor(axon: Axon, options?: AxonTransportOptions) {
    this.axon = axon;
    this.verbose = options?.verbose ?? false;
    this.onAxonEvent = options?.onAxonEvent;
  }

  private log(tag: string, ...args: unknown[]): void {
    if (!this.verbose) return;
    const ts = new Date().toISOString().slice(11, 23);
    console.error(`[${ts}] [axon-transport:${tag}]`, ...args);
  }

  /** Connect to the Axon SSE stream. */
  async connect(): Promise<void> {
    this.log("connect", `axon=${this.axon.id}`);
    this.sseStream = await this.axon.subscribeSse();
    this.connected = true;
    this.log("connect", "SSE connected");
  }

  /** Resolve the Axon event_type for a given message JSON string. */
  private resolveEventType(data: string): string {
    try {
      const parsed: { type?: string } = JSON.parse(data);
      const msgType = parsed.type;
      return MESSAGE_TYPE_TO_EVENT_TYPE[msgType ?? ""] ?? msgType ?? "query";
    } catch {
      return "query";
    }
  }

  /** Write a JSON message string to the Axon channel. */
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
   * Only AGENT_EVENT messages are yielded (USER_EVENTs are our own publishes).
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
   * Abort the SSE stream without marking the transport as closed.
   * The read loop will exit, but the transport can still be used
   * for publishing (write). Useful for reconnect scenarios.
   */
  abortStream(): void {
    if (this.sseStream) {
      this.log("abortStream", "aborting SSE stream");
      this.sseStream.controller.abort();
      this.sseStream = null;
    }
  }

  /** Close the transport. */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.connected = false;
    this.log("close", "closing transport");
    this.abortStream();
  }

  isReady(): boolean {
    return this.connected && !this.closed;
  }
}
