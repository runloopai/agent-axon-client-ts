import { vi } from "vitest";

export interface MockAxonEvent {
  event_type: string;
  payload: string;
  origin: string;
  sequence?: number;
}

export function makeAgentEvent(
  eventType: string,
  payload: unknown,
  sequence?: number,
): MockAxonEvent {
  return {
    event_type: eventType,
    payload: JSON.stringify(payload),
    origin: "AGENT_EVENT",
    ...(sequence != null ? { sequence } : {}),
  };
}

export function makeUserEvent(
  eventType: string,
  payload: unknown,
  sequence?: number,
): MockAxonEvent {
  return {
    event_type: eventType,
    payload: JSON.stringify(payload),
    origin: "USER_EVENT",
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

/**
 * Creates a mock Axon with a controllable SSE stream.
 *
 * Returns a `signal` that automatically aborts when `subscribeSse` is called
 * a second time (i.e. on reconnect). Pass this signal to `axonStream()` in
 * tests that call `drain()` so the reconnect loop terminates cleanly.
 */
export function createMockAxon(
  sseStreamOrCtrl: ReturnType<typeof createControllableStream> | MockSseStream,
) {
  const stream = "stream" in sseStreamOrCtrl ? sseStreamOrCtrl.stream : sseStreamOrCtrl;

  const abortController = new AbortController();
  let firstCall = true;

  const published: PublishCall[] = [];
  const axon = {
    id: "test-axon",
    subscribeSse: vi.fn().mockImplementation(async () => {
      if (firstCall) {
        firstCall = false;
        return stream;
      }
      abortController.abort();
      return stream;
    }),
    publish: vi.fn().mockImplementation(async (data: PublishCall) => {
      published.push(data);
    }),
  };
  return { axon, published, signal: abortController.signal };
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
