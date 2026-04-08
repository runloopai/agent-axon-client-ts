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

export {
  isSystemError,
  SystemError,
  SYSTEM_ERROR_EVENT_TYPE,
  SYSTEM_EVENT_ORIGIN,
} from "./errors/system-error.js";
export { BadRequestError, HttpError, UnauthorizedError } from "./errors/http-errors.js";
export { runDisconnectHook } from "./lifecycle.js";
export { ListenerSet } from "./listener-set.js";
export { makeDefaultOnError, makeLogger } from "./logging.js";

/** @category Types */
export type {
  AxonEventListener,
  AxonEventView,
  BaseConnectionOptions,
} from "./types.js";
