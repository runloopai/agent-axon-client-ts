/**
 * Shared types and utilities used by both the ACP and Claude connection modules.
 *
 * @categoryDescription Types
 * Common types shared by both the ACP and Claude connection modules.
 *
 * @categoryDescription Utilities
 * Internal helpers for lifecycle management, logging, and listener dispatch.
 *
 * @module
 */

export { InitializationError } from "./errors/initialization-error.js";
export {
  isSystemError,
  SYSTEM_ERROR_EVENT_TYPE,
  SYSTEM_EVENT_ORIGIN,
  SystemError,
} from "./errors/system-error.js";
export { runDisconnectHook } from "./lifecycle.js";
export { ListenerSet } from "./listener-set.js";
export { makeDefaultOnError, makeLogger } from "./logging.js";

/** @category Types */
export type { AxonEventListener, AxonEventView, BaseConnectionOptions } from "./types.js";
