import { describe, expect, it } from "vitest";
import {
  getJsonRpcId,
  getRequestId,
  getStringProp,
  hasJsonRpcId,
  hasRequestId,
  hasStringType,
  isNonNullObject,
  isTextContentBlock,
} from "./structural-guards.js";

describe("isNonNullObject", () => {
  it("returns true for plain objects", () => {
    expect(isNonNullObject({})).toBe(true);
    expect(isNonNullObject({ key: "value" })).toBe(true);
  });

  it("returns false for null", () => {
    expect(isNonNullObject(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isNonNullObject(undefined)).toBe(false);
  });

  it("returns false for primitives", () => {
    expect(isNonNullObject("string")).toBe(false);
    expect(isNonNullObject(123)).toBe(false);
    expect(isNonNullObject(true)).toBe(false);
  });

  it("returns false for arrays", () => {
    expect(isNonNullObject([])).toBe(false);
    expect(isNonNullObject([1, 2, 3])).toBe(false);
  });
});

describe("hasStringType", () => {
  it("returns true for objects with string type property", () => {
    expect(hasStringType({ type: "text" })).toBe(true);
    expect(hasStringType({ type: "image", data: "base64" })).toBe(true);
  });

  it("returns false for objects without type property", () => {
    expect(hasStringType({})).toBe(false);
    expect(hasStringType({ kind: "text" })).toBe(false);
  });

  it("returns false for objects with non-string type property", () => {
    expect(hasStringType({ type: 123 })).toBe(false);
    expect(hasStringType({ type: null })).toBe(false);
    expect(hasStringType({ type: undefined })).toBe(false);
    expect(hasStringType({ type: { nested: true } })).toBe(false);
  });

  it("returns false for non-objects", () => {
    expect(hasStringType(null)).toBe(false);
    expect(hasStringType("string")).toBe(false);
    expect(hasStringType(123)).toBe(false);
  });
});

describe("isTextContentBlock", () => {
  it("returns true for valid text content blocks", () => {
    expect(isTextContentBlock({ type: "text", text: "Hello" })).toBe(true);
    expect(isTextContentBlock({ type: "text", text: "" })).toBe(true);
    expect(isTextContentBlock({ type: "text", text: "Hi", extra: "field" })).toBe(true);
  });

  it("returns false for non-text type", () => {
    expect(isTextContentBlock({ type: "image", text: "Hi" })).toBe(false);
    expect(isTextContentBlock({ type: "audio", text: "Hi" })).toBe(false);
  });

  it("returns false for missing text property", () => {
    expect(isTextContentBlock({ type: "text" })).toBe(false);
    expect(isTextContentBlock({ type: "text", content: "Hi" })).toBe(false);
  });

  it("returns false for non-string text property", () => {
    expect(isTextContentBlock({ type: "text", text: 123 })).toBe(false);
    expect(isTextContentBlock({ type: "text", text: null })).toBe(false);
    expect(isTextContentBlock({ type: "text", text: ["array"] })).toBe(false);
  });

  it("returns false for non-objects", () => {
    expect(isTextContentBlock(null)).toBe(false);
    expect(isTextContentBlock("text")).toBe(false);
  });
});

describe("getStringProp", () => {
  it("extracts string properties", () => {
    expect(getStringProp({ name: "Alice" }, "name")).toBe("Alice");
    expect(getStringProp({ id: "123", count: 5 }, "id")).toBe("123");
  });

  it("returns undefined for missing properties", () => {
    expect(getStringProp({}, "name")).toBeUndefined();
    expect(getStringProp({ other: "value" }, "name")).toBeUndefined();
  });

  it("returns undefined for non-string properties", () => {
    expect(getStringProp({ count: 123 }, "count")).toBeUndefined();
    expect(getStringProp({ flag: true }, "flag")).toBeUndefined();
    expect(getStringProp({ data: null }, "data")).toBeUndefined();
  });

  it("returns undefined for non-objects", () => {
    expect(getStringProp(null, "key")).toBeUndefined();
    expect(getStringProp("string", "length")).toBeUndefined();
    expect(getStringProp(123, "toString")).toBeUndefined();
  });
});

describe("hasJsonRpcId", () => {
  it("returns true for string IDs", () => {
    expect(hasJsonRpcId({ id: "abc-123" })).toBe(true);
    expect(hasJsonRpcId({ id: "" })).toBe(true);
  });

  it("returns true for number IDs", () => {
    expect(hasJsonRpcId({ id: 1 })).toBe(true);
    expect(hasJsonRpcId({ id: 0 })).toBe(true);
    expect(hasJsonRpcId({ id: -5 })).toBe(true);
  });

  it("returns true for null IDs", () => {
    expect(hasJsonRpcId({ id: null })).toBe(true);
  });

  it("returns false for missing ID", () => {
    expect(hasJsonRpcId({})).toBe(false);
    expect(hasJsonRpcId({ method: "test" })).toBe(false);
  });

  it("returns false for undefined ID", () => {
    expect(hasJsonRpcId({ id: undefined })).toBe(false);
  });

  it("returns false for non-objects", () => {
    expect(hasJsonRpcId(null)).toBe(false);
    expect(hasJsonRpcId("string")).toBe(false);
  });
});

describe("getJsonRpcId", () => {
  it("extracts string IDs", () => {
    expect(getJsonRpcId({ id: "abc" })).toBe("abc");
  });

  it("extracts number IDs", () => {
    expect(getJsonRpcId({ id: 42 })).toBe(42);
  });

  it("extracts null IDs", () => {
    expect(getJsonRpcId({ id: null })).toBeNull();
  });

  it("returns undefined for invalid inputs", () => {
    expect(getJsonRpcId({})).toBeUndefined();
    expect(getJsonRpcId(null)).toBeUndefined();
    expect(getJsonRpcId({ id: undefined })).toBeUndefined();
  });
});

describe("hasRequestId", () => {
  it("returns true for objects with string request_id", () => {
    expect(hasRequestId({ request_id: "req_001" })).toBe(true);
    expect(hasRequestId({ request_id: "", other: "field" })).toBe(true);
  });

  it("returns false for missing request_id", () => {
    expect(hasRequestId({})).toBe(false);
    expect(hasRequestId({ id: "123" })).toBe(false);
  });

  it("returns false for non-string request_id", () => {
    expect(hasRequestId({ request_id: 123 })).toBe(false);
    expect(hasRequestId({ request_id: null })).toBe(false);
  });

  it("returns false for non-objects", () => {
    expect(hasRequestId(null)).toBe(false);
    expect(hasRequestId("string")).toBe(false);
  });
});

describe("getRequestId", () => {
  it("extracts request_id from valid objects", () => {
    expect(getRequestId({ request_id: "req_001" })).toBe("req_001");
  });

  it("returns undefined for invalid inputs", () => {
    expect(getRequestId({})).toBeUndefined();
    expect(getRequestId({ request_id: 123 })).toBeUndefined();
    expect(getRequestId(null)).toBeUndefined();
  });
});
