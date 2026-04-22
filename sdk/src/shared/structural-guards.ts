/**
 * Structural type guards for safely narrowing `unknown` values.
 *
 * These helpers provide reusable runtime checks for common shapes encountered
 * when parsing JSON payloads. They complement the protocol-specific guards
 * in the ACP and Claude modules by handling the initial "is this even an
 * object?" checks.
 *
 * @module
 */

/**
 * Type guard for non-null objects.
 *
 * After narrowing, the value can be safely indexed with string keys.
 *
 * @param value - The value to check.
 * @returns `true` if `value` is a non-null object.
 * @category Structural
 */
export function isNonNullObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Type guard for objects with a string `type` property.
 *
 * Many protocol messages use a `type` discriminator; this guard handles the
 * initial structural check before further narrowing.
 *
 * @param value - The value to check.
 * @returns `true` if `value` is an object with a string `type` property.
 * @category Structural
 */
export function hasStringType(value: unknown): value is { type: string } {
  return isNonNullObject(value) && typeof value.type === "string";
}

/**
 * Type guard for text content blocks (ACP or Claude style).
 *
 * Matches objects of the form `{ type: "text", text: string }`.
 *
 * @param value - The value to check.
 * @returns `true` if `value` is a text content block.
 * @category Structural
 */
export function isTextContentBlock(value: unknown): value is { type: "text"; text: string } {
  return (
    hasStringType(value) &&
    value.type === "text" &&
    typeof (value as { text?: unknown }).text === "string"
  );
}

/**
 * Safely extracts a string property from an unknown object.
 *
 * Returns `undefined` if the value is not an object or the property is not
 * a string.
 *
 * @param value - The value to extract from.
 * @param key - The property name to extract.
 * @returns The string value or `undefined`.
 * @category Structural
 */
export function getStringProp(value: unknown, key: string): string | undefined {
  if (!isNonNullObject(value)) return undefined;
  const prop = value[key];
  return typeof prop === "string" ? prop : undefined;
}

/**
 * Safely extracts an optional string property from an unknown object.
 *
 * Returns `undefined` if the value is not an object, the property is missing,
 * or the property is not a string.
 *
 * @param value - The value to extract from.
 * @param key - The property name to extract.
 * @returns The string value or `undefined`.
 * @category Structural
 */
export function getOptionalStringProp(value: unknown, key: string): string | undefined {
  if (!isNonNullObject(value)) return undefined;
  const prop = value[key];
  if (prop === undefined) return undefined;
  return typeof prop === "string" ? prop : undefined;
}

/**
 * Type guard for JSON-RPC 2.0 message ID.
 *
 * JSON-RPC IDs can be strings, numbers, or null. This guard checks for
 * the presence of an `id` property with a valid type.
 *
 * @param value - The value to check.
 * @returns `true` if `value` has a valid JSON-RPC `id` property.
 * @category Structural
 */
export function hasJsonRpcId(value: unknown): value is { id: string | number | null } {
  if (!isNonNullObject(value)) return false;
  const id = value.id;
  return id === null || typeof id === "string" || typeof id === "number";
}

/**
 * Safely extracts a JSON-RPC ID from an unknown object.
 *
 * Returns `undefined` if the value is not an object or does not have a
 * valid JSON-RPC ID.
 *
 * @param value - The value to extract from.
 * @returns The ID value or `undefined`.
 * @category Structural
 */
export function getJsonRpcId(value: unknown): string | number | null | undefined {
  if (!hasJsonRpcId(value)) return undefined;
  return value.id;
}

/**
 * Type guard for objects with a string `request_id` property.
 *
 * Common in control request/response messages.
 *
 * @param value - The value to check.
 * @returns `true` if `value` has a string `request_id` property.
 * @category Structural
 */
export function hasRequestId(value: unknown): value is { request_id: string } {
  return isNonNullObject(value) && typeof value.request_id === "string";
}

/**
 * Safely extracts a `request_id` from an unknown object.
 *
 * @param value - The value to extract from.
 * @returns The request_id string or `undefined`.
 * @category Structural
 */
export function getRequestId(value: unknown): string | undefined {
  if (!hasRequestId(value)) return undefined;
  return value.request_id;
}
