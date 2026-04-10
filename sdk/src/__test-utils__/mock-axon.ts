import type { AxonEventView } from "@runloop/api-client/resources/axons";
import { vi } from "vitest";
import { SYSTEM_EVENT_ORIGIN } from "../shared/errors/system-error.js";

export interface MockAxonEvent {
  event_type: string;
  payload: string;
  origin: string;
  sequence?: number;
}

function makeEvent(
  origin: "AGENT_EVENT" | "USER_EVENT" | "SYSTEM_EVENT" | "EXTERNAL_EVENT",
  eventType: string,
  payload: unknown,
  sequence?: number,
): MockAxonEvent {
  return {
    event_type: eventType,
    payload: JSON.stringify(payload),
    origin,
    ...(sequence != null ? { sequence } : {}),
  };
}

export const makeAgentEvent = (et: string, p: unknown, s?: number) =>
  makeEvent("AGENT_EVENT", et, p, s);
export const makeUserEvent = (et: string, p: unknown, s?: number) =>
  makeEvent("USER_EVENT", et, p, s);
export const makeSystemEvent = (et: string, p: unknown, s?: number) =>
  makeEvent("SYSTEM_EVENT", et, p, s);
export const makeExternalEvent = (et: string, p: unknown, s?: number) =>
  makeEvent("EXTERNAL_EVENT", et, p, s);

/**
 * Creates a full {@link AxonEventView} with sensible defaults.
 * Used across test suites that need a complete event shape
 * (timeline classification, user-message extraction, etc.).
 */
export function makeFullAxonEvent(overrides: Partial<AxonEventView> = {}): AxonEventView {
  return {
    axon_id: "axn_test",
    event_type: "turn.started",
    origin: "SYSTEM_EVENT",
    payload: "{}",
    sequence: 1,
    source: "test",
    timestamp_ms: Date.now(),
    ...overrides,
  };
}

export function makeRawSystemEvent(
  eventType: string,
  payload: string,
  sequence?: number,
): MockAxonEvent {
  return {
    event_type: eventType,
    payload,
    origin: SYSTEM_EVENT_ORIGIN,
    ...(sequence != null ? { sequence } : {}),
  };
}

export interface MockSseStream extends AsyncIterable<MockAxonEvent> {
  controller?: { abort: ReturnType<typeof vi.fn> };
}

/**
 * Creates an async-iterable SSE stream that can be driven imperatively.
 * Call `push(event)` to enqueue, `end()` to signal stream completion.
 *
 * @param withController - If true, adds a `controller: { abort }` property
 *   to the stream object (needed for AxonTransport tests).
 */
export function createControllableStream(withController = false) {
  const buffer: MockAxonEvent[] = [];
  let waiter: ((v: IteratorResult<MockAxonEvent>) => void) | null = null;
  let done = false;

  function flush() {
    if (waiter && buffer.length > 0) {
      const resolve = waiter;
      waiter = null;
      resolve({ value: buffer.shift() as MockAxonEvent, done: false });
    }
  }

  const stream: MockSseStream = {
    [Symbol.asyncIterator](): AsyncIterator<MockAxonEvent> {
      return {
        next(): Promise<IteratorResult<MockAxonEvent>> {
          if (buffer.length > 0) {
            return Promise.resolve({ value: buffer.shift() as MockAxonEvent, done: false });
          }
          if (done) {
            return Promise.resolve({ value: undefined as never, done: true });
          }
          return new Promise((resolve) => {
            waiter = resolve;
          });
        },
      };
    },
  };

  if (withController) {
    stream.controller = { abort: vi.fn() };
  }

  return {
    stream,
    push(event: MockAxonEvent) {
      buffer.push(event);
      flush();
    },
    end() {
      done = true;
      if (waiter) {
        const resolve = waiter;
        waiter = null;
        resolve({ value: undefined as never, done: true });
      }
    },
  };
}

export type PublishCall = {
  event_type: string;
  payload: string;
  origin: string;
  source: string;
};

export function createMockAxon(
  sseStreamOrCtrl: ReturnType<typeof createControllableStream> | MockSseStream,
) {
  const stream = "stream" in sseStreamOrCtrl ? sseStreamOrCtrl.stream : sseStreamOrCtrl;

  const published: PublishCall[] = [];
  const axon = {
    id: "test-axon",
    subscribeSse: vi.fn().mockResolvedValue(stream),
    publish: vi.fn().mockImplementation(async (data: PublishCall) => {
      published.push(data);
    }),
  };
  return { axon, published };
}

/** Collect all messages from a ReadableStream until it closes. */
export async function drain<T>(stream: ReadableStream<T>): Promise<T[]> {
  const reader = stream.getReader();
  const items: T[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    items.push(value);
  }
  return items;
}
