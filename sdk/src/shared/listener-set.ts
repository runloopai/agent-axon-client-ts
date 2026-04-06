/**
 * Generic listener set with error-isolated fan-out.
 *
 * Replaces the repeated `Set<Listener>` + `add/remove/emit` boilerplate
 * found in both the ACP and Claude connection classes.
 */

/**
 * A typed set of listeners with safe fan-out dispatch.
 *
 * Each call to {@link emit} iterates a snapshot of the current listeners,
 * wrapping each invocation in a try/catch so that one faulty listener
 * cannot prevent subsequent listeners from being called.
 *
 * @typeParam T - The listener function signature (must accept a single argument).
 *
 * @category Utilities
 */
export class ListenerSet<T extends (arg: never) => void> {
  private listeners = new Set<T>();
  private onError: (error: unknown) => void;

  constructor(onError: (error: unknown) => void) {
    this.onError = onError;
  }

  /** Registers a listener and returns an unsubscribe function. */
  add(listener: T): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Dispatches `arg` to every registered listener with error isolation. */
  emit(arg: Parameters<T>[0]): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(arg);
      } catch (err) {
        this.onError(err);
      }
    }
  }

  /** Removes all registered listeners. */
  clear(): void {
    this.listeners.clear();
  }

  /** Returns the number of registered listeners. */
  get size(): number {
    return this.listeners.size;
  }
}
