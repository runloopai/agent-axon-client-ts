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

/** Maps SDK message types to Axon event_type values for publishing. */
export const MESSAGE_TYPE_TO_EVENT_TYPE: Record<string, string> = {
  user: "query",
  assistant: "assistant",
  result: "result",
  system: "system",
  control_request: "control_request",
  control_response: "control_response",
};

/** Abstract transport interface matching the Python SDK's Transport ABC. */
export interface Transport {
  connect(): Promise<void>;
  write(data: string): Promise<void>;
  readMessages(): AsyncIterable<WireData>;
  close(): Promise<void>;
  isReady(): boolean;
}

/** Options for creating an AxonTransport. */
export interface AxonTransportOptions {
  /** If true, emit verbose logs to stderr. */
  verbose?: boolean;
}

/**
 * Transport implementation that communicates with a remote Claude Code
 * instance running on a Runloop Devbox via an Axon event channel.
 */
export class AxonTransport implements Transport {
  private axon: Axon;
  private verbose: boolean;

  private sseStream: Stream<AxonEventView> | null = null;
  private connected = false;
  private closed = false;

  constructor(axon: Axon, options?: AxonTransportOptions) {
    this.axon = axon;
    this.verbose = options?.verbose ?? false;
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

  /** Close the transport. */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.connected = false;
    this.log("close", "closing transport");

    // Abort the SSE stream so the read loop exits immediately
    // instead of blocking until the server closes the connection.
    if (this.sseStream) {
      this.sseStream.controller.abort();
      this.sseStream = null;
    }
  }

  isReady(): boolean {
    return this.connected && !this.closed;
  }
}
