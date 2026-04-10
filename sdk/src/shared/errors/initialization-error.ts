/**
 * Error thrown when connection initialization fails.
 *
 * This error wraps transport, HTTP, or system errors that occur during the
 * `initialize()` handshake, giving callers a single typed error to catch.
 *
 * @category Errors
 */
export class InitializationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "InitializationError";
  }
}
