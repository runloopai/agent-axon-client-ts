import { describe, expect, it } from "vitest";
import { timelineEventGenerator } from "./timeline-generator.js";

describe("timelineEventGenerator", () => {
  it("yields events pushed by the subscriber", async () => {
    const ac = new AbortController();
    const events: string[] = [];

    const gen = timelineEventGenerator<string>((listener) => {
      listener("a");
      listener("b");
      return () => {};
    }, ac.signal);

    for await (const event of gen) {
      events.push(event);
      if (events.length === 2) ac.abort();
    }

    expect(events).toEqual(["a", "b"]);
  });

  it("terminates when the abort signal fires", async () => {
    const ac = new AbortController();
    const events: number[] = [];

    const gen = timelineEventGenerator<number>((listener) => {
      listener(1);
      setTimeout(() => {
        listener(2);
        ac.abort();
      }, 10);
      return () => {};
    }, ac.signal);

    for await (const event of gen) {
      events.push(event);
    }

    expect(events).toEqual([1, 2]);
  });

  it("calls unsubscribe when the generator finishes", async () => {
    const ac = new AbortController();
    let unsubscribed = false;

    const gen = timelineEventGenerator<string>((listener) => {
      listener("x");
      return () => {
        unsubscribed = true;
      };
    }, ac.signal);

    // Consume one event then abort
    for await (const _ of gen) {
      ac.abort();
    }

    expect(unsubscribed).toBe(true);
  });

  it("drains remaining queued events after abort", async () => {
    const ac = new AbortController();
    const events: string[] = [];

    const gen = timelineEventGenerator<string>((listener) => {
      listener("first");
      listener("second");
      listener("third");
      setTimeout(() => ac.abort(), 10);
      return () => {};
    }, ac.signal);

    for await (const event of gen) {
      events.push(event);
    }

    expect(events).toEqual(["first", "second", "third"]);
  });
});
