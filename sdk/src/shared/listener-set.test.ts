import { describe, expect, it, vi } from "vitest";
import { ListenerSet } from "./listener-set.js";

describe("ListenerSet", () => {
  it("dispatches to all registered listeners", () => {
    const onError = vi.fn();
    const set = new ListenerSet<(n: number) => void>(onError);

    const calls: number[] = [];
    set.add((n) => calls.push(n));
    set.add((n) => calls.push(n * 10));

    set.emit(3);

    expect(calls).toEqual([3, 30]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("returns an unsubscribe function from add()", () => {
    const onError = vi.fn();
    const set = new ListenerSet<(n: number) => void>(onError);

    const calls: number[] = [];
    const unsub = set.add((n) => calls.push(n));
    set.emit(1);
    unsub();
    set.emit(2);

    expect(calls).toEqual([1]);
  });

  it("isolates errors so subsequent listeners still fire", () => {
    const onError = vi.fn();
    const set = new ListenerSet<(n: number) => void>(onError);

    const calls: number[] = [];
    set.add(() => {
      throw new Error("boom");
    });
    set.add((n) => calls.push(n));

    set.emit(5);

    expect(calls).toEqual([5]);
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  it("clear() removes all listeners", () => {
    const onError = vi.fn();
    const set = new ListenerSet<(n: number) => void>(onError);

    const calls: number[] = [];
    set.add((n) => calls.push(n));
    set.add((n) => calls.push(n));
    set.clear();
    set.emit(1);

    expect(calls).toEqual([]);
  });

  it("size reflects the current listener count", () => {
    const onError = vi.fn();
    const set = new ListenerSet<(n: number) => void>(onError);

    expect(set.size).toBe(0);

    const unsub1 = set.add(() => {});
    const unsub2 = set.add(() => {});
    expect(set.size).toBe(2);

    unsub1();
    expect(set.size).toBe(1);

    unsub2();
    expect(set.size).toBe(0);
  });

  it("emitting to an empty set is a no-op", () => {
    const onError = vi.fn();
    const set = new ListenerSet<(n: number) => void>(onError);

    set.emit(42);

    expect(onError).not.toHaveBeenCalled();
  });

  it("iterates a snapshot so mid-emit add does not cause extra calls", () => {
    const onError = vi.fn();
    const set = new ListenerSet<(n: number) => void>(onError);

    const calls: number[] = [];
    set.add((n) => {
      calls.push(n);
      set.add((m) => calls.push(m * 100));
    });

    set.emit(1);

    expect(calls).toEqual([1]);
  });
});
